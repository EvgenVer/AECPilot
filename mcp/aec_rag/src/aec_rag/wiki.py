"""Структура вики проекта и её схема (задача 4.7).

Скелет создаётся кодом, а не агентом. Причина простая: папки и три служебных
файла — это не работа для модели, а вызов модели ради `mkdir` стоит денег и
времени и иногда ошибается. Модель наполняет вики (задачи 4.8–4.9); где что
лежит, решено заранее и записано в ``specs/wiki.md``.

Ничего существующего не перезаписывается. Вики живёт долго, её правит человек,
и повторный вызов ``wiki_init`` на живом проекте обязан быть безобиден.
"""

from __future__ import annotations

from dataclasses import dataclass
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
