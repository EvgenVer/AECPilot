"""Задача 3G.15 — сырьё в обход индекса (`wiki_add_raw`, docs/history/specs/wiki.md, UR6)."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from aec_rag.parse import ParsedDocument, ParsedSegment, ParseError
from aec_rag.wiki import PathRefused, WikiRefusal, add_raw, init_wiki


def _header(path: Path) -> dict[str, str]:
    lines = path.read_text(encoding="utf-8").split("\n")
    fields: dict[str, str] = {}
    for line in lines[1 : lines.index("---", 1)]:
        key, _, value = line.partition(":")
        fields[key.strip()] = value.strip()
    return fields


def _fake_parse(path: Path) -> ParsedDocument:
    return ParsedDocument(
        doctype="pdf",
        markdown="Стр. один\n\nСтр. два",
        segments=(
            ParsedSegment(locator={"page": 1}, markdown="Стр. один"),
            ParsedSegment(locator={"page": 2}, markdown="Стр. два"),
        ),
    )


@pytest.fixture
def vault(tmp_path: Path) -> Path:
    init_wiki(tmp_path)
    return tmp_path


def test_note_lands_in_its_kind_with_provenance(vault: Path) -> None:
    result = add_raw(vault, "notes", "Протокол совещания 12.09", text="Решили: резерв 10 %.")

    assert result["ok"] is True
    path = vault / str(result["path"])
    assert path.parent == vault / "wiki" / "raw" / "user" / "notes"
    header = _header(path)
    assert header["origin"] == "user"
    assert header["kind"] == "notes"
    assert header["added_at"]
    assert header["sha256"] == hashlib.sha256("Решили: резерв 10 %.".encode()).hexdigest()


def test_decision_keeps_a_cyrillic_title_as_the_file_name(vault: Path) -> None:
    result = add_raw(
        vault, "decisions", "Решение пользователя от 2026-09-28: резерв ЩС-1", text="Резерв 10 %."
    )

    # Двоеточие недопустимо в имени файла Windows — остальное остаётся как есть.
    assert Path(str(result["path"])).name == "Решение пользователя от 2026-09-28 резерв ЩС-1.md"


def test_link_records_where_the_text_came_from(vault: Path) -> None:
    result = add_raw(
        vault, "links", "СП 256", text="Текст страницы.", source_url="https://example.org/sp?x=1"
    )

    assert _header(vault / str(result["path"]))["source_url"] == "https://example.org/sp?x=1"


def test_file_is_parsed_with_pages_and_not_copied(vault: Path, tmp_path_factory) -> None:
    original = tmp_path_factory.mktemp("elsewhere") / "ТУ.pdf"
    original.write_bytes(b"%PDF-fake")

    result = add_raw(
        vault, "files", "ТУ на водоснабжение", source_path=str(original), parse=_fake_parse
    )

    written = vault / str(result["path"])
    text = written.read_text(encoding="utf-8")
    assert "<!-- стр. 2 -->" in text and "Стр. два" in text
    header = _header(written)
    assert header["source_path"] == str(original)
    assert header["source_sha256"] == hashlib.sha256(b"%PDF-fake").hexdigest()
    # Оригинал не копируется: в raw/ — только разобранный текст.
    assert not list((vault / "wiki").rglob("*.pdf"))


def test_file_is_not_written_to_the_index(vault: Path, tmp_path_factory) -> None:
    original = tmp_path_factory.mktemp("elsewhere") / "ТУ.pdf"
    original.write_bytes(b"%PDF-fake")

    add_raw(vault, "files", "ТУ", source_path=str(original), parse=_fake_parse)

    assert not (vault / ".aecpilot" / "index.db").exists()


def test_same_title_does_not_overwrite(vault: Path) -> None:
    first = add_raw(vault, "notes", "Заметка", text="один")
    second = add_raw(vault, "notes", "Заметка", text="два")

    assert first["path"] != second["path"]
    assert (vault / str(first["path"])).read_text(encoding="utf-8").endswith("один\n")


@pytest.mark.parametrize(
    ("kwargs", "says"),
    [
        ({"kind": "pages", "name": "x", "text": "t"}, "вид сырья"),
        ({"kind": "notes", "name": "x", "text": "  "}, "нужен text"),
        ({"kind": "links", "name": "x", "text": "t"}, "source_url"),
        ({"kind": "files", "name": "x", "source_path": "Z:/нет/такого.pdf"}, "файла нет"),
        ({"kind": "notes", "name": "../../entities/ТП-1", "text": "t"}, "без пути"),
        ({"kind": "notes", "name": "a/b", "text": "t"}, "без пути"),
        ({"kind": "notes", "name": " ?* ", "text": "t"}, "нужно имя"),
    ],
)
def test_refusals_are_answers(vault: Path, kwargs: dict, says: str) -> None:
    with pytest.raises(WikiRefusal, match=says):
        add_raw(vault, **kwargs)

    assert not (vault / "wiki" / "raw" / "user").exists()


def test_path_refusal_is_a_wiki_refusal() -> None:
    assert issubclass(PathRefused, WikiRefusal)


def test_unparseable_file_is_refused(vault: Path, tmp_path_factory) -> None:
    original = tmp_path_factory.mktemp("elsewhere") / "чертёж.dwg"
    original.write_bytes(b"x")

    def refuse(path: Path) -> ParsedDocument:
        raise ParseError("формат .dwg не индексируется")

    with pytest.raises(WikiRefusal, match="dwg"):
        add_raw(vault, "files", "Чертёж", source_path=str(original), parse=refuse)


def test_stale_sees_a_changed_original_bypassing_the_index(vault: Path, tmp_path_factory) -> None:
    """3G.17: оригинал, внесённый в обход индекса, изменился на диске — `changed`."""
    from aec_rag.db import open_index as open_db
    from aec_rag.wiki import stale_snapshots

    original = tmp_path_factory.mktemp("elsewhere") / "ТУ.pdf"
    original.write_bytes("ред. 1".encode())
    added = add_raw(vault, "files", "ТУ", source_path=str(original), parse=_fake_parse)
    add_raw(vault, "notes", "Протокол", text="Резерв 10 %.")
    add_raw(vault, "decisions", "Решение", text="Согласовано.")
    conn = open_db(tmp_path_factory.mktemp("db") / "index.db")

    assert stale_snapshots(conn, vault).changed == []

    original.write_bytes("ред. 2".encode())
    report = stale_snapshots(conn, vault)

    assert report.changed == [
        {"rel_path": str(original), "snapshot": added["path"], "source_id": "user"}
    ]
    assert report.gone == []

    original.unlink()
    assert [entry["source_id"] for entry in stale_snapshots(conn, vault).gone] == ["user"]
    conn.close()
