"""Сверка выдержки с текстом источника (SPEC UR26, задача 3.30).

Проверяется не матчер — он чужой и отлажен у донора, — а то, что вокруг него:
откуда берётся доказательство, что происходит при отсутствии скила и почему
короткая выдержка не проходит. Ровно эти три места и решают, будет ли проверка
проверкой или её видимостью.
"""

from __future__ import annotations

import json
import sqlite3

import pytest
from aec_rag.citation import parse_citations
from aec_rag.evidence import (
    EvidenceUnavailable,
    check_quote,
    chunk_text,
    find_quotes,
    hermes_home,
)

SKILL_TEXT = """
def quote_in_evidence(quote, evidence):
    return " ".join(quote.split()).casefold() in " ".join(evidence.split()).casefold()
"""


@pytest.fixture
def skill(tmp_path, monkeypatch):
    """Скил на месте — но НАШ, крошечный: тест про нашу обвязку, и зависеть от
    того, установлено ли ядро на машине, он не должен."""
    script = tmp_path / "skills" / "research" / "grounded-citations" / "scripts" / "sources.py"
    script.parent.mkdir(parents=True)
    script.write_text(SKILL_TEXT, encoding="utf-8")
    monkeypatch.setenv("AEC_HERMES_HOME", str(tmp_path))
    check_quote.__globals__["_matcher"].cache_clear()
    yield tmp_path
    check_quote.__globals__["_matcher"].cache_clear()


def test_a_verbatim_quote_passes_and_a_reworked_one_does_not(skill):
    evidence = "Установленная мощность щита ЩС-1 составляет 42 кВт по ведомости."

    assert check_quote("мощность щита ЩС-1 составляет 42 кВт", evidence)["ok"] is True
    # Ровно тот случай из замера 3.22: середина выброшена многоточием.
    assert check_quote("мощность щита ЩС-1 … 42 кВт", evidence)["ok"] is False


def test_a_short_quote_is_not_a_check(skill):
    evidence = "Для стоек принята сталь С235 по ГОСТ."

    result = check_quote("сталь С235", evidence)

    # Три слова совпадают у пол-документа, и «подтверждение» такой выдержкой
    # подпирало неверные ответы в замере 3.22.
    assert result["ok"] is False
    assert "слов" in result["reason"]


def test_a_missing_skill_is_not_an_ok(tmp_path, monkeypatch):
    monkeypatch.setenv("AEC_HERMES_HOME", str(tmp_path / "пусто"))
    check_quote.__globals__["_matcher"].cache_clear()

    # Молчаливое «ок» здесь было бы худшим исходом: гарантия исчезла, вид
    # гарантии остался.
    with pytest.raises(EvidenceUnavailable) as failure:
        check_quote("любая фраза из четырёх слов", "текст")

    assert "grounded-citations" in str(failure.value)
    check_quote.__globals__["_matcher"].cache_clear()


def test_the_home_directory_comes_from_our_own_variable(monkeypatch):
    # Ядро вычищает окружение перед запуском MCP-сервера, поэтому его
    # собственный HERMES_HOME сюда не доезжает — путь передаёт наш регистратор.
    monkeypatch.setenv("AEC_HERMES_HOME", "D:/наш/путь")
    monkeypatch.setenv("HERMES_HOME", "D:/чужой/путь")

    assert hermes_home().as_posix() == "D:/наш/путь"


def _db(rows):
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE chunks (source_id TEXT, rel_path TEXT, locator TEXT, text TEXT)")
    conn.executemany("INSERT INTO chunks VALUES (?, ?, ?, ?)", rows)
    return conn


def test_evidence_comes_from_the_index_at_the_cited_place():
    conn = _db(
        [
            ("project", "ТЗ.pdf", json.dumps({"page": 11}), "На одиннадцатой странице."),
            ("project", "ТЗ.pdf", json.dumps({"page": 12}), "Мощность 250 кВт."),
        ]
    )

    citation = parse_citations("[src: project/ТЗ.pdf#p12]")[0]

    assert chunk_text(conn, citation) == "Мощность 250 кВт."


def test_a_citation_without_a_page_is_checked_against_the_whole_file():
    # Ссылка на файл целиком — законная (скил велит не выдумывать якорь, если
    # локатора нет). Выдержка, которой нет нигде в документе, выдумана
    # независимо от страницы.
    conn = _db(
        [
            ("project", "ТЗ.pdf", json.dumps({"page": 11}), "На одиннадцатой странице."),
            ("project", "ТЗ.pdf", json.dumps({"page": 12}), "Мощность 250 кВт."),
        ]
    )

    citation = parse_citations("[src: project/ТЗ.pdf]")[0]

    assert "одиннадцатой" in chunk_text(conn, citation)
    assert "250 кВт" in chunk_text(conn, citation)


def test_a_citation_that_points_nowhere_yields_no_evidence():
    conn = _db([("project", "ТЗ.pdf", json.dumps({}), "текст")])

    citation = parse_citations("[src: project/выдумка.pdf]")[0]

    assert chunk_text(conn, citation) == ""


def test_quotes_are_tied_to_the_citation_that_precedes_them():
    # Так их и ставит скил: ссылка, следом выдержка. Привязка к ПОСЛЕДУЮЩЕЙ
    # ссылке сверяла бы выдержку с чужим документом и метила бы верную цитату.
    answer = (
        "Мощность 250 кВт [src: p/а.pdf#p12](#cite) «установленная мощность 250 кВт». "
        "Кабель ВВГнг [src: p/б.xlsx](#cite) «кабель ВВГнг три на пятьдесят»."
    )
    citations = parse_citations(answer)
    quotes = find_quotes(answer)

    assert [q.citation(citations).rel_path for q in quotes] == ["а.pdf", "б.xlsx"]


def test_a_quote_before_any_citation_has_none():
    quotes = find_quotes("«первая фраза без ссылки» [src: p/а.pdf](#cite)")
    assert quotes[0].citation(parse_citations("«…» [src: p/а.pdf](#cite)")) is None


def test_a_turn_of_phrase_is_not_a_quote():
    # «класса «В»» — не утверждение из источника, и пометка на нём была бы шумом.
    assert find_quotes('Класс герметичности «В» и "тип 2".') == []


def test_an_unclosed_quote_does_not_swallow_the_answer():
    answer = 'Начали «фразу и не закрыли\nВторой абзац "тоже с четырьмя словами тут".'
    quotes = find_quotes(answer)

    assert [q.text for q in quotes] == ["тоже с четырьмя словами тут"]


def test_a_quote_carries_its_place_in_the_text():
    answer = "текст «одна и та же фраза» и снова «одна и та же фраза»"
    first, second = find_quotes(answer)

    # Интерфейс метит конкретный кусок; двух одинаковых фраз ему мало.
    assert answer[first.start : first.end] == first.text
    assert first.start != second.start
