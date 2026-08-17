"""Скелет вики (задача 4.7).

Проверяется не «создались ли папки» — это mkdir, — а два обещания, на которых
держится вся вика: структура ровно та, что записана в ``specs/wiki.md``, и
повторный вызов на живом проекте ничего не портит.
"""

from __future__ import annotations

from pathlib import Path

from aec_rag.wiki import DEFAULT_TAGS, SUBDIRS, default_schema, init_wiki


def test_creates_the_structure_from_the_spec(tmp_path: Path) -> None:
    result = init_wiki(tmp_path)

    wiki = tmp_path / "wiki"
    for name in SUBDIRS:
        assert (wiki / name).is_dir(), name
    for name in ("SCHEMA.md", "index.md", "log.md"):
        assert (wiki / name).is_file(), name
    assert (wiki / "raw" / "README.md").is_file()
    assert result.created_dirs, "первый запуск обязан что-то создать"


def test_schema_carries_the_domain_taxonomy() -> None:
    schema = default_schema()

    # Теги — единственное в схеме, что задаёт предметную область; без них файл
    # был бы общими словами про вики вообще.
    for tag in DEFAULT_TAGS:
        assert f"`{tag}`" in schema, tag


def test_schema_states_the_rules_that_lint_will_check() -> None:
    schema = default_schema()

    # Правила из specs/wiki.md, по которым потом судит lint (4.11). Если они
    # разъедутся, агент будет писать одно, а проверка требовать другое.
    assert "200" in schema
    assert "[src:" in schema
    assert "[[…]]" in schema


def test_second_run_changes_nothing(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    (tmp_path / "wiki" / "SCHEMA.md").write_text("моя схема", encoding="utf-8")
    (tmp_path / "wiki" / "entities" / "ТП-1.md").write_text("страница", encoding="utf-8")

    result = init_wiki(tmp_path)

    # Вики живёт долго и её правит человек: повторный вызов обязан быть
    # безобиден, иначе однажды он сотрёт чужую работу.
    assert result.created_dirs == []
    assert result.created_files == []
    assert (tmp_path / "wiki" / "SCHEMA.md").read_text(encoding="utf-8") == "моя схема"
    assert (tmp_path / "wiki" / "entities" / "ТП-1.md").exists()


def test_fills_in_only_what_is_missing(tmp_path: Path) -> None:
    (tmp_path / "wiki").mkdir()
    (tmp_path / "wiki" / "index.md").write_text("мой каталог", encoding="utf-8")

    result = init_wiki(tmp_path)

    assert "wiki/index.md" not in result.created_files
    assert "wiki/SCHEMA.md" in result.created_files
    assert (tmp_path / "wiki" / "index.md").read_text(encoding="utf-8") == "мой каталог"


def test_files_are_written_with_lf(tmp_path: Path) -> None:
    init_wiki(tmp_path)

    raw = (tmp_path / "wiki" / "SCHEMA.md").read_bytes()

    # Иначе на Windows файл уедет с CRLF, а агент допишет строку с LF — и любой
    # diff покажет изменённым весь файл.
    assert b"\r\n" not in raw


def _index_with_document(tmp_path: Path):
    """Индекс с одним разобранным документом — минимум для снимка."""
    from aec_rag.db import open_index

    conn = open_index(tmp_path / "index.db")
    conn.execute(
        "INSERT INTO files (source_id, rel_path, sha256, status, indexed_at)"
        " VALUES ('tasks', 'ЭОМ/задание.pdf', 'abc123', 'ok', '2026-08-17T10:00:00Z')"
    )
    conn.execute(
        "INSERT INTO ingested_files (source_id, rel_path, sha256, chunk_count, ingested_at)"
        " VALUES ('tasks', 'ЭОМ/задание.pdf', 'abc123', 2, '2026-08-17T10:05:00Z')"
    )
    for ordinal, text in enumerate(["Мощность 250 кВт.", "Категория вторая."]):
        conn.execute(
            "INSERT INTO chunks (chunk_id, source_id, rel_path, ordinal, locator, is_table, text)"
            " VALUES (?, 'tasks', 'ЭОМ/задание.pdf', ?, '{}', 0, ?)",
            (f"c{ordinal}", ordinal, text),
        )
    conn.commit()
    return conn


def test_snapshot_carries_the_text_and_the_hash_it_was_read_at(tmp_path: Path) -> None:
    from aec_rag.wiki import write_snapshots

    conn = _index_with_document(tmp_path)
    init_wiki(tmp_path)

    result = write_snapshots(conn, tmp_path)

    assert result.files == ["wiki/raw/tasks__ЭОМ_задание.pdf.md"]
    text = (tmp_path / "wiki" / "raw" / "tasks__ЭОМ_задание.pdf.md").read_text(encoding="utf-8")
    # Хэш — то, по чему lint потом увидит, что источник уехал вперёд.
    assert "sha256: abc123" in text
    assert "source_id: tasks" in text
    # Куски идут по порядку: снимок читают глазами, и переставленные абзацы
    # сделали бы его бесполезным.
    assert text.index("Мощность 250 кВт.") < text.index("Категория вторая.")


def test_snapshot_skips_a_file_without_chunks(tmp_path: Path) -> None:
    from aec_rag.wiki import write_snapshots

    conn = _index_with_document(tmp_path)
    conn.execute("DELETE FROM chunks")
    conn.commit()
    init_wiki(tmp_path)

    result = write_snapshots(conn, tmp_path)

    # Пустой снимок выглядел бы как пустой документ; лучше сказать, что его нет.
    assert result.files == []
    assert result.skipped == ["tasks/ЭОМ/задание.pdf"]


def test_snapshot_can_be_narrowed_to_one_file(tmp_path: Path) -> None:
    from aec_rag.wiki import write_snapshots

    conn = _index_with_document(tmp_path)
    init_wiki(tmp_path)

    # Инкрементальное обновление (4.9) переписывает снимки только изменившихся.
    assert write_snapshots(conn, tmp_path, rel_paths=["нет.pdf"]).files == []
    assert len(write_snapshots(conn, tmp_path, rel_paths=["ЭОМ/задание.pdf"]).files) == 1
