"""Скелет вики (задача 4.7).

Проверяется не «создались ли папки» — это mkdir, — а два обещания, на которых
держится вся вика: структура ровно та, что записана в ``docs/history/specs/wiki.md``, и
повторный вызов на живом проекте ничего не портит.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
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

    # Правила из docs/history/specs/wiki.md, по которым потом судит lint (4.11). Если они
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


def test_stale_report_separates_changed_new_and_gone(tmp_path: Path) -> None:
    from aec_rag.wiki import stale_snapshots, write_snapshots

    conn = _index_with_document(tmp_path)
    init_wiki(tmp_path)
    write_snapshots(conn, tmp_path)

    # Ничего не менялось — расхождений нет.
    fresh = stale_snapshots(conn, tmp_path)
    assert (fresh.changed, fresh.new, fresh.gone) == ([], [], [])

    # Документ переиздали: хэш в индексе уехал вперёд снимка.
    conn.execute("UPDATE files SET sha256 = 'zzz999' WHERE rel_path = 'ЭОМ/задание.pdf'")
    # И появился ещё один, которого в вики нет вовсе.
    conn.execute(
        "INSERT INTO files (source_id, rel_path, sha256, status, indexed_at)"
        " VALUES ('tasks', 'ОВ/задание.pdf', 'new111', 'ok', '2026-08-17T11:00:00Z')"
    )
    conn.execute(
        "INSERT INTO ingested_files (source_id, rel_path, sha256, chunk_count, ingested_at)"
        " VALUES ('tasks', 'ОВ/задание.pdf', 'new111', 1, '2026-08-17T11:00:00Z')"
    )
    conn.commit()

    report = stale_snapshots(conn, tmp_path)

    assert [entry["rel_path"] for entry in report.changed] == ["ЭОМ/задание.pdf"]
    assert [entry["rel_path"] for entry in report.new] == ["ОВ/задание.pdf"]
    assert report.gone == []


def test_stale_report_notices_a_source_that_left(tmp_path: Path) -> None:
    from aec_rag.wiki import stale_snapshots, write_snapshots

    conn = _index_with_document(tmp_path)
    init_wiki(tmp_path)
    write_snapshots(conn, tmp_path)

    conn.execute("DELETE FROM ingested_files")
    conn.commit()

    report = stale_snapshots(conn, tmp_path)

    # Исчезнувший источник — не повод что-то удалять: страницы по нему остаются,
    # но об этом надо знать (docs/history/specs/wiki.md, «источник отключён»).
    assert [entry["rel_path"] for entry in report.gone] == ["ЭОМ/задание.pdf"]


def test_stale_report_survives_a_snapshot_without_a_header(tmp_path: Path) -> None:
    from aec_rag.wiki import stale_snapshots

    conn = _index_with_document(tmp_path)
    init_wiki(tmp_path)
    (tmp_path / "wiki" / "raw" / "чужой.md").write_text("просто текст", encoding="utf-8")

    report = stale_snapshots(conn, tmp_path)

    # Файл без заголовка не наш; молча пропускаем, а не падаем на нём.
    assert report.gone == []
    assert [entry["rel_path"] for entry in report.new] == ["ЭОМ/задание.pdf"]


def _page(tmp_path: Path, name: str, text: str) -> Path:
    path = tmp_path / "wiki" / "entities" / name
    path.write_text(text, encoding="utf-8")
    return path


def test_untouched_pages_are_not_reported_as_edited(tmp_path: Path) -> None:
    from aec_rag.wiki import checkpoint_pages, edited_pages

    init_wiki(tmp_path)
    _page(tmp_path, "ТП-1.md", "страница агента")
    checkpoint_pages(tmp_path)

    assert edited_pages(tmp_path) == {"edited": [], "unknown": []}


def test_a_human_edit_is_noticed(tmp_path: Path) -> None:
    from aec_rag.wiki import checkpoint_pages, edited_pages

    init_wiki(tmp_path)
    page = _page(tmp_path, "ТП-1.md", "страница агента")
    checkpoint_pages(tmp_path)

    page.write_text("страница агента\n\nа это дописал инженер", encoding="utf-8")

    # Ровно тот случай, ради которого всё это заведено: перезапись целиком
    # стёрла бы приписку, и человек об этом не узнал бы.
    assert edited_pages(tmp_path)["edited"] == ["wiki/entities/ТП-1.md"]


def test_a_page_the_agent_never_wrote_is_unknown_not_edited(tmp_path: Path) -> None:
    from aec_rag.wiki import checkpoint_pages, edited_pages

    init_wiki(tmp_path)
    checkpoint_pages(tmp_path)
    _page(tmp_path, "Щитовая.md", "это написал человек")

    report = edited_pages(tmp_path)

    assert report["unknown"] == ["wiki/entities/Щитовая.md"]
    assert report["edited"] == []


def test_without_a_checkpoint_everything_is_treated_as_someone_elses(tmp_path: Path) -> None:
    from aec_rag.wiki import edited_pages

    init_wiki(tmp_path)
    _page(tmp_path, "ТП-1.md", "страница")

    # Правильная сторона ошибки: осторожность там, где могла быть чужая работа.
    assert "wiki/entities/ТП-1.md" in edited_pages(tmp_path)["unknown"]


def test_snapshots_are_not_pages(tmp_path: Path) -> None:
    from aec_rag.wiki import checkpoint_pages, edited_pages, write_snapshots

    conn = _index_with_document(tmp_path)
    init_wiki(tmp_path)
    checkpoint_pages(tmp_path)
    write_snapshots(conn, tmp_path)

    # Снимки пишет код и переписывает при каждом обновлении; попади они в
    # проверку — каждое обновление выглядело бы как чужая правка.
    report = edited_pages(tmp_path)
    assert not any("raw/" in name for name in report["edited"] + report["unknown"])


def test_write_page_refuses_to_lose_a_humans_paragraph(tmp_path: Path) -> None:
    from aec_rag.wiki import WriteRefused, checkpoint_pages, write_page

    init_wiki(tmp_path)
    page = _page(tmp_path, "ТП-1.md", "---\ntype: entity\n---\n\nМощность 250 кВт.")
    checkpoint_pages(tmp_path)
    page.write_text(
        "---\ntype: entity\n---\n\nМощность 250 кВт.\n\nСОГЛАСОВАНО УСТНО: резерв на ТП-2.",
        encoding="utf-8",
    )

    # Замер 4.14: инструкция «перенеси чужие абзацы» не держится 5 раз из 5.
    # Держится отказ.
    try:
        write_page(tmp_path, "wiki/entities/ТП-1.md", "---\ntype: entity\n---\n\nМощность 320 кВт.")
    except WriteRefused as refused:
        assert any("СОГЛАСОВАНО" in block for block in refused.lost)
    else:
        raise AssertionError("запись прошла, а должна была быть отклонена")

    assert "СОГЛАСОВАНО" in page.read_text(encoding="utf-8")


def test_write_page_allows_an_update_that_keeps_the_paragraph(tmp_path: Path) -> None:
    from aec_rag.wiki import checkpoint_pages, write_page

    init_wiki(tmp_path)
    page = _page(tmp_path, "ТП-1.md", "---\ntype: entity\n---\n\nМощность 250 кВт.")
    checkpoint_pages(tmp_path)
    page.write_text(
        "---\ntype: entity\n---\n\nМощность 250 кВт.\n\nСОГЛАСОВАНО УСТНО: резерв на ТП-2.",
        encoding="utf-8",
    )

    write_page(
        tmp_path,
        "wiki/entities/ТП-1.md",
        "---\ntype: entity\n---\n\nМощность 250 кВт.\n\n"
        "СОГЛАСОВАНО УСТНО: резерв на ТП-2.\n\nПо ред. 2 — 320 кВт.",
    )

    text = page.read_text(encoding="utf-8")
    assert "СОГЛАСОВАНО" in text and "320" in text


def test_write_page_lets_the_agent_rewrite_its_own_page(tmp_path: Path) -> None:
    from aec_rag.wiki import checkpoint_pages, write_page

    init_wiki(tmp_path)
    page = _page(tmp_path, "ТП-1.md", "---\ntype: entity\n---\n\nСтарый текст агента.")
    checkpoint_pages(tmp_path)

    # Свою же страницу агент вправе переписать как угодно: чужой работы в ней
    # нет, и запрет только мешал бы обновлению.
    write_page(tmp_path, "wiki/entities/ТП-1.md", "---\ntype: entity\n---\n\nНовый текст.")

    assert page.read_text(encoding="utf-8").endswith("Новый текст.")


def test_write_page_refuses_to_leave_the_vault(tmp_path: Path) -> None:
    from aec_rag.wiki import write_page

    init_wiki(tmp_path)

    try:
        write_page(tmp_path, "../чужое.md", "текст")
    except ValueError:
        pass
    else:
        raise AssertionError("запись за пределы проекта прошла")


def test_write_page_cannot_forge_its_own_guard(tmp_path: Path) -> None:
    """Находка D-45, главный случай.

    Проверка стояла на КОРНЕ проекта, а не на ``wiki/``, поэтому под запись
    попадал ``.aecpilot/wiki-state.json`` — файл, которым ``edited_pages``
    отличает работу человека от работы агента. Подменив его, агент делает
    каждую страницу «своей» и снимает ``WriteRefused`` с себя навсегда.
    Тест держит именно эту цепочку, а не «путь с двумя точками».
    """
    from aec_rag.wiki import STATE_FILE, checkpoint_pages, write_page

    init_wiki(tmp_path)
    _page(tmp_path, "ТП-1.md", "---\ntype: entity\n---\n\nМощность 250 кВт.")
    checkpoint_pages(tmp_path)
    before = (tmp_path / STATE_FILE).read_text(encoding="utf-8")

    # Сверяется СООБЩЕНИЕ, а не просто ValueError: у файла суффикс ``.json``,
    # поэтому проверка расширения отклонила бы его и с прежней, дырявой
    # проверкой области — тест был бы зелёным, ничего не проверяя. Мутация
    # (вернуть сверку на корень проекта) обязана его ронять.
    with pytest.raises(ValueError, match="wiki/"):
        write_page(tmp_path, STATE_FILE.as_posix(), "{}")

    assert (tmp_path / STATE_FILE).read_text(encoding="utf-8") == before


@pytest.mark.parametrize(
    ("rel", "says"),
    [
        # `.md` в корне проекта: отсечь его может ТОЛЬКО проверка области.
        ("AGENTS.md", "wiki/"),
        ("docs/заметка.md", "wiki/"),
        (".aecpilot/project.json", "wiki/"),
        ("wiki/entities/ТП-1.txt", ".md"),
        ("wiki/raw/источник/файл.md", "raw/"),
        # D-143: побочные файлы вне раскладки навыка.
        ("wiki/log/2026-09-24-update.md", "wiki/entities/"),
        ("wiki/annotations/update.md", "wiki/entities/"),
        ("wiki/index_add.md", "wiki/entities/"),
        ("wiki/entities/sub/ТП-1.md", "wiki/entities/"),
    ],
)
def test_write_page_writes_only_wiki_pages(tmp_path: Path, rel: str, says: str) -> None:
    """Область записи ровно та, что обещана описанием инструмента."""
    from aec_rag.wiki import write_page

    init_wiki(tmp_path)

    with pytest.raises(ValueError, match=re.escape(says)):
        write_page(tmp_path, rel, "текст")

    assert not (tmp_path / rel).exists()


@pytest.mark.parametrize(
    "rel", ["wiki/index.md", "wiki/log.md", "wiki/concepts/Заземление.md", "wiki/queries/q.md"]
)
def test_write_page_accepts_the_wiki_layout(tmp_path: Path, rel: str) -> None:
    from aec_rag.wiki import checkpoint_pages, write_page

    init_wiki(tmp_path)
    # index.md и log.md создаёт wiki_init; до отметки они «не свои» (4.14).
    checkpoint_pages(tmp_path)

    assert write_page(tmp_path, rel, "текст")["written"] is True
