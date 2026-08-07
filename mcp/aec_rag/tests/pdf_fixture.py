"""Builds a minimal text-layer PDF in memory, so the parsing tests do not need
a binary fixture checked into the repository (task 2.1).

Deliberately ASCII-only: the standard-14 Helvetica used here carries no
Cyrillic glyphs, and embedding a TrueType font with a ToUnicode CMap just to
say "привет" would be more fixture than test. Cyrillic extraction is covered
where it can be expressed directly — the DOCX/XLSX fixtures (2.4, 2.5) and the
OCR scans (2.2, 2.3).
"""

from __future__ import annotations

from collections.abc import Sequence


def _escape(text: str) -> bytes:
    escaped = text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    return escaped.encode("ascii")


def build_text_pdf(page_lines: Sequence[Sequence[str]]) -> bytes:
    """Return an uncompressed PDF with one page per entry of ``page_lines``.

    Each entry is the list of text lines drawn on that page, top to bottom.
    """
    objects: dict[int, bytes] = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        3: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    }

    page_nums = [4 + 2 * i for i in range(len(page_lines))]
    content_nums = [5 + 2 * i for i in range(len(page_lines))]

    kids = b" ".join(b"%d 0 R" % num for num in page_nums)
    objects[2] = b"<< /Type /Pages /Kids [" + kids + b"] /Count %d >>" % len(page_lines)

    for page_num, content_num, lines in zip(page_nums, content_nums, page_lines, strict=True):
        objects[page_num] = (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>" % content_num
        )
        body = b"BT /F1 14 Tf 72 720 Td 18 TL\n"
        for line in lines:
            body += b"(" + _escape(line) + b") Tj T*\n"
        body += b"ET\n"
        objects[content_num] = b"<< /Length %d >>\nstream\n" % len(body) + body + b"endstream"

    out = bytearray(b"%PDF-1.4\n")
    offsets: dict[int, int] = {}
    for num in sorted(objects):
        offsets[num] = len(out)
        out += b"%d 0 obj\n" % num + objects[num] + b"\nendobj\n"

    xref_offset = len(out)
    size = max(objects) + 1
    out += b"xref\n0 %d\n" % size
    out += b"0000000000 65535 f \n"
    for num in range(1, size):
        out += b"%010d 00000 n \n" % offsets[num]
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (size, xref_offset)
    return bytes(out)
