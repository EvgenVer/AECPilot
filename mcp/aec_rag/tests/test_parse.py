"""Tests for the Docling parsing paths (tasks 2.1, 2.4).

The format tests run the real converter — a stub would only prove that our own
dataclasses work, and the thing worth pinning here is what Docling actually does
with page numbers and headings. The converter is session-scoped because loading
the layout model costs far more than the conversions themselves.
"""

from __future__ import annotations

import docx
import pytest
from aec_rag.parse import ParseError, build_converter, parse_docx, parse_pdf, split_by_headings
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
PAGE_MARKERS = ["125 kW", "3x50 mm2", None, "0.4 kV"]


@pytest.fixture(scope="session")
def converter():
    return build_converter()


@pytest.fixture(scope="session")
def sample_pdf(tmp_path_factory):
    path = tmp_path_factory.mktemp("pdf") / "sample.pdf"
    path.write_bytes(build_text_pdf(PAGE_LINES))
    return path


@pytest.fixture(scope="session")
def parsed_pdf(converter, sample_pdf):
    return parse_pdf(sample_pdf, converter=converter)


@pytest.fixture(scope="session")
def sample_docx(tmp_path_factory):
    """A Russian DOCX with two heading levels, a table and a preamble above the
    first heading — the shape a real design assignment actually has.
    """
    path = tmp_path_factory.mktemp("docx") / "задание.docx"
    document = docx.Document()
    document.add_paragraph("Редакция 2 от 03.02.2026.")
    document.add_heading("Задание ЭОМ", level=1)
    document.add_paragraph("Установленная мощность 125 кВт.")
    document.add_heading("Кабельный журнал", level=2)
    table = document.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Позиция"
    table.cell(0, 1).text = "Значение"
    table.cell(1, 0).text = "Кабель А"
    table.cell(1, 1).text = "3х50 мм2"
    document.add_heading("Примечания", level=2)
    document.add_paragraph("Резерв 15%.")
    document.save(path)
    return path


@pytest.fixture(scope="session")
def parsed_docx(converter, sample_docx):
    return parse_docx(sample_docx, converter=converter)


def test_pdf_reports_every_page_with_its_1_based_number(parsed_pdf):
    assert parsed_pdf.doctype == "pdf"
    assert [segment.locator for segment in parsed_pdf.segments] == [
        {"page": 1},
        {"page": 2},
        {"page": 3},
        {"page": 4},
    ]


def test_pdf_marker_lands_on_its_own_page_and_nowhere_else(parsed_pdf):
    for segment, marker in zip(parsed_pdf.segments, PAGE_MARKERS, strict=True):
        if marker is None:
            continue
        assert marker in segment.markdown
        others = [other for other in parsed_pdf.segments if other is not segment]
        assert all(marker not in other.markdown for other in others)


def test_pdf_blank_page_keeps_its_place_in_the_sequence(parsed_pdf):
    assert parsed_pdf.segments[2].markdown == ""


def test_pdf_document_markdown_holds_the_whole_document(parsed_pdf):
    for marker in PAGE_MARKERS:
        if marker is not None:
            assert marker in parsed_pdf.markdown


def test_unreadable_file_raises_parse_error(converter, tmp_path):
    broken = tmp_path / "broken.pdf"
    broken.write_bytes(b"%PDF-1.4\nthis is not a pdf\n")

    with pytest.raises(ParseError) as excinfo:
        parse_pdf(broken, converter=converter)

    assert str(broken) in str(excinfo.value)


def test_docx_segments_are_headings_not_pages(parsed_docx):
    assert parsed_docx.doctype == "docx"
    assert [segment.locator for segment in parsed_docx.segments] == [
        {},
        {"heading": "Задание ЭОМ"},
        {"heading": "Кабельный журнал"},
        {"heading": "Примечания"},
    ]


def test_docx_preamble_above_the_first_heading_survives(parsed_docx):
    assert "Редакция 2" in parsed_docx.segments[0].markdown


def test_docx_text_stays_under_its_own_heading(parsed_docx):
    by_heading = {
        segment.locator.get("heading"): segment.markdown for segment in parsed_docx.segments
    }
    assert "125 кВт" in by_heading["Задание ЭОМ"]
    assert "3х50 мм2" in by_heading["Кабельный журнал"]
    assert "Резерв 15%" in by_heading["Примечания"]


def test_docx_table_is_extracted_as_a_markdown_table(parsed_docx):
    cable = next(
        segment
        for segment in parsed_docx.segments
        if segment.locator.get("heading") == "Кабельный журнал"
    )
    assert "| Позиция" in cable.markdown
    assert "3х50 мм2" in cable.markdown


def test_docx_segment_repeats_its_own_heading(parsed_docx):
    for segment in parsed_docx.segments:
        heading = segment.locator.get("heading")
        if heading is not None:
            assert heading in segment.markdown


def test_split_by_headings_returns_one_section_when_there_are_none():
    assert split_by_headings("просто текст\nбез заголовков") == [
        (None, "просто текст\nбез заголовков")
    ]


def test_split_by_headings_ignores_hashes_inside_a_fenced_block():
    markdown = "# Раздел\n\n```\n# это комментарий\n```\n\nхвост"

    sections = split_by_headings(markdown)

    assert [heading for heading, _ in sections] == ["Раздел"]
    assert "# это комментарий" in sections[0][1]


def test_split_by_headings_drops_an_empty_preamble():
    assert split_by_headings("\n\n## Первый\n\nтекст") == [("Первый", "## Первый\n\nтекст")]
