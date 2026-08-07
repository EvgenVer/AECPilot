"""Tests for the markdown chunker (task 2.6).

These are pure-function tests built on hand-written ``ParsedDocument``s: the
chunker never sees a file, and pinning its boundaries does not need Docling.
"""

from __future__ import annotations

from aec_rag.chunk import chunk_document
from aec_rag.parse import ParsedDocument, ParsedSegment

TABLE = "\n".join(
    ["| Позиция | Мощность |", "|---|---|"] + [f"| Насос К-{n} | {n * 5} |" for n in range(1, 40)]
)


def document(*segments: ParsedSegment) -> ParsedDocument:
    return ParsedDocument(doctype="pdf", markdown="", segments=segments)


def test_chunk_inherits_the_locator_of_its_segment():
    parsed = document(ParsedSegment(locator={"page": 7}, markdown="Мощность 125 кВт."))

    chunks = chunk_document(parsed)

    assert [chunk.locator for chunk in chunks] == [{"page": 7}]


def test_inner_heading_is_added_to_the_locator():
    parsed = document(
        ParsedSegment(
            locator={"page": 7},
            markdown="## Кабельный журнал\n\nКабель А: 3х50 мм2",
        )
    )

    chunks = chunk_document(parsed)

    assert chunks[0].locator == {"page": 7, "heading": "Кабельный журнал"}


def test_a_heading_the_segment_already_carries_is_not_overwritten():
    parsed = document(
        ParsedSegment(
            locator={"heading": "Задание ЭОМ"},
            markdown="## Задание ЭОМ\n\nМощность 125 кВт.",
        )
    )

    chunks = chunk_document(parsed)

    assert chunks[0].locator == {"heading": "Задание ЭОМ"}


def test_each_heading_section_becomes_its_own_chunk():
    parsed = document(
        ParsedSegment(
            locator={"page": 1},
            markdown="## Первый\n\nтекст один\n\n## Второй\n\nтекст два",
        )
    )

    chunks = chunk_document(parsed)

    assert [chunk.locator["heading"] for chunk in chunks] == ["Первый", "Второй"]
    assert "текст два" not in chunks[0].text


def test_a_table_longer_than_the_limit_is_still_one_chunk():
    parsed = document(ParsedSegment(locator={"sheet": "Ведомость"}, markdown=TABLE))

    chunks = chunk_document(parsed, max_chars=200)

    assert len(chunks) == 1
    assert chunks[0].text == TABLE
    assert chunks[0].is_table is True


def test_a_chunk_holding_no_table_is_not_marked_as_one():
    parsed = document(ParsedSegment(locator={"page": 1}, markdown="просто абзац"))

    assert chunk_document(parsed)[0].is_table is False


def test_prose_over_the_limit_splits_on_paragraph_boundaries():
    paragraphs = [f"Абзац номер {n}. " + " ".join(["слово"] * 20) for n in range(6)]
    parsed = document(ParsedSegment(locator={"page": 2}, markdown="\n\n".join(paragraphs)))

    chunks = chunk_document(parsed, max_chars=300)

    assert len(chunks) > 1
    assert all(len(chunk.text) <= 300 for chunk in chunks)
    for paragraph in paragraphs:
        assert any(paragraph in chunk.text for chunk in chunks)


def test_a_single_line_longer_than_the_limit_is_cut_rather_than_dropped():
    wall = "к" * 500
    parsed = document(ParsedSegment(locator={"page": 3}, markdown=wall))

    chunks = chunk_document(parsed, max_chars=200)

    assert "".join(chunk.text for chunk in chunks) == wall
    assert all(len(chunk.text) <= 200 for chunk in chunks)


def test_a_blank_segment_produces_no_chunk():
    parsed = document(
        ParsedSegment(locator={"page": 1}, markdown=""),
        ParsedSegment(locator={"page": 2}, markdown="текст"),
    )

    chunks = chunk_document(parsed)

    assert [chunk.locator for chunk in chunks] == [{"page": 2}]


def test_table_and_the_text_around_it_stay_in_one_chunk_when_they_fit():
    parsed = document(
        ParsedSegment(
            locator={"page": 4},
            markdown="Ведомость нагрузок:\n\n| А | Б |\n|---|---|\n| 1 | 2 |\n\nПримечание.",
        )
    )

    chunks = chunk_document(parsed)

    assert len(chunks) == 1
    assert chunks[0].is_table is True
    assert "Примечание." in chunks[0].text
