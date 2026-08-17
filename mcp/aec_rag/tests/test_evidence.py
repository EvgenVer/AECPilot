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
from aec_rag.evidence import EvidenceUnavailable, check_quote, chunk_text, hermes_home

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
