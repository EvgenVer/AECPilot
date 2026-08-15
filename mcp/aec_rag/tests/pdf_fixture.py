"""Builds PDFs in memory, so the parsing tests do not need binary fixtures
checked into the repository (tasks 2.1, 2.3).

Two shapes: one with a real text layer, one that is nothing but a picture of
the same page — the difference the OCR path exists for.

Deliberately ASCII-only: the standard-14 Helvetica used here carries no
Cyrillic glyphs, and embedding a TrueType font with a ToUnicode CMap just to
say "привет" would be more fixture than test. Cyrillic extraction is covered
where it can be expressed directly — the DOCX/XLSX fixtures (2.4, 2.5) — and
Cyrillic *paths*, which turned out to be the real trap, have their own test.
"""

from __future__ import annotations

from collections.abc import Sequence
from io import BytesIO

PAGE_WIDTH = 612
PAGE_HEIGHT = 792


def _escape(text: str) -> bytes:
    escaped = text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    return escaped.encode("ascii")


def _serialise(objects: dict[int, bytes]) -> bytes:
    """Write numbered objects out as a PDF with a correct xref table."""
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


def _stream(dictionary: bytes, payload: bytes) -> bytes:
    return dictionary + b"\nstream\n" + payload + b"\nendstream"


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
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] "
            b"/Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>"
            % (PAGE_WIDTH, PAGE_HEIGHT, content_num)
        )
        body = b"BT /F1 24 Tf 72 700 Td 40 TL\n"
        for line in lines:
            body += b"(" + _escape(line) + b") Tj T*\n"
        body += b"ET\n"
        objects[content_num] = _stream(b"<< /Length %d >>" % len(body), body)

    return _serialise(objects)


def build_scanned_pdf(page_lines: Sequence[Sequence[str]], *, scale: float = 2.0) -> bytes:
    """Return a PDF whose pages are *pictures* of ``page_lines`` — no text layer.

    Built by rendering :func:`build_text_pdf` and embedding the result as JPEG,
    which is what a real scanner produces and what the OCR path has to handle.
    Rendering rather than drawing by hand gets a proper typeface at a real
    resolution; a bitmap font would test the OCR engine's patience, not its
    accuracy.
    """
    import pypdfium2 as pdfium
    from PIL import Image

    document = pdfium.PdfDocument(BytesIO(build_text_pdf(page_lines)))
    try:
        images: list[tuple[bytes, int, int]] = []
        for index in range(len(document)):
            bitmap = document[index].render(scale=scale).to_pil().convert("RGB")
            buffer = BytesIO()
            bitmap.save(buffer, format="JPEG", quality=90)
            images.append((buffer.getvalue(), bitmap.width, bitmap.height))
    finally:
        document.close()
    assert Image  # imported for the JPEG encoder; keeps the dependency explicit

    objects: dict[int, bytes] = {1: b"<< /Type /Catalog /Pages 2 0 R >>"}
    page_nums = [3 + 3 * i for i in range(len(images))]
    image_nums = [4 + 3 * i for i in range(len(images))]
    content_nums = [5 + 3 * i for i in range(len(images))]

    kids = b" ".join(b"%d 0 R" % num for num in page_nums)
    objects[2] = b"<< /Type /Pages /Kids [" + kids + b"] /Count %d >>" % len(images)

    for page_num, image_num, content_num, (jpeg, width, height) in zip(
        page_nums, image_nums, content_nums, images, strict=True
    ):
        objects[page_num] = (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] "
            b"/Resources << /XObject << /Im0 %d 0 R >> >> /Contents %d 0 R >>"
            % (PAGE_WIDTH, PAGE_HEIGHT, image_num, content_num)
        )
        objects[image_num] = _stream(
            b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB "
            b"/BitsPerComponent 8 /Filter /DCTDecode /Length %d >>" % (width, height, len(jpeg)),
            jpeg,
        )
        body = b"q %d 0 0 %d 0 0 cm /Im0 Do Q\n" % (PAGE_WIDTH, PAGE_HEIGHT)
        objects[content_num] = _stream(b"<< /Length %d >>" % len(body), body)

    return _serialise(objects)
