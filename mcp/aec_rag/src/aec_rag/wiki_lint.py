"""Проверка вики (задача 4.11).

Пять проверок из ``specs/wiki.md`` §Lint, и все пять — механические. Это и есть
причина, по которой они здесь, а не в инструкции скилу: «проверь, что все ссылки
ведут куда-то» модель выполняет добросовестно ровно до той страницы, на которой
устанет, и никогда не скажет, где именно устала.

Отчёт разложен по серьёзности, потому что чинить всё сразу никто не будет:
битая ссылка ломает навигацию сегодня, сирота — это упущение, а открытое
противоречие вообще не дефект вики, а вопрос к инженеру.
"""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from aec_rag.wiki import stale_snapshots

#: Обязательные поля заголовка содержательной страницы (``specs/wiki.md``).
REQUIRED_FIELDS = ("title", "type", "tags", "sources", "updated")

#: Типы страниц. Служебные (``index``, ``log``, ``schema``, ``readme``, ``raw``)
#: живут по своим правилам и полный заголовок не несут.
CONTENT_TYPES = ("entity", "concept", "comparison", "query")
SERVICE_TYPES = ("index", "log", "schema", "readme", "raw")

#: Служебные файлы: на них не ссылаются, и сиротами они не бывают.
SERVICE_FILES = ("index.md", "log.md", "schema.md")

WIKILINK = re.compile(r"\[\[([^[\]\n|]+)(?:\|[^[\]\n]*)?\]\]")
CONTRADICTION = re.compile(r"^#{2,}\s*Противоречие", re.MULTILINE)
RESOLVED = re.compile(r"Действующая редакция:\s*\S")


@dataclass(frozen=True)
class Finding:
    """Одна находка. ``page`` — путь от корня vault."""

    detail: str
    kind: str
    page: str
    severity: str

    def as_dict(self) -> dict[str, str]:
        return {
            "detail": self.detail,
            "kind": self.kind,
            "page": self.page,
            "severity": self.severity,
        }


def parse_frontmatter(text: str) -> dict[str, str]:
    """Плоский разбор YAML-заголовка: ``key: value`` до второго ``---``.

    Свой, а не библиотечный: заголовок страницы вики — десяток плоских строк,
    которые пишет агент по образцу из скила, и тащить YAML ради них дороже, чем
    прочитать. Значение возвращается строкой как есть — проверкам нужно только
    «есть или нет» и «пусто или нет».
    """
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return {}

    fields: dict[str, str] = {}
    current = ""
    for line in lines[1:]:
        if line.strip() == "---":
            break

        # Список блоком — `sources:` и на следующих строках `  - "…"`. Форма
        # такая же законная, как `[a, b]` в строке, и модель пишет то одну, то
        # другую. Не собирать её значило бы объявлять поле пустым там, где оно
        # заполнено, — эту ошибку нашёл эвал 4.14 на живом ответе.
        if line.startswith((" ", "\t", "-")):
            item = line.strip().lstrip("-").strip()
            if current and item:
                fields[current] = f"{fields[current]}, {item}".strip(", ")
            continue

        key, sep, value = line.partition(":")
        if sep:
            current = key.strip()
            fields[current] = value.strip()
    return fields


def _page_key(name: str) -> str:
    """Как страницы сопоставляются со ссылками: по имени файла без пути и
    расширения, без учёта регистра — так же, как это делает переход в
    редакторе (задача 4.6)."""
    return name.removesuffix(".md").strip().lower()


FENCED = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE = re.compile(r"`[^`\n]*`")


def _body(text: str) -> str:
    """Текст без заголовка и без кода.

    Заголовок отброшен, потому что `sources` в нём — не ссылки. Код отброшен,
    потому что пример `[[Страница]]` в обратных кавычках — это рассказ о
    ссылках, а не ссылка; иначе сама `SCHEMA.md`, объясняющая правило, вечно
    висела бы в отчёте с битой ссылкой на `[[…]]`.
    """
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            text = text[end + 4 :]
    return INLINE_CODE.sub(" ", FENCED.sub(" ", text))


def lint_wiki(conn: sqlite3.Connection | None, vault: Path) -> list[Finding]:
    """Все пять проверок за один обход. ``conn`` можно не давать — тогда
    проверка на устаревание пропускается (её единственный источник правды —
    индекс)."""
    vault = Path(vault)
    wiki = vault / "wiki"
    if not wiki.is_dir():
        return [
            Finding(
                detail="вики ещё не создана",
                kind="no-wiki",
                page="wiki",
                severity="error",
            )
        ]

    pages = [
        path
        for path in sorted(wiki.rglob("*.md"))
        if path.is_file() and "raw" not in path.relative_to(wiki).parts
    ]
    texts = {path: path.read_text(encoding="utf-8", errors="replace") for path in pages}
    known = {_page_key(path.name) for path in pages}

    findings: list[Finding] = []
    linked_to: set[str] = set()

    for path in pages:
        rel = path.relative_to(vault).as_posix()
        text = texts[path]
        fields = parse_frontmatter(text)
        kind = fields.get("type", "")

        # 1. Заголовок. Со служебных страниц полный заголовок не спрашивается.
        if kind not in SERVICE_TYPES and path.name.lower() not in SERVICE_FILES:
            if not fields:
                findings.append(
                    Finding(
                        detail="нет YAML-заголовка",
                        kind="frontmatter",
                        page=rel,
                        severity="error",
                    )
                )
            else:
                missing = [field for field in REQUIRED_FIELDS if not fields.get(field, "").strip()]
                if missing:
                    findings.append(
                        Finding(
                            detail=f"нет полей: {', '.join(missing)}",
                            kind="frontmatter",
                            page=rel,
                            severity="error",
                        )
                    )
                if kind and kind not in CONTENT_TYPES:
                    findings.append(
                        Finding(
                            detail=f"тип {kind!r} не из списка: {', '.join(CONTENT_TYPES)}",
                            kind="frontmatter",
                            page=rel,
                            severity="error",
                        )
                    )

        # 2. Ссылки.
        for target in WIKILINK.findall(_body(text)):
            key = _page_key(target.split("/")[-1])
            if key in known:
                linked_to.add(key)
            else:
                findings.append(
                    Finding(
                        detail=f"[[{target}]] — такой страницы нет",
                        kind="broken-link",
                        page=rel,
                        severity="error",
                    )
                )

        # 3. Противоречия. Не дефект вики — вопрос, ждущий решения инженера.
        for _ in CONTRADICTION.findall(text):
            if not RESOLVED.search(text):
                findings.append(
                    Finding(
                        detail="противоречие не закрыто: действующая редакция не названа",
                        kind="open-contradiction",
                        page=rel,
                        severity="info",
                    )
                )
                break

    # 4. Сироты. Служебные страницы не в счёт: на каталог и журнал не ссылаются.
    for path in pages:
        if path.name.lower() in SERVICE_FILES:
            continue
        if _page_key(path.name) in linked_to:
            continue
        findings.append(
            Finding(
                detail="на эту страницу никто не ссылается",
                kind="orphan",
                page=path.relative_to(vault).as_posix(),
                severity="warning",
            )
        )

    # 5. Устаревание: источник страницы переиздан после того, как её написали.
    if conn is not None:
        moved = {
            f"{entry['source_id']}/{entry['rel_path']}"
            for entry in stale_snapshots(conn, vault).changed
        }
        if moved:
            for path in pages:
                sources = parse_frontmatter(texts[path]).get("sources", "")
                behind = sorted(document for document in moved if document in sources)
                if behind:
                    findings.append(
                        Finding(
                            detail=f"источник переиздан: {', '.join(behind)}",
                            kind="stale",
                            page=path.relative_to(vault).as_posix(),
                            severity="warning",
                        )
                    )

    order = {"error": 0, "warning": 1, "info": 2}
    return sorted(findings, key=lambda finding: (order[finding.severity], finding.page))
