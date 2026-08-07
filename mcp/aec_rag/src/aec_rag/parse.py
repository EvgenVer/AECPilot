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
    pages. An empty ``locator`` means the citation can only name the file, which
    is what the spec's edge case prescribes for a DOCX preamble sitting above
    the first heading.
    """

    locator: dict[str, int | str]
    markdown: str


@dataclass(frozen=True)
class ParsedDocument:
    doctype: str
    markdown: str
    segments: tuple[ParsedSegment, ...]


def build_converter() -> DocumentConverter:
    """Build a Docling converter. It serves every format Docling handles; only
    the PDF pipeline needs options of ours.

    Two settings are deliberate, not defaults:

    * ``compile_torch_models = False``. Docling compiles the layout model with
      ``torch.compile`` by default, which needs a C++ toolchain — on Windows,
      MSVC. Measured 2026-08-07 on this machine: without it every conversion
      dies with ``InductorError: InvalidCxxCompiler: Compiler: cl is not
      found``. Our users are engineers, not developers; a Visual Studio install
      cannot be a precondition for opening a PDF.
    * ``do_ocr = False``. Scanned PDFs are task 2.3, after the engine
      measurement in 2.2 picks a default. Until then a scan simply yields no
      text rather than silently going through whichever engine Docling ships.
    """
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.datamodel.settings import settings as docling_settings
    from docling.document_converter import DocumentConverter, PdfFormatOption

    docling_settings.inference.compile_torch_models = False

    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = False

    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
    )


def _convert(path: Path, converter: DocumentConverter | None) -> DoclingDocument:
    converter = converter if converter is not None else build_converter()
    try:
        return converter.convert(path).document
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
    """
    path = Path(path)
    document = _convert(path, converter)
    segments = tuple(
        ParsedSegment(
            locator={"page": page_no},
            markdown=document.export_to_markdown(page_no=page_no).strip(),
        )
        for page_no in range(1, document.num_pages() + 1)
    )
    return ParsedDocument(
        doctype="pdf",
        markdown=document.export_to_markdown().strip(),
        segments=segments,
    )


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
