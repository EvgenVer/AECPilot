"""Docling-backed conversion of a source document into markdown plus locators.

See specs/qa-over-sources.md (Data schemas): every chunk carries a ``locator``
pointing back at the place in the original document — for PDFs that is the page
number, which is what this module preserves. Chunking itself is task 2.6; here a
document is only split into pages, each with its own markdown.

Docling drags torch and the layout model in with it (~6.5 s of import time and
about a gigabyte of RSS), so its imports live inside the functions: `aec-rag
scan` is spawned on every scheduler tick and must not pay for a parser it does
not use.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from docling.document_converter import DocumentConverter


class ParseError(RuntimeError):
    """Raised when Docling could not turn the file into a document."""


@dataclass(frozen=True)
class ParsedPage:
    """One page of the original document. ``page_no`` is 1-based, i.e. the same
    number a person reads in a viewer — that is what a citation has to survive.
    A page carrying no extractable text keeps its place in the sequence with an
    empty ``markdown``, so page numbers never drift.
    """

    page_no: int
    markdown: str


@dataclass(frozen=True)
class ParsedDocument:
    doctype: str
    markdown: str
    pages: tuple[ParsedPage, ...]


def build_converter() -> DocumentConverter:
    """Build a Docling converter configured for text-layer PDFs.

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


def parse_pdf(path: Path | str, *, converter: DocumentConverter | None = None) -> ParsedDocument:
    """Convert ``path`` into markdown, page by page.

    ``converter`` is accepted so a caller processing many files builds one and
    reuses it: constructing a converter loads the layout model, which is the
    expensive part (about 12 s here against 6.5 s for the conversion itself).
    """
    path = Path(path)
    converter = converter if converter is not None else build_converter()

    try:
        result = converter.convert(path)
    except Exception as exc:
        raise ParseError(f"не удалось разобрать {path}: {exc}") from exc

    document = result.document
    pages = tuple(
        ParsedPage(page_no=page_no, markdown=document.export_to_markdown(page_no=page_no).strip())
        for page_no in range(1, document.num_pages() + 1)
    )
    return ParsedDocument(
        doctype="pdf",
        markdown=document.export_to_markdown().strip(),
        pages=pages,
    )
