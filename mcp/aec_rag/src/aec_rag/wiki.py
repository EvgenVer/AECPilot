"""Структура вики проекта и её схема (задача 4.7).

Скелет создаётся кодом, а не агентом. Причина простая: папки и три служебных
файла — это не работа для модели, а вызов модели ради `mkdir` стоит денег и
времени и иногда ошибается. Модель наполняет вики (задачи 4.8–4.9); где что
лежит, решено заранее и записано в ``specs/wiki.md``.

Ничего существующего не перезаписывается. Вики живёт долго, её правит человек,
и повторный вызов ``wiki_init`` на живом проекте обязан быть безобиден.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

#: Папки вики. Порядок — как в ``specs/wiki.md``.
SUBDIRS = ("raw", "entities", "concepts", "comparisons", "queries")

#: Теги предметной области по умолчанию (``specs/wiki.md`` §Data schemas).
DEFAULT_TAGS = (
    "object",
    "building",
    "system/<марка>",
    "discipline",
    "tu",
    "task",
    "constraint",
    "decision",
    "contradiction",
    "site",
)

SCHEMA_MD = """---
title: Схема вики проекта
type: schema
updated: ""
---

# Схема вики

Правила этой вики. Файл создан приложением, **дальше он ваш**: агент его читает
и ему следует, а переписывать его будет только по вашей команде.

## Типы страниц

| Папка | Что там лежит |
|---|---|
| `entities/` | Объект, здания, системы по маркам (ОВ, ВК, ЭОМ, …), смежники, документы ТУ |
| `concepts/` | Требования и ограничения — нормативные, площадки, заказчика — и принятые решения |
| `comparisons/` | Сводки противоречий и редакций: где документы спорят друг с другом |
| `queries/` | Сохранённые содержательные ответы |
| `raw/` | Снимки обработанных источников. **Не редактируются**: это то, что прочитал разборщик |

## Теги

{tags}

Марка системы пишется как `system/ЭОМ`, `system/ОВ` и так далее — по маркам
вашего проекта.

## Когда заводится страница

- Предмет упомянут **в двух и более источниках**, либо занимает центральное
  место в одном.
- У страницы **не меньше двух исходящих ссылок** `[[…]]`: страница без связей
  выпадает из вики и её никто не найдёт.
- Страница длиннее **200 строк** разбивается на подтемы.

## Чем подтверждается факт

Каждый содержательный факт несёт ссылку на источник в виде
`[src: <источник>/<путь>#<место>]`. Факт без ссылки — это мнение, и в вики ему
не место.

Противоречие между документами **не разрешается молча**: обе версии остаются,
с документами и датами, в блоке «Противоречие» на странице темы и сводкой в
`comparisons/`.
"""

INDEX_MD = """---
title: Каталог вики
type: index
updated: ""
---

# Каталог

Страниц пока нет. Скажите агенту «построй вики проекта» — он прочитает
проиндексированные источники и заполнит её.
"""

LOG_MD = """---
title: Журнал вики
type: log
updated: ""
---

# Журнал

Что и когда агент делал с вики. Дописывается снизу, старое не удаляется.
"""

RAW_README_MD = """---
title: Снимки источников
type: readme
updated: ""
---

Здесь лежит то, что разборщик вычитал из исходных документов, в виде markdown.
Эти файлы **не редактируются вручную**: они сверяются с индексом по хэшу, и
правка сделала бы снимок расходящимся с источником навсегда.
"""


@dataclass(frozen=True)
class WikiInitResult:
    """Что появилось на диске. Пустые списки — вики уже была на месте."""

    created_dirs: list[str]
    created_files: list[str]
    wiki_path: str


def default_schema() -> str:
    """Текст ``SCHEMA.md`` по умолчанию, с подставленными тегами."""
    tags = "\n".join(f"- `{tag}`" for tag in DEFAULT_TAGS)
    return SCHEMA_MD.format(tags=tags)


def init_wiki(vault: Path) -> WikiInitResult:
    """Создаёт недостающие части ``<vault>/wiki/``.

    Существующее не трогается — ни файл, ни папка.
    """
    wiki = Path(vault) / "wiki"
    created_dirs: list[str] = []
    created_files: list[str] = []

    for directory in (wiki, *(wiki / name for name in SUBDIRS)):
        if not directory.exists():
            directory.mkdir(parents=True)
            created_dirs.append(directory.relative_to(vault).as_posix())

    files = {
        wiki / "SCHEMA.md": default_schema(),
        wiki / "index.md": INDEX_MD,
        wiki / "log.md": LOG_MD,
        wiki / "raw" / "README.md": RAW_README_MD,
    }
    for path, text in files.items():
        if not path.exists():
            # newline="\n": вики читают и правят разные инструменты, и файл с
            # разным концом строки в разных местах выглядит изменённым целиком
            # в любом diff.
            path.write_text(text, encoding="utf-8", newline="\n")
            created_files.append(path.relative_to(vault).as_posix())

    return WikiInitResult(
        created_dirs=created_dirs,
        created_files=created_files,
        wiki_path=wiki.as_posix(),
    )


# ---------------------------------------------------------------- снимки raw/


@dataclass(frozen=True)
class SnapshotResult:
    """Что записано в ``wiki/raw/``."""

    files: list[str]
    skipped: list[str]


def _snapshot_name(source_id: str, rel_path: str) -> str:
    """Имя снимка: ``<источник>__<путь с подчёркиваниями>.md``.

    Плоско, а не деревом. Дерево пришлось бы чинить при каждом переименовании
    папки в источнике, а имя со слэшами, заменёнными на подчёркивание, читается
    и остаётся уникальным.
    """
    flat = rel_path.replace("\\", "/").replace("/", "_")
    return f"{source_id}__{flat}.md"


def write_snapshots(
    conn: sqlite3.Connection,
    vault: Path,
    *,
    source_id: str | None = None,
    rel_paths: list[str] | None = None,
) -> SnapshotResult:
    """Пишет снимки разобранных документов в ``wiki/raw/``.

    Текст берётся из индекса, а не из исходного файла: в индексе он уже
    разобран Docling, и именно этот текст видел агент, когда строил вики.
    Снимок с ``sha256`` из индекса — то, по чему потом видно, что источник
    уехал вперёд (lint, задача 4.11).

    Работу делает код: перекладывание мегабайтов текста через контекст модели
    стоило бы денег и ничего бы к тексту не добавило.
    """
    raw = Path(vault) / "wiki" / "raw"
    raw.mkdir(parents=True, exist_ok=True)

    query = """
        SELECT f.source_id, f.rel_path, f.sha256, i.ingested_at
        FROM ingested_files AS i
        JOIN files AS f ON f.source_id = i.source_id AND f.rel_path = i.rel_path
        WHERE f.status != 'deleted'
    """
    params: list[str] = []
    if source_id:
        query += " AND f.source_id = ?"
        params.append(source_id)
    if rel_paths:
        query += f" AND f.rel_path IN ({','.join('?' * len(rel_paths))})"
        params.extend(rel_paths)

    written: list[str] = []
    skipped: list[str] = []

    for source, rel_path, sha256, ingested_at in conn.execute(
        query + " ORDER BY f.source_id, f.rel_path", params
    ).fetchall():
        chunks = conn.execute(
            "SELECT text FROM chunks WHERE source_id = ? AND rel_path = ? ORDER BY ordinal",
            (source, rel_path),
        ).fetchall()
        if not chunks:
            skipped.append(f"{source}/{rel_path}")
            continue

        header = (
            "---\n"
            f"source_id: {source}\n"
            f"rel_path: {rel_path}\n"
            f"sha256: {sha256 or ''}\n"
            f"ingested_at: {ingested_at}\n"
            f"snapshot_at: {datetime.now(UTC).isoformat()}\n"
            "type: raw\n"
            "---\n\n"
            "<!-- Снимок разобранного документа. Не редактируется: он сверяется\n"
            "     с индексом по sha256, и правка развела бы его с источником. -->\n\n"
        )
        body = "\n\n".join(chunk[0] for chunk in chunks)
        name = _snapshot_name(source, rel_path)
        (raw / name).write_text(header + body + "\n", encoding="utf-8", newline="\n")
        written.append(f"wiki/raw/{name}")

    return SnapshotResult(files=written, skipped=skipped)


# ------------------------------------------------- что уехало вперёд (4.9/4.11)


@dataclass(frozen=True)
class StaleReport:
    """Расхождение вики с индексом, по трём видам.

    Разделены намеренно: изменившийся источник требует переписать страницу,
    новый — решить, заводить ли её вообще, а исчезнувший — не удалять ничего
    молча. Один общий список «расходится» заставил бы агента гадать, что делать.
    """

    changed: list[dict[str, str]]
    new: list[dict[str, str]]
    gone: list[dict[str, str]]


def _snapshot_header(path: Path) -> dict[str, str]:
    """Поля YAML-заголовка снимка. Разбор построчный, без зависимости от
    парсера: в заголовке снимка ровно шесть плоских строк, которые пишем мы
    сами, и тащить ради них YAML было бы дороже, чем прочитать."""
    fields: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").split("\n")
    except OSError:
        return fields
    if not lines or lines[0].strip() != "---":
        return fields
    for line in lines[1:]:
        if line.strip() == "---":
            break
        key, sep, value = line.partition(":")
        if sep:
            fields[key.strip()] = value.strip()
    return fields


def stale_snapshots(conn: sqlite3.Connection, vault: Path) -> StaleReport:
    """Чем вики отстала от индекса.

    Сравнение идёт по ``sha256``: снимок несёт хэш содержимого, при котором его
    сделали, а индекс — текущий. Разошлись — значит документ переиздали, и
    страницы по нему больше не описывают то, что в нём написано.
    """
    raw = Path(vault) / "wiki" / "raw"

    indexed: dict[tuple[str, str], str] = {}
    for source, rel_path, sha256 in conn.execute(
        "SELECT f.source_id, f.rel_path, f.sha256"
        " FROM ingested_files AS i"
        " JOIN files AS f ON f.source_id = i.source_id AND f.rel_path = i.rel_path"
        " WHERE f.status != 'deleted'"
    ).fetchall():
        indexed[(source, rel_path)] = sha256 or ""

    changed: list[dict[str, str]] = []
    gone: list[dict[str, str]] = []
    snapshotted: set[tuple[str, str]] = set()

    for snapshot in sorted(raw.glob("*.md")) if raw.is_dir() else []:
        header = _snapshot_header(snapshot)
        source = header.get("source_id", "")
        rel_path = header.get("rel_path", "")
        if not source or not rel_path:
            continue
        key = (source, rel_path)
        snapshotted.add(key)
        entry = {
            "rel_path": rel_path,
            "snapshot": f"wiki/raw/{snapshot.name}",
            "source_id": source,
        }
        if key not in indexed:
            gone.append(entry)
        elif indexed[key] != header.get("sha256", ""):
            changed.append(entry)

    new = [
        {"rel_path": rel_path, "source_id": source}
        for (source, rel_path) in sorted(indexed)
        if (source, rel_path) not in snapshotted
    ]

    return StaleReport(changed=changed, new=new, gone=gone)
