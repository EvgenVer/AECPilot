"""Chunker over the markdown produced by :mod:`aec_rag.parse` (task 2.6).

Three rules, in the order they matter (specs/qa-over-sources.md, Data schemas):

1. **A chunk never loses its locator.** It inherits the one from the segment it
   came from and gains the nearest heading when the segment has inner headings —
   a citation that cannot say *where* is not a citation.
2. **A table is never split.** Half a table answers a question wrongly rather
   than incompletely: the header row and the row with the number end up in
   different chunks, and whichever one is retrieved reads as complete.
3. **Everything else is packed up to a size limit**, on paragraph boundaries.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from aec_rag.parse import ParsedDocument, split_by_headings

# Deliberately in characters, not tokens: the embedding model is chosen in task
# 2.8 and every tokenizer counts differently, so a character budget is the only
# honest unit available right now. Revisit together with the model choice.
DEFAULT_MAX_CHARS = 2000

_BLOCK_SEPARATOR = "\n\n"


@dataclass(frozen=True)
class Chunk:
    text: str
    locator: dict[str, int | str] = field(default_factory=dict)
    is_table: bool = False


def _is_table_line(line: str) -> bool:
    return line.lstrip().startswith("|")


def _blocks(markdown: str) -> list[tuple[str, bool]]:
    """Split ``markdown`` into ``(text, is_table)`` blocks.

    A run of consecutive table lines is one block; ordinary text breaks on blank
    lines. Blocks are the smallest thing the packer is allowed to move, which is
    how rule 2 is enforced — a table block is simply never handed to the splitter.
    """
    blocks: list[tuple[str, bool]] = []
    buffer: list[str] = []
    buffer_is_table = False

    for line in markdown.splitlines():
        is_table = _is_table_line(line)
        if is_table != buffer_is_table or (not is_table and not line.strip()):
            text = "\n".join(buffer).strip()
            if text:
                blocks.append((text, buffer_is_table))
            buffer = []
            buffer_is_table = is_table
            if not line.strip():
                continue
        buffer.append(line)

    text = "\n".join(buffer).strip()
    if text:
        blocks.append((text, buffer_is_table))
    return blocks


def _split_oversized(text: str, max_chars: int) -> list[str]:
    """Cut a too-long text block on line boundaries, hard-cutting a single line
    that is longer than the limit on its own (a wall of text with no newline in
    it does exist — an OCR'd page, a one-paragraph appendix).
    """
    if len(text) <= max_chars:
        return [text]

    pieces: list[str] = []
    current: list[str] = []
    length = 0
    for line in text.splitlines():
        while len(line) > max_chars:
            if current:
                pieces.append("\n".join(current))
                current, length = [], 0
            pieces.append(line[:max_chars])
            line = line[max_chars:]
        if current and length + len(line) + 1 > max_chars:
            pieces.append("\n".join(current))
            current, length = [], 0
        current.append(line)
        length += len(line) + 1
    if current:
        pieces.append("\n".join(current))
    return [piece for piece in pieces if piece.strip()]


def _pack(
    blocks: list[tuple[str, bool]], locator: dict[str, int | str], max_chars: int
) -> list[Chunk]:
    chunks: list[Chunk] = []
    current: list[str] = []
    current_has_table = False
    length = 0

    def flush() -> None:
        nonlocal current, current_has_table, length
        if current:
            chunks.append(
                Chunk(
                    text=_BLOCK_SEPARATOR.join(current),
                    locator=dict(locator),
                    is_table=current_has_table,
                )
            )
        current, current_has_table, length = [], False, 0

    for text, is_table in blocks:
        pieces = [text] if is_table else _split_oversized(text, max_chars)
        for piece in pieces:
            if current and length + len(piece) + len(_BLOCK_SEPARATOR) > max_chars:
                flush()
            current.append(piece)
            length += len(piece) + len(_BLOCK_SEPARATOR)
            current_has_table = current_has_table or is_table

    flush()
    return chunks


def chunk_document(document: ParsedDocument, *, max_chars: int = DEFAULT_MAX_CHARS) -> list[Chunk]:
    """Turn a parsed document into chunks ready for indexing.

    ``is_table`` marks a chunk that carries tabular data — the question «сколько
    по ведомости» is answered from a different kind of text than prose, and the
    retriever gets to know which it is holding.
    """
    chunks: list[Chunk] = []
    for segment in document.segments:
        for heading, body in split_by_headings(segment.markdown):
            locator = dict(segment.locator)
            if heading is not None and "heading" not in locator:
                locator["heading"] = heading
            chunks.extend(_pack(_blocks(body), locator, max_chars))
    return chunks
