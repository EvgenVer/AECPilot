"""Docling-backed conversion of a source document into markdown plus locators.

See specs/qa-over-sources.md (Data schemas): every chunk carries a ``locator``
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
    from docling.document_converter import DocumentConverter
    from docling_core.types.doc import DoclingDocument


class ParseError(RuntimeError):
    """Raised when Docling could not turn the file into a document."""


@dataclass(frozen=True)
class ParsedSegment:
    """A piece of the original document together with the place it came from.

    ``locator`` follows specs/qa-over-sources.md: ``{"page": n}`` for PDFs
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
      see `eval/ocr-report.md` and PLAN §Risks R4. The measured alternative
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


def parse_pdf(path: Path | str, *, converter: DocumentConverter | None = None) -> ParsedDocument:
    """Convert ``path`` into markdown, one segment per page.

    A page with no extractable text keeps its place in the sequence with an
    empty ``markdown``: drop it and every citation after it points one page
    short.

    ``converter`` is accepted so a caller processing many files builds one and
    reuses it: constructing a converter loads the layout model, which is the
    expensive part (about 12 s here against 6.5 s for the conversion itself).

    **One serialization, not one per page.** ``export_to_markdown(page_no=n)``
    filters a full walk of the document, so calling it per page is quadratic in
    the page count. Measured 2026-08-15 on a real drawing set: conversion took
    55 minutes and this loop had not finished 45 minutes later, on a document
    Docling had already parsed. Serializing once with a page-break marker and
    splitting is a single pass, and the marker keeps the alignment the locators
    depend on.
    """
    path = Path(path)
    document = _convert(path, converter)
    markdown = document.export_to_markdown(page_break_placeholder=_PAGE_BREAK)
    pages = _split_pages(document, markdown)
    return ParsedDocument(
        doctype="pdf",
        markdown=markdown.replace(_PAGE_BREAK, "").strip(),
        segments=tuple(
            ParsedSegment(locator={"page": page_no}, markdown=text)
            for page_no, text in enumerate(pages, start=1)
        ),
    )


# Not a string that can occur in a document: it is an HTML comment, and the
# markdown serializer emits our own text verbatim.
_PAGE_BREAK = "<!-- aec-page-break -->"


def _split_pages(document: DoclingDocument, markdown: str) -> list[str]:
    """One markdown per page, in page order.

    Falls back to the per-page export when the split does not line up with the
    page count. That fallback is the slow path the docstring above is about, and
    it exists because the alternative is worse: a document whose markers do not
    align would silently shift every locator after the first missing page, and a
    citation off by a page is a citation that sends the reader to the wrong
    place while looking perfectly valid.
    """
    total = document.num_pages()
    parts = [part.strip() for part in markdown.split(_PAGE_BREAK)]
    if len(parts) == total:
        return parts
    return [document.export_to_markdown(page_no=page_no).strip() for page_no in range(1, total + 1)]


def parse_docx(path: Path | str, *, converter: DocumentConverter | None = None) -> ParsedDocument:
    """Convert ``path`` into markdown, one segment per heading section.

    A DOCX has no pages — Docling reports ``num_pages() == 0``, because page
    breaks are a property of how Word renders the file, not of the file — so the
    heading is the only locator the format offers (specs/qa-over-sources.md,
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


SUPPORTED_SUFFIXES = frozenset({".pdf", ".docx", ".xlsx", ".csv"})


def parse_file(path: Path | str, *, converter: DocumentConverter | None = None) -> ParsedDocument:
    """Parse ``path`` with the reader its format needs.

    Anything outside :data:`SUPPORTED_SUFFIXES` raises: a project holds drawings,
    archives and models too, and «indexed» has to mean the text was actually
    read, not that the file was seen.
    """
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return parse_pdf(path, converter=converter)
    if suffix == ".docx":
        return parse_docx(path, converter=converter)
    if suffix in {".xlsx", ".csv"}:
        return parse_spreadsheet(path, converter=converter)
    raise ParseError(f"формат {suffix or '(без расширения)'} не индексируется: {path.name}")


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
