"""Сверка дословной выдержки с текстом источника (SPEC UR26, задача 3.30).

Матчер — **чужой**: `quote_in_evidence` из скила `grounded-citations`, который
ставится вместе с ядром. Здесь только его поиск на диске и загрузка; ни строчки
его логики не скопировано и не переписано.

Почему именно так, а не копией: их функция нечувствительна к регистру, к
переносам строк и к markdown-разметке (ссылка `[текст](url)` в извлечённом
тексте схлопывается до `текст`, символы `*_`~` снимаются). Это ровно та
тонкость, из-за которой самодельный матчер отвергал бы верные цитаты, — а
отвергнутая верная цитата хуже пропущенной неверной: она учит не доверять
проверке.

Скила на машине нет — проверка отвечает «недоступна», а не «ок». Молчаливое
«ок» при отсутствующем матчере убирает гарантию, оставляя её вид.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from types import ModuleType

SKILL_SCRIPT = Path("skills") / "research" / "grounded-citations" / "scripts" / "sources.py"


class EvidenceUnavailable(RuntimeError):
    """Матчер не найден. Отдельный тип, чтобы вызывающий не спутал «не совпало»
    с «нечем сверять» — это разные ответы человеку."""


def hermes_home() -> Path:
    """Домашний каталог ядра.

    `AEC_HERMES_HOME` ставит наш регистратор (`runtime/register-aec-rag.mjs`):
    ядро вычищает своё окружение, прежде чем запустить MCP-сервер
    (`tools/mcp_tool._build_safe_env`), поэтому его собственный `HERMES_HOME`
    сюда не доезжает. Остальные два варианта — на случай запуска сервера руками.
    """
    for name in ("AEC_HERMES_HOME", "HERMES_HOME"):
        value = os.environ.get(name, "").strip()
        if value:
            return Path(value)
    return Path.home() / ".hermes"


def _load(path: Path) -> ModuleType:
    # Их скрипт сам добавляет свой каталог в sys.path (ему нужен соседний
    # `_hermes_home`), поэтому грузится он именно по файлу, а не по имени.
    spec = importlib.util.spec_from_file_location("aec_grounded_citations", path)
    if spec is None or spec.loader is None:
        raise EvidenceUnavailable(f"не удалось загрузить {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@lru_cache(maxsize=4)
def _matcher(root: str):
    path = Path(root) / SKILL_SCRIPT
    if not path.is_file():
        raise EvidenceUnavailable(
            f"скил grounded-citations не найден: нет {path}. "
            "Он ставится вместе с ядром; без него сверять выдержки нечем."
        )
    module = _load(path)
    matcher = getattr(module, "quote_in_evidence", None)
    if matcher is None:
        raise EvidenceUnavailable(
            f"{path}: в скиле нет функции quote_in_evidence — вероятно, донор её переименовал"
        )
    return matcher


#: Короче — не выдержка, а оборот речи («класса «В»»). Порог общий для обоих
#: рубежей: разойдись они, инструмент принимал бы то, что показ пометит.
MIN_WORDS = 4


@dataclass(frozen=True)
class Quote:
    """Выдержка, найденная в тексте ответа: сама фраза и её место в строке.

    Место нужно интерфейсу: пометка ставится на конкретный кусок текста, а
    одинаковых фраз в ответе может быть две.
    """

    text: str
    start: int
    end: int

    def citation(self, citations: Sequence) -> object | None:
        """Ближайшая ссылка ПЕРЕД выдержкой — так их и ставит скил.

        `None` до первой ссылки: такая выдержка сверяется со всем, что ответ
        процитировал (см. `run_check_quotes`).
        """
        preceding = [item for item in citations if item.start < self.start]
        return preceding[-1] if preceding else None


# Выдержка — «ёлочки» или обычные кавычки. Внутри не бывает переноса абзаца:
# незакрытая кавычка иначе съедала бы половину ответа и помечала бы её целиком.
_QUOTE = re.compile(r"«([^»\n]{10,400})»|\"([^\"\n]{10,400})\"")

MIN_QUOTE_WORDS = 4


def find_quotes(answer: str) -> list[Quote]:
    """Выдержки в тексте ответа.

    Короче четырёх слов — не выдержка, а оборот речи («класса «В»»), и метить
    такие значило бы засыпать человека пометками там, где никто ничего не
    утверждал.
    """
    found: list[Quote] = []
    for match in _QUOTE.finditer(answer):
        group = 1 if match.group(1) is not None else 2
        text = (match.group(group) or "").strip()
        if len(text.split()) >= MIN_WORDS:
            found.append(Quote(text=text, start=match.start(group), end=match.end(group)))
    return found


def chunk_text(conn, citation) -> str:
    """Текст того места, на которое показывает ссылка.

    Доказательство берётся ОТСЮДА, а не из того, что прислала модель: иначе
    сверка сводится к сравнению текста с самим собой.

    Локатор сужает выборку, но его отсутствие не делает ссылку негодной — файл
    целиком тоже адрес (и якорь, которого формат не поддерживает, уже снят
    `sanitize_locator`, решение D-25). Тогда сверяем по всему файлу: выдержка,
    которой нет нигде в документе, выдумана независимо от страницы.
    """
    rows = conn.execute(
        "SELECT locator, text FROM chunks WHERE source_id = ? AND rel_path = ?",
        (citation.source_id, citation.rel_path),
    ).fetchall()
    if not rows:
        return ""
    wanted = dict(citation.locator or {})
    matching = [text for stored, text in rows if _locator_matches(json.loads(stored), wanted)]
    return "\n".join(matching or [text for _, text in rows])


def _locator_matches(stored: dict, wanted: dict) -> bool:
    if not wanted:
        return True
    if "page" in wanted:
        return stored.get("page") == wanted["page"]
    if "sheet" in wanted:
        return stored.get("sheet") == wanted["sheet"]
    if "heading" in wanted:
        return str(stored.get("heading", "")).startswith(str(wanted["heading"])[:40])
    return True


def check_quote(quote: str, evidence: str) -> dict[str, object]:
    """«Есть ли эта фраза в тексте источника».

    Слишком короткая выдержка отбивается до матчера: три слова совпадают у
    половины документа, и такая «проверка» подтверждала бы что угодно. Их
    скрипт держит порог в три слова; здесь четыре — по замеру 3.22 короткие
    куски вроде «из стали С235» и были тем, чем подпирались неверные ответы.
    """
    text = " ".join((quote or "").split())
    if len(text.split()) < MIN_WORDS:
        return {
            "ok": False,
            "reason": f"выдержка короче {MIN_WORDS} слов — по такой ничего не проверишь",
        }
    if not (evidence or "").strip():
        return {"ok": False, "reason": "текст источника пуст — сверять не с чем"}

    if _matcher(str(hermes_home()))(text, evidence):
        return {"ok": True, "reason": "фраза найдена в тексте источника"}
    return {
        "ok": False,
        "reason": (
            "этой фразы в тексте источника нет. Не подгоняйте формулировку — "
            "скопируйте настоящую фразу из фрагмента или не приводите выдержку"
        ),
    }
