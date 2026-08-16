"""Tests for the citation grammar decided by O4 (task 2.7)."""

from __future__ import annotations

import pytest
from aec_rag.citation import (
    Citation,
    format_citation,
    format_locator,
    parse_citations,
    parse_locator,
)

ROUND_TRIP = [
    ({"page": 12}, "p12"),
    ({"sheet": "Ведомость", "range": "C5:D6"}, "Ведомость!C5:D6"),
    ({"sheet": "Ведомость"}, "Ведомость"),
    ({"heading": "Кабельный журнал"}, "h:Кабельный журнал"),
]


@pytest.mark.parametrize(("locator", "rendered"), ROUND_TRIP)
def test_locator_round_trips(locator, rendered):
    assert format_locator(locator) == rendered
    assert parse_locator(rendered) == locator


def test_a_place_that_cannot_be_named_has_no_hash_part():
    assert format_locator({}) is None
    assert format_citation("tasks", "нагрузки.csv") == "[src: tasks/нагрузки.csv]"


def test_page_wins_over_heading_because_a_viewer_can_open_it():
    assert format_locator({"page": 7, "heading": "Кабельный журнал"}) == "p7"


def test_heading_is_cut_at_a_character_a_citation_cannot_carry():
    assert format_locator({"heading": "Раздел 3] прочее"}) == "h:Раздел 3"


def test_citation_is_built_from_source_path_and_place():
    assert (
        format_citation("tasks", "ЭОМ/задание_ред2.pdf", {"page": 12})
        == "[src: tasks/ЭОМ/задание_ред2.pdf#p12]"
    )


def test_citations_are_pulled_out_of_an_answer():
    answer = (
        "Установленная мощность 125 кВт [src: tasks/ЭОМ/задание_ред2.pdf#p12], "
        "по ведомости [src: tasks/ведомость.xlsx#Ведомость!C5:D6]."
    )

    assert parse_citations(answer) == [
        Citation("tasks", "ЭОМ/задание_ред2.pdf", {"page": 12}),
        Citation("tasks", "ведомость.xlsx", {"sheet": "Ведомость", "range": "C5:D6"}),
    ]


def test_a_broken_citation_does_not_cost_the_others():
    answer = "мусор [src: ] ещё мусор [src: tasks/задание.docx#h:Примечания] хвост"

    assert parse_citations(answer) == [Citation("tasks", "задание.docx", {"heading": "Примечания"})]


def test_an_unreadable_locator_degrades_to_the_file_itself():
    assert parse_citations("[src: tasks/файл.pdf#]") == [Citation("tasks", "файл.pdf", {})]


def test_a_citation_missing_its_bracket_does_not_swallow_the_next_one():
    """One broken bracket must cost the reader that reference and no other —
    the renderer's twin of this grammar asserts the same (task 2.13).
    """
    text = "сначала [src: tasks/битая#p1 потом [src: tasks/целая.pdf#p3] конец"

    assert [citation.rel_path for citation in parse_citations(text)] == ["целая.pdf"]


def test_an_anchor_the_format_cannot_have_is_dropped():
    """Measured in the eval baseline (2.17): the model wrote `#p94` on a DOCX,
    which has no pages at all — right answer, right file, link to nowhere. The
    citation falls back to naming the file, which is what the spec prescribes
    when a place cannot be named.
    """
    [docx] = parse_citations("[src: project/ТЗ.docx#p94]")
    [sheet_on_pdf] = parse_citations("[src: project/ПЗ.pdf#Ведомость!C5:D6]")

    assert docx.locator == {}
    assert sheet_on_pdf.locator == {}


def test_a_locator_the_format_does_have_survives():
    [pdf] = parse_citations("[src: project/ПЗ.pdf#p12]")
    [xlsx] = parse_citations("[src: project/кабели.xlsx#Ведомость!C5:D6]")
    [heading] = parse_citations("[src: project/ТЗ.docx#h:Кабельный журнал]")

    assert pdf.locator == {"page": 12}
    assert xlsx.locator == {"sheet": "Ведомость", "range": "C5:D6"}
    assert heading.locator == {"heading": "Кабельный журнал"}


def test_an_unknown_format_is_left_alone():
    """We only drop what we know cannot exist. A format we have no rule for
    keeps whatever the citation said."""
    [other] = parse_citations("[src: project/схема.dwg#p3]")

    assert other.locator == {"page": 3}
