"""Conversion of a source document into markdown plus locators.

A PDF is read in two speeds (task 3H.13–3H.14, docs/plan-details.md §3H item C): its text layer
first, page by page, with pypdfium2 — under a second for a 300-page report — and
then, in the background, only the pages without a usable layer are rendered and
recognised with RapidOCR. Docling is no longer used for PDFs: measured
2026-10-07 it took about 8 s per page and returned an empty picture on scanned
pages that carry a frame stamp in their text layer. DOCX, XLSX and CSV still go
through Docling; MD and TXT are read as text (D-199).

See docs/history/specs/qa-over-sources.md (Data schemas): every chunk carries a ``locator``
pointing back at the place in the original document. Which place that is depends
on the format — a PDF has pages, a DOCX has none and only headings — so parsing
produces a uniform sequence of segments, each labelled with the coarsest locator
its format actually has. Splitting those segments further (by size, keeping
tables whole) is the chunker's job, task 2.6.

Docling drags torch and the layout model in with it (~6.5 s of import time and
about a gigabyte of RSS), so its imports live inside the functions: `aec-rag
scan` is spawned on every scheduler tick and must not pay for a parser it does
not use.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Iterator, Sequence

    from docling.document_converter import DocumentConverter
    from docling_core.types.doc import DoclingDocument


class ParseError(RuntimeError):
    """Raised when Docling could not turn the file into a document."""


@dataclass(frozen=True)
class ParsedSegment:
    """A piece of the original document together with the place it came from.

    ``locator`` follows docs/history/specs/qa-over-sources.md: ``{"page": n}`` for PDFs
    (1-based, i.e. the number a person reads in a viewer — that is what a
    citation has to survive), ``{"heading": text}`` for formats that have no
    pages, ``{"sheet": name, "range": "A1:B3"}`` for spreadsheets. An empty
    ``locator`` means the citation can only name the file, which is what the
    spec's edge case prescribes for a DOCX preamble sitting above the first
    heading, and for a CSV, which is one table and nothing else.
    """

    locator: dict[str, int | str]
    markdown: str


@dataclass(frozen=True)
class ParsedDocument:
    doctype: str
    markdown: str
    segments: tuple[ParsedSegment, ...]
    # PDF pages without a usable text layer, 1-based. Their segments are empty
    # for now; the second pass recognises them and adds their chunks later.
    pending_pages: tuple[int, ...] = ()


def build_converter(*, ocr: bool = True) -> DocumentConverter:
    """Build a Docling converter. It serves every format Docling handles; only
    the PDF pipeline needs options of ours.

    Three settings are deliberate, not defaults:

    * ``compile_torch_models = False``. Docling compiles the layout model with
      ``torch.compile`` by default, which needs a C++ toolchain — on Windows,
      MSVC. Measured 2026-08-07 on this machine: without it every conversion
      dies with ``InductorError: InvalidCxxCompiler: Compiler: cl is not
      found``. Our users are engineers, not developers; a Visual Studio install
      cannot be a precondition for opening a PDF.
    * **The OCR engine is named, not defaulted.** RapidOCR's own default is a
      Chinese model, and Docling's is `lang=["chinese"]` on the onnxruntime
      backend. `eslav` (East Slavic, PP-OCRv5) is the measurement's winner —
      see `eval/ocr-report.md` and docs/plan-details.md §Risks R4. The measured alternative
      that ships without any extra install, `cyrillic` on the torch backend,
      returns Latin/Cyrillic mush on Russian technical text and is not an
      acceptable fallback.
    * ``force_full_page_ocr`` stays off. A page that already has a text layer
      keeps it — its own text beats anything OCR can reconstruct — and a page
      that is nothing but a bitmap gets recognised because there is no text
      covering it. Turning it on would re-recognise good text and pay for the
      privilege.

    ``ocr=False`` exists for callers that know they are handling text-layer
    documents and would rather not load the recognition models.
    """
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions
    from docling.datamodel.settings import settings as docling_settings
    from docling.document_converter import DocumentConverter, PdfFormatOption

    docling_settings.inference.compile_torch_models = False

    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = ocr
    if ocr:
        pipeline_options.ocr_options = RapidOcrOptions(lang=["eslav"], backend="onnxruntime")

    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
    )


def _convert(path: Path, converter: DocumentConverter | None) -> DoclingDocument:
    """Convert ``path``, handing Docling a stream rather than the path itself.

    Measured 2026-08-14 on real project documents: Docling's default PDF
    backend (``docling-parse``) fails on **any** path containing a non-ASCII
    character — in the file name or in a directory above it — with
    «docling-parse could not load document». Our users' files are named
    `02-ПЗ-Нагатинская 297-1.pdf` and live in `D:\\проекты\\ЖК …`, so on the
    path route most of a real project simply would not index.

    A stream sidesteps it entirely and keeps ``docling-parse`` (its cell
    extraction is better than the pypdfium2 fallback's). The name is still
    passed through — Docling picks the format from its suffix, and a Cyrillic
    name in the stream is fine; only the filesystem path was the problem.

    Cost, stated plainly: the file is read into memory whole. Bounded by the
    indexer's existing size cap (``indexer.DEFAULT_MAX_SIZE``, 200 MiB).
    """
    from docling.datamodel.base_models import DocumentStream

    converter = converter if converter is not None else build_converter()
    try:
        stream = DocumentStream(name=path.name, stream=BytesIO(path.read_bytes()))
        return converter.convert(stream).document
    except Exception as exc:
        raise ParseError(f"не удалось разобрать {path}: {exc}") from exc


_ATX_HEADING = re.compile(r"^\s{0,3}(#{1,6})\s+(.*\S)\s*$")


def split_by_headings(markdown: str) -> list[tuple[str | None, str]]:
    """Split ``markdown`` at its headings into ``(heading, body)`` sections.

    The heading line stays inside its own body: a chunk that says «0,4 кВ»
    without saying which section it came from is worth much less to both the
    reader and the retriever. Text above the first heading forms a section with
    ``heading = None``. Fenced code blocks are tracked so a ``#`` comment inside
    one is not mistaken for a heading.
    """
    sections: list[tuple[str | None, list[str]]] = [(None, [])]
    in_fence = False

    for line in markdown.splitlines():
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            sections[-1][1].append(line)
            continue
        match = None if in_fence else _ATX_HEADING.match(line)
        if match is None:
            sections[-1][1].append(line)
        else:
            sections.append((match.group(2), [line]))

    result = [(heading, "\n".join(body).strip()) for heading, body in sections]
    return [(heading, body) for heading, body in result if heading is not None or body]


# A page counts as having a usable text layer when it holds at least this many
# letters and digits, and they make up at least this share of its visible
# characters. Measured 2026-10-07 on the ИГИ reports (docs/plan-details.md §3H item C): a scanned
# page whose layer is only the frame stamp carries 64–69 letters, a page of real
# text runs into the hundreds and thousands. A font with a broken encoding gives
# plenty of characters but few letters — the share catches that.
TEXT_LAYER_MIN_LETTERS = 200
TEXT_LAYER_MIN_SHARE = 0.6


def usable_text_layer(
    text: str,
    *,
    min_letters: int = TEXT_LAYER_MIN_LETTERS,
    min_share: float = TEXT_LAYER_MIN_SHARE,
) -> bool:
    """Whether a page's text layer is worth indexing as it is."""
    visible = [ch for ch in text if not ch.isspace()]
    letters = sum(1 for ch in visible if ch.isalnum())
    return letters >= min_letters and letters >= min_share * len(visible)


def _clean_layer(text: str) -> str:
    """pdfium's text: CRLF line ends and the odd control character for a soft
    hyphen. Keep the lines, drop the rest."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return "".join(ch for ch in text if ch == "\n" or ch == "\t" or ch.isprintable()).strip()


def _open_pdf(path: Path):
    """Open ``path`` with pdfium from its bytes — the same reason as
    :func:`_convert`: a Cyrillic path is ordinary here, and bytes sidestep every
    question about how a native library spells it."""
    import pypdfium2 as pdfium

    try:
        return pdfium.PdfDocument(path.read_bytes())
    except (pdfium.PdfiumError, OSError) as exc:
        raise ParseError(f"не удалось открыть {path}: {exc}") from exc


def parse_pdf(
    path: Path | str,
    *,
    min_letters: int = TEXT_LAYER_MIN_LETTERS,
    min_share: float = TEXT_LAYER_MIN_SHARE,
) -> ParsedDocument:
    """Read a PDF's text layer, one segment per page — the first pass.

    A page whose layer is not usable (see :func:`usable_text_layer`) keeps its
    place in the sequence with an empty ``markdown`` and is listed in
    ``pending_pages``: drop it and every citation after it points one page
    short, and keep its stamp text and the search finds a frame instead of a
    page.
    """
    path = Path(path)
    pdf = _open_pdf(path)
    pages: list[str] = []
    pending: list[int] = []
    try:
        for index in range(len(pdf)):
            page = pdf[index]
            textpage = page.get_textpage()
            text = _clean_layer(textpage.get_text_range())
            textpage.close()
            page.close()
            if usable_text_layer(text, min_letters=min_letters, min_share=min_share):
                pages.append(text)
            else:
                pages.append("")
                pending.append(index + 1)
    except Exception as exc:  # pdfium raises its own error types per call
        raise ParseError(f"не удалось прочитать {path}: {exc}") from exc
    finally:
        pdf.close()

    return ParsedDocument(
        doctype="pdf",
        markdown="\n\n".join(text for text in pages if text),
        segments=tuple(
            ParsedSegment(locator={"page": page_no}, markdown=text)
            for page_no, text in enumerate(pages, start=1)
        ),
        pending_pages=tuple(pending),
    )


# Rendering for recognition: 300 dpi, the resolution the measurement ran at,
# but never more than this many pixels on the long side — an A1 sheet at 300
# dpi is 70 megapixels, and the detector resizes it down anyway.
OCR_DPI = 300
OCR_MAX_SIDE = 5000

_ocr_reader = None


def _cpu_device(accelerator_device: str, supported_devices=None) -> str:
    """Docling's `decide_device` without torch: the answer it gives on every machine
    we ship to. Docling imports torch only to ask it for CUDA, MPS or XPU, and the
    torch our lock used to carry was the CPU build (`2.13.0+cpu`, no CUDA built in),
    so the answer was always "cpu". torch — about 15 000 files of the installed tree —
    is out of the lock since task T43.1."""
    return "cpu"


def _reader():
    """RapidOCR with the `eslav` model, built the way Docling builds it (docs/plan-details.md
    §Risks R4) — through their class, so the language and the model files stay
    exactly what they were. Loads once per process, about 4 s.

    Their class picks the device through `decide_device`, which imports torch; it
    gets :func:`_cpu_device` for the length of the construction instead."""
    global _ocr_reader
    if _ocr_reader is None:
        from unittest import mock

        from docling.datamodel.accelerator_options import AcceleratorOptions
        from docling.datamodel.pipeline_options import RapidOcrOptions
        from docling.models.stages.ocr import rapid_ocr_model

        with mock.patch.object(rapid_ocr_model, "decide_device", _cpu_device):
            model = rapid_ocr_model.RapidOcrModel(
                enabled=True,
                artifacts_path=None,
                options=RapidOcrOptions(lang=["eslav"], backend="onnxruntime"),
                accelerator_options=AcceleratorOptions(),
            )
        _ocr_reader = model.reader
    return _ocr_reader


def recognize_pages(
    path: Path | str, pages: Sequence[int]
) -> Iterator[tuple[int, str | ParseError]]:
    """The second pass: render each of ``pages`` and recognise it.

    Yields ``(page, text)`` page by page, so the caller stores and reports each
    one as it lands — a stopped run keeps every page it finished. A page that
    fails yields a :class:`ParseError` instead of ending the file.
    """
    import numpy as np

    path = Path(path)
    reader = _reader()
    pdf = _open_pdf(path)
    try:
        for page_no in pages:
            try:
                page = pdf[page_no - 1]
                width, height = page.get_size()
                scale = min(OCR_DPI / 72, OCR_MAX_SIDE / max(width, height, 1))
                image = page.render(scale=scale).to_pil().convert("RGB")
                page.close()
                result = reader(np.asarray(image))
                yield page_no, "\n".join(result.txts or ())
            except Exception as exc:  # one bad page must not cost the rest
                yield page_no, ParseError(f"страница {page_no} не распознана: {exc}")
    finally:
        pdf.close()


def parse_docx(path: Path | str, *, converter: DocumentConverter | None = None) -> ParsedDocument:
    """Convert ``path`` into markdown, one segment per heading section.

    A DOCX has no pages — Docling reports ``num_pages() == 0``, because page
    breaks are a property of how Word renders the file, not of the file — so the
    heading is the only locator the format offers (docs/history/specs/qa-over-sources.md,
    edge case «Locator недоступен»).
    """
    path = Path(path)
    document = _convert(path, converter)
    markdown = document.export_to_markdown().strip()
    segments = tuple(
        ParsedSegment(
            locator={"heading": heading} if heading is not None else {},
            markdown=body,
        )
        for heading, body in split_by_headings(markdown)
    )
    return ParsedDocument(doctype="docx", markdown=markdown, segments=segments)


def read_text(path: Path) -> str:
    """A plain-text file's contents: UTF-8 (with or without BOM), else
    Windows-1251 — the encoding Russian notes written in Notepad before 2019
    still arrive in. Anything else is not text we can trust to quote."""
    data = path.read_bytes()
    for encoding in ("utf-8-sig", "cp1251"):
        try:
            text = data.decode(encoding)
        except UnicodeDecodeError:
            continue
        # cp1251 decodes almost any bytes; a NUL says it was not text at all.
        if "\x00" not in text:
            return text
    raise ParseError(f"файл не похож на текст: {path.name}")


def parse_text(path: Path | str) -> ParsedDocument:
    """A ``.md`` or ``.txt`` file (D-199, owner's decision 2026-10-09).

    Markdown has headings and nothing else to point at, so it is split the way
    a DOCX is and every segment carries its heading. Plain text has no
    structure at all: one segment, the citation names the file, and the
    chunker cuts it by size.
    """
    path = Path(path)
    text = read_text(path).replace("\r\n", "\n").strip()
    suffix = path.suffix.lower()
    if suffix == ".md":
        segments = tuple(
            ParsedSegment(
                locator={"heading": heading} if heading is not None else {},
                markdown=body,
            )
            for heading, body in split_by_headings(text)
        )
    else:
        segments = (ParsedSegment(locator={}, markdown=text),) if text else ()
    return ParsedDocument(doctype=suffix.lstrip("."), markdown=text, segments=segments)


SUPPORTED_SUFFIXES = frozenset({".pdf", ".docx", ".xlsx", ".csv", ".md", ".txt"})


def parse_file(path: Path | str, *, converter: DocumentConverter | None = None) -> ParsedDocument:
    """Parse ``path`` with the reader its format needs.

    Anything outside :data:`SUPPORTED_SUFFIXES` raises: a project holds drawings,
    archives and models too, and «indexed» has to mean the text was actually
    read, not that the file was seen.
    """
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return parse_pdf(path)
    if suffix == ".docx":
        return parse_docx(path, converter=converter)
    if suffix in {".xlsx", ".csv"}:
        return parse_spreadsheet(path, converter=converter)
    if suffix in {".md", ".txt"}:
        return parse_text(path)
    raise ParseError(f"формат {suffix or '(без расширения)'} не индексируется: {path.name}")


def parse_whole(path: Path | str) -> ParsedDocument:
    """Both passes at once, for a caller that needs one file's text now.

    `wiki_add_raw` is that caller: a person asked for this one file, and its
    scanned pages are part of what they asked for — there is no background run
    to finish them later. A page that cannot be recognised stays empty and stays
    in ``pending_pages``.
    """
    path = Path(path)
    parsed = parse_file(path)
    if not parsed.pending_pages:
        return parsed
    texts = {
        page: text
        for page, text in recognize_pages(path, parsed.pending_pages)
        if isinstance(text, str)
    }
    segments = tuple(
        ParsedSegment(locator=segment.locator, markdown=texts[number])
        if (number := int(segment.locator.get("page", 0))) in texts
        else segment
        for segment in parsed.segments
    )
    return ParsedDocument(
        doctype=parsed.doctype,
        markdown="\n\n".join(segment.markdown for segment in segments if segment.markdown),
        segments=segments,
        pending_pages=tuple(page for page in parsed.pending_pages if page not in texts),
    )


def _column_letter(index: int) -> str:
    """0-based column index → spreadsheet column name (0 → ``A``, 26 → ``AA``)."""
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(ord("A") + remainder) + letters
    return letters


def _sheet_range(bbox) -> str | None:
    """Docling's grid bounding box → an ``A1:B3`` range, or ``None`` if empty.

    The box is 0-based, top-left, and half-open on the right and bottom:
    measured 2026-08-07, a table occupying ``C5:D6`` comes back as
    ``l=2 t=4 r=4 b=6``.
    """
    left, top, right, bottom = int(bbox.l), int(bbox.t), int(bbox.r), int(bbox.b)
    if right <= left or bottom <= top:
        return None
    return f"{_column_letter(left)}{top + 1}:{_column_letter(right - 1)}{bottom}"


def parse_spreadsheet(
    path: Path | str, *, converter: DocumentConverter | None = None
) -> ParsedDocument:
    """Convert an XLSX or CSV into markdown, one segment per table.

    Docling turns every worksheet into a page and hangs its tables under a group
    named after the sheet, so both halves of the locator the spec asks for —
    sheet and range — are recoverable without opening the file a second time.
    A sheet holding no table produces no segment: there is nothing there to cite.

    A CSV is a single table with no provenance at all, so its segment carries an
    empty locator and the citation names the file.
    """
    from docling_core.types.doc import TableItem

    path = Path(path)
    document = _convert(path, converter)
    sheet_names = {group.self_ref: group.name for group in document.groups}

    segments: list[ParsedSegment] = []
    for item, _level in document.iterate_items():
        if not isinstance(item, TableItem):
            continue
        locator: dict[str, int | str] = {}
        sheet = sheet_names.get(item.parent.cref) if item.parent is not None else None
        if sheet is not None:
            locator["sheet"] = sheet
        if item.prov:
            cell_range = _sheet_range(item.prov[0].bbox)
            if cell_range is not None:
                locator["range"] = cell_range
        segments.append(
            ParsedSegment(locator=locator, markdown=item.export_to_markdown(document).strip())
        )

    return ParsedDocument(
        doctype=path.suffix.lstrip(".").lower(),
        markdown=document.export_to_markdown().strip(),
        segments=tuple(segments),
    )
