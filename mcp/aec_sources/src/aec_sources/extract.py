"""Task T78 (UR52): a source document as text, without the index.

The reader is the indexer's (`aec_rag.parse.parse_whole`): the same text the
index would hold, PDF pages labelled so the agent can cite them, scanned pages
recognised on the spot. Its import is deferred — Docling and the OCR stack are
heavy, and `aec-sources` starts for every session while most sessions never
extract anything.
"""

from __future__ import annotations

from pathlib import Path

# Large enough for a typical report section, small enough not to flood the
# model's context. A longer document is read by page ranges.
EXTRACT_MAX_CHARS = 200_000


def _page_range(pages: list[int] | None) -> tuple[int, int] | None:
    if pages is None:
        return None
    if len(pages) != 2 or any(not isinstance(p, int) for p in pages):
        raise ValueError("pages must be [first, last], 1-based page numbers")
    first, last = pages
    if first < 1 or last < first:
        raise ValueError(f"invalid page range {pages!r}: need 1 <= first <= last")
    return first, last


def _label(locator: dict[str, int | str]) -> str:
    if "page" in locator:
        return f"[страница {locator['page']}]"
    if "sheet" in locator:
        cells = f" {locator['range']}" if locator.get("range") else ""
        return f"[лист {locator['sheet']}{cells}]"
    return ""


def extract_text(path: Path, pages: list[int] | None = None) -> str:
    """The text of ``path``, PDF pages labelled; raises ``ValueError`` in words."""
    from aec_rag.parse import SUPPORTED_SUFFIXES, ParseError, parse_whole

    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        supported = ", ".join(sorted(SUPPORTED_SUFFIXES))
        raise ValueError(
            f"format {suffix or '(no extension)'} cannot be extracted as text; "
            f"supported: {supported}"
        )
    wanted = _page_range(pages)
    if wanted is not None and suffix != ".pdf":
        raise ValueError("pages applies to PDF files only")

    try:
        parsed = parse_whole(path)
    except ParseError as exc:
        raise ValueError(str(exc)) from exc

    page_count = sum(1 for s in parsed.segments if "page" in s.locator)
    parts: list[str] = []
    for segment in parsed.segments:
        page = segment.locator.get("page")
        if wanted is not None and isinstance(page, int) and not wanted[0] <= page <= wanted[1]:
            continue
        label = _label(segment.locator)
        body = segment.markdown.strip() or "(страница без распознанного текста)"
        parts.append(f"{label}\n{body}" if label else body)

    header: list[str] = []
    if suffix == ".pdf":
        shown = f", показаны {wanted[0]}–{wanted[1]}" if wanted else ""
        header.append(f"PDF: {page_count} стр.{shown}")
    if parsed.pending_pages:
        header.append("не распознаны страницы: " + ", ".join(str(p) for p in parsed.pending_pages))

    text = "\n\n".join(([" · ".join(header)] if header else []) + parts)
    if len(text) > EXTRACT_MAX_CHARS:
        text = (
            text[:EXTRACT_MAX_CHARS]
            + f"\n\n[обрезано на {EXTRACT_MAX_CHARS} символах — читайте по диапазону pages]"
        )
    return text
