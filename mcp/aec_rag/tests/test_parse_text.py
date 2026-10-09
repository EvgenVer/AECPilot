"""Tests for MD and TXT parsing (D-199, owner's decision 2026-10-09).

Until now a project's notes in `.txt` and its `.md` documents were skipped
silently; the inventory showed them as «format not read». They are text, so
they are read as text — no Docling, no models.
"""

from __future__ import annotations

import pytest
from aec_rag.parse import SUPPORTED_SUFFIXES, ParseError, parse_file


def test_md_and_txt_are_indexable():
    assert {".md", ".txt"} <= SUPPORTED_SUFFIXES


def test_markdown_is_split_at_its_headings(tmp_path):
    path = tmp_path / "решения.md"
    path.write_text(
        "Вступление.\n\n# Фундаменты\nСваи С-1 по ИГЭ-2.\n\n## Ростверк\nБетон B30.\n",
        encoding="utf-8",
    )

    parsed = parse_file(path)

    assert parsed.doctype == "md"
    assert [(s.locator, s.markdown) for s in parsed.segments] == [
        ({}, "Вступление."),
        ({"heading": "Фундаменты"}, "# Фундаменты\nСваи С-1 по ИГЭ-2."),
        ({"heading": "Ростверк"}, "## Ростверк\nБетон B30."),
    ]


def test_plain_text_is_one_segment_naming_the_file(tmp_path):
    path = tmp_path / "заметки.txt"
    path.write_bytes("Записка инженера.\r\nСваи С-1 по ИГЭ-2.\r\n".encode())

    parsed = parse_file(path)

    assert parsed.doctype == "txt"
    assert [(s.locator, s.markdown) for s in parsed.segments] == [
        ({}, "Записка инженера.\nСваи С-1 по ИГЭ-2.")
    ]


def test_a_notepad_file_in_windows_1251_reads_as_russian(tmp_path):
    path = tmp_path / "старое.txt"
    path.write_bytes("Отметка верха сваи −2,450".encode("cp1251", errors="replace"))

    assert parse_file(path).markdown.startswith("Отметка верха сваи")


def test_utf8_with_bom_loses_the_bom(tmp_path):
    path = tmp_path / "bom.txt"
    path.write_bytes("﻿Текст".encode())

    assert parse_file(path).markdown == "Текст"


def test_an_empty_file_has_no_segments(tmp_path):
    path = tmp_path / "пусто.txt"
    path.write_text("  \n", encoding="utf-8")

    assert parse_file(path).segments == ()


def test_a_binary_file_named_txt_is_refused(tmp_path):
    path = tmp_path / "не текст.txt"
    path.write_bytes(b"\x00\x01\x02PK\x03\x04")

    with pytest.raises(ParseError):
        parse_file(path)
