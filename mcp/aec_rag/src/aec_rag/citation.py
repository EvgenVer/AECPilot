"""Citation strings — ``[src: <source_id>/<rel_path>#<locator>]`` (task 2.7, O4).

The locator uses each format's own address notation, so a citation stays
readable to the person it is shown to: ``p12`` for a PDF page,
``Ведомость!C5:D6`` for a spreadsheet (exactly what Excel itself puts in its
address bar), ``h:Кабельный журнал`` for a heading in a format that has no
pages. A place that cannot be named at all produces no ``#`` part.

Both directions live here: the skill writes citations (2.12), and the eval
runner has to check that a citation points at something real (2.16). The
renderer parses the same grammar in TypeScript (2.13).
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field

_HEADING_PREFIX = "h:"
_PAGE = re.compile(r"^p(\d+)$")

# `source_id` is a single path segment, so the first slash separates it from the
# relative path; the locator runs to the closing bracket.
# `[` is excluded from the path and the locator on purpose: without it a
# citation missing its closing bracket swallows the next one whole, and the
# reader loses a reference that was written correctly (measured on the
# renderer's twin of this grammar, task 2.13).
_CITATION = re.compile(
    r"\[src:\s*(?P<source>[^/\]\s][^/\]]*)/(?P<path>[^\]#\[]+?)(?:#(?P<loc>[^\]\[]*))?\]"
)

# A citation is delimited by `]` and split on `#`, so neither can survive inside
# a heading. Cutting at the first one is deliberate: the viewer matches the
# heading by prefix anyway, and a truncated anchor still lands on the right
# section, whereas an escaped one would match nothing in the document.
_HEADING_STOP = re.compile(r"[\]#\r\n]")


@dataclass(frozen=True)
class Citation:
    source_id: str
    rel_path: str
    locator: dict[str, int | str] = field(default_factory=dict)


def format_locator(locator: Mapping[str, int | str]) -> str | None:
    """Render a locator, or ``None`` when the place cannot be named.

    A page wins over a heading when a chunk carries both: the page is the thing
    a viewer can actually open, and the heading is context the reader already
    sees on that page.
    """
    page = locator.get("page")
    if page is not None:
        return f"p{page}"

    sheet = locator.get("sheet")
    if sheet is not None:
        cell_range = locator.get("range")
        return f"{sheet}!{cell_range}" if cell_range else str(sheet)

    heading = locator.get("heading")
    if heading is not None:
        trimmed = _HEADING_STOP.split(str(heading), maxsplit=1)[0].strip()
        if trimmed:
            return f"{_HEADING_PREFIX}{trimmed}"

    return None


def parse_locator(text: str) -> dict[str, int | str]:
    """Inverse of :func:`format_locator`; an unrecognisable locator yields ``{}``.

    Precedence resolves the one ambiguity this notation has — a worksheet
    literally named ``p12`` or starting with ``h:`` would be read as a page or a
    heading. Left as is: such a sheet name has never been seen in a real
    project, and the alternative was a notation nobody can read.
    """
    text = text.strip()
    if not text:
        return {}

    page = _PAGE.match(text)
    if page is not None:
        return {"page": int(page.group(1))}

    if text.startswith(_HEADING_PREFIX):
        heading = text[len(_HEADING_PREFIX) :].strip()
        return {"heading": heading} if heading else {}

    sheet, separator, cell_range = text.partition("!")
    sheet = sheet.strip()
    if not sheet:
        return {}
    if separator and cell_range.strip():
        return {"sheet": sheet, "range": cell_range.strip()}
    return {"sheet": sheet}


# Locator keys each format can actually carry. A DOCX has no pages — Word paints
# them at print time, the file has none — so `#p94` on a `.docx` is an anchor the
# model invented by analogy with the PDF citations beside it (measured in the
# eval baseline, task 2.17: right answer, right file, link to nowhere). Asking
# the model not to do it is a request; dropping what the format cannot hold is
# mechanical, and the citation falls back to naming the file — which is what the
# spec prescribes when a place cannot be named.
_LOCATOR_KEYS = {
    "csv": (),
    "docx": ("heading",),
    "pdf": ("page", "heading"),
    "xlsx": ("sheet", "range"),
}


def sanitize_locator(rel_path: str, locator: Mapping[str, int | str]) -> dict[str, int | str]:
    """Drop locator parts the file's format cannot have."""
    extension = rel_path.rsplit(".", 1)[-1].lower() if "." in rel_path else ""
    allowed = _LOCATOR_KEYS.get(extension)
    if allowed is None:
        return dict(locator)
    cleaned = {key: locator[key] for key in allowed if key in locator}
    if "range" in cleaned and "sheet" not in cleaned:
        del cleaned["range"]
    return cleaned


def format_citation(
    source_id: str, rel_path: str, locator: Mapping[str, int | str] | None = None
) -> str:
    rendered = format_locator(locator or {})
    body = f"{source_id}/{rel_path}"
    return f"[src: {body}#{rendered}]" if rendered else f"[src: {body}]"


def parse_citations(text: str) -> list[Citation]:
    """Pull every citation out of an answer, skipping anything malformed.

    Silence rather than an exception is the right failure here: this runs over
    model output, and one broken bracket must not cost the reader the other
    citations in the same answer.
    """
    citations: list[Citation] = []
    for match in _CITATION.finditer(text):
        rel_path = match.group("path").strip()
        if not rel_path:
            continue
        citations.append(
            Citation(
                source_id=match.group("source").strip(),
                rel_path=rel_path,
                locator=sanitize_locator(rel_path, parse_locator(match.group("loc") or "")),
            )
        )
    return citations
