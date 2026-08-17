"""Проверка вики (задача 4.11), по фикстуре на дефект.

Каждая проверка испытывается на странице, где дефект ЕСТЬ, и на странице, где
его нет: проверка, которая ругается всегда, ничем не лучше проверки, которая
молчит всегда.
"""

from __future__ import annotations

from pathlib import Path

from aec_rag.wiki import init_wiki, write_snapshots
from aec_rag.wiki_lint import lint_wiki, parse_frontmatter

GOOD_HEADER = """---
title: ТП-1
type: entity
tags: [object]
sources: ["tasks/ЭОМ/задание.pdf"]
updated: 2026-08-17
---
"""


def write_page(vault: Path, name: str, body: str, header: str = GOOD_HEADER) -> Path:
    path = vault / "wiki" / "entities" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(header + "\n" + body, encoding="utf-8")
    return path


def kinds(findings, kind: str) -> list[str]:
    return [finding.page for finding in findings if finding.kind == kind]


def test_frontmatter_is_parsed_flat() -> None:
    fields = parse_frontmatter(GOOD_HEADER)

    assert fields["title"] == "ТП-1"
    assert fields["type"] == "entity"
    assert "tasks/ЭОМ/задание.pdf" in fields["sources"]


def test_a_link_to_a_missing_page_is_an_error(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    write_page(tmp_path, "ТП-1.md", "Питается от [[ГРЩ]] и стоит в [[Щитовая]].")

    findings = lint_wiki(None, tmp_path)

    broken = [finding for finding in findings if finding.kind == "broken-link"]
    assert len(broken) == 2
    assert all(finding.severity == "error" for finding in broken)


def test_a_link_to_an_existing_page_is_not_reported(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    write_page(tmp_path, "ТП-1.md", "Стоит в [[Щитовая]].")
    write_page(tmp_path, "Щитовая.md", "Помещение с [[ТП-1]].")

    assert kinds(lint_wiki(None, tmp_path), "broken-link") == []


def test_link_matching_ignores_case_like_the_editor_does(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    write_page(tmp_path, "ТП-1.md", "См. [[щитовая]].")
    write_page(tmp_path, "Щитовая.md", "См. [[тп-1]].")

    assert kinds(lint_wiki(None, tmp_path), "broken-link") == []


def test_a_page_nobody_links_to_is_an_orphan(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    write_page(tmp_path, "ТП-1.md", "Стоит в [[Щитовая]].")
    write_page(tmp_path, "Щитовая.md", "Помещение.")
    write_page(tmp_path, "Забытая.md", "Никто сюда не ведёт.")

    orphans = kinds(lint_wiki(None, tmp_path), "orphan")

    # ТП-1 тоже сирота — на неё никто не ссылается; проверяется, что «Забытая»
    # среди них, а «Щитовая» нет.
    assert "wiki/entities/Забытая.md" in orphans
    assert "wiki/entities/Щитовая.md" not in orphans


def test_service_pages_are_never_orphans(tmp_path: Path) -> None:
    init_wiki(tmp_path)

    findings = lint_wiki(None, tmp_path)

    # На каталог, журнал и схему не ссылаются по определению; ругаться на них
    # значило бы выдавать три ложных находки на каждой проверке.
    assert kinds(findings, "orphan") == []
    assert kinds(findings, "frontmatter") == []


def test_a_missing_header_field_is_an_error(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    write_page(
        tmp_path,
        "ТП-1.md",
        "Текст.",
        header="---\ntitle: ТП-1\ntype: entity\n---\n",
    )

    findings = [f for f in lint_wiki(None, tmp_path) if f.kind == "frontmatter"]

    assert len(findings) == 1
    assert "tags" in findings[0].detail
    assert "sources" in findings[0].detail
    assert "updated" in findings[0].detail


def test_an_unknown_page_type_is_an_error(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    write_page(
        tmp_path,
        "ТП-1.md",
        "Текст.",
        header=GOOD_HEADER.replace("type: entity", "type: страница"),
    )

    findings = [f for f in lint_wiki(None, tmp_path) if f.kind == "frontmatter"]

    assert any("страница" in finding.detail for finding in findings)


def test_a_page_without_a_header_at_all_is_an_error(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    write_page(tmp_path, "ТП-1.md", "Просто текст без заголовка.", header="")

    findings = [f for f in lint_wiki(None, tmp_path) if f.kind == "frontmatter"]

    assert findings and findings[0].detail == "нет YAML-заголовка"


def test_an_open_contradiction_is_information_not_an_error(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    write_page(tmp_path, "ТП-1.md", "## Противоречие: мощность\n\n250 против 180.")

    findings = [f for f in lint_wiki(None, tmp_path) if f.kind == "open-contradiction"]

    # Не дефект вики: это вопрос, ждущий решения инженера.
    assert len(findings) == 1
    assert findings[0].severity == "info"


def test_a_contradiction_with_a_decision_is_closed(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    write_page(
        tmp_path,
        "ТП-1.md",
        "## Противоречие: мощность\n\n250 против 180.\n\nДействующая редакция: ред. 2.",
    )

    assert kinds(lint_wiki(None, tmp_path), "open-contradiction") == []


def test_a_page_whose_source_was_reissued_is_stale(tmp_path: Path) -> None:
    from test_wiki import _index_with_document

    conn = _index_with_document(tmp_path)
    init_wiki(tmp_path)
    write_snapshots(conn, tmp_path)
    write_page(
        tmp_path,
        "ТП-1.md",
        "Мощность 250 кВт.",
        header=GOOD_HEADER.replace("tasks/ЭОМ/задание.pdf", "tasks/ЭОМ/задание.pdf"),
    )

    assert kinds(lint_wiki(conn, tmp_path), "stale") == []

    # Документ переиздали — страница описывает прошлую редакцию.
    conn.execute("UPDATE files SET sha256 = 'zzz999'")
    conn.commit()

    stale = kinds(lint_wiki(conn, tmp_path), "stale")
    assert stale == ["wiki/entities/ТП-1.md"]


def test_findings_come_worst_first(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    write_page(tmp_path, "ТП-1.md", "## Противоречие: мощность\n\nСм. [[Нет такой]].")

    severities = [finding.severity for finding in lint_wiki(None, tmp_path)]

    # Чинить всё сразу никто не будет, поэтому порядок — часть ответа.
    assert severities == sorted(severities, key=["error", "warning", "info"].index)


def test_an_example_link_in_backticks_is_not_a_link(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    write_page(tmp_path, "Правила.md", "Ссылка пишется как `[[Страница]]`, вот так.")

    # Иначе любая страница, объясняющая правило, висела бы в отчёте с битой
    # ссылкой — и первой из них была бы SCHEMA.md.
    assert kinds(lint_wiki(None, tmp_path), "broken-link") == []


def test_a_fenced_example_is_not_a_link(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    write_page(tmp_path, "Правила.md", "Пример:\n\n```\n[[Другая страница]]\n```\n")

    assert kinds(lint_wiki(None, tmp_path), "broken-link") == []


def test_a_block_list_in_the_header_is_a_filled_field() -> None:
    # Форму со списком блоком модель пишет наравне с `[a, b]`; найдено эвалом
    # 4.14 на живом ответе — поле считалось пустым, и страница висела с
    # «нет полей: sources».
    header = (
        "---\ntitle: ТП-1\ntype: entity\ntags:\n  - object\n"
        'sources:\n  - "tasks/ЭОМ/задание.pdf"\n  - "tasks/кабели.xlsx"\n'
        "updated: 2026-08-17\n---\n"
    )

    fields = parse_frontmatter(header)

    assert "tasks/ЭОМ/задание.pdf" in fields["sources"]
    assert "tasks/кабели.xlsx" in fields["sources"]
    assert fields["tags"] == "object"


def test_a_page_with_a_block_list_header_passes_lint(tmp_path: Path) -> None:
    init_wiki(tmp_path)
    write_page(
        tmp_path,
        "ТП-1.md",
        "См. [[Щитовая]].",
        header=(
            "---\ntitle: ТП-1\ntype: entity\ntags:\n  - object\n"
            'sources:\n  - "tasks/ЭОМ/задание.pdf"\n'
            "updated: 2026-08-17\n---\n"
        ),
    )
    write_page(tmp_path, "Щитовая.md", "См. [[ТП-1]].")

    assert kinds(lint_wiki(None, tmp_path), "frontmatter") == []
