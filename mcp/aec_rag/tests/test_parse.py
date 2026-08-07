"""Tests for the Docling PDF path (task 2.1).

These run the real converter — a stub would only prove that our own dataclasses
work, and the thing worth pinning here is what Docling actually does with page
numbers. The converter is session-scoped because loading the layout model costs
far more than the conversions themselves.
"""

from __future__ import annotations

import pytest
from aec_rag.parse import ParseError, build_converter, parse_pdf
from pdf_fixture import build_text_pdf

# Each page carries a marker that appears nowhere else, so "page 2's text ended
# up under page 3" is a test failure and not a judgement call. Page 3 is blank
# on purpose: a page with nothing on it must still hold its place in the
# sequence, or every citation after it points one page short.
PAGE_LINES = [
    ["Installed power report", "The installed power is 125 kW."],
    ["Cable list", "Cable A: 3x50 mm2"],
    [],
    ["Notes", "Voltage is 0.4 kV."],
]
MARKERS = ["125 kW", "3x50 mm2", None, "0.4 kV"]


@pytest.fixture(scope="session")
def converter():
    return build_converter()


@pytest.fixture(scope="session")
def sample_pdf(tmp_path_factory):
    path = tmp_path_factory.mktemp("pdf") / "sample.pdf"
    path.write_bytes(build_text_pdf(PAGE_LINES))
    return path


@pytest.fixture(scope="session")
def parsed(converter, sample_pdf):
    return parse_pdf(sample_pdf, converter=converter)


def test_every_page_is_reported_with_its_1_based_number(parsed):
    assert parsed.doctype == "pdf"
    assert [page.page_no for page in parsed.pages] == [1, 2, 3, 4]


def test_each_marker_lands_on_its_own_page_and_nowhere_else(parsed):
    for page, marker in zip(parsed.pages, MARKERS, strict=True):
        if marker is None:
            continue
        assert marker in page.markdown
        others = [other for other in parsed.pages if other.page_no != page.page_no]
        assert all(marker not in other.markdown for other in others)


def test_blank_page_keeps_its_place_in_the_sequence(parsed):
    assert parsed.pages[2].markdown == ""


def test_document_markdown_holds_the_whole_document(parsed):
    for marker in MARKERS:
        if marker is not None:
            assert marker in parsed.markdown


def test_unreadable_file_raises_parse_error(converter, tmp_path):
    broken = tmp_path / "broken.pdf"
    broken.write_bytes(b"%PDF-1.4\nthis is not a pdf\n")

    with pytest.raises(ParseError) as excinfo:
        parse_pdf(broken, converter=converter)

    assert str(broken) in str(excinfo.value)
