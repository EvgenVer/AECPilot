"""Smoke-эвал скила `aec-wiki` (задача 4.14, критерии — docs/history/specs/wiki.md).

    uv run python eval/wiki_eval.py                  # все сценарии
    uv run python eval/wiki_eval.py --only build     # один

Что здесь меряется и что нет — граница та же, что у раннера `aec-qa`:

* **правила скила** — модель пишет страницу под текстом самого
  `skills/aec-wiki/SKILL.md`, по материалу из того же `rag_query`, каким
  пользуется скилл. Правку скила видно в числах;
* **не поведение агента внутри hermes** — выберет ли он инструмент, дойдёт ли
  до `wiki_checkpoint`, как поведёт себя на пятидесятом файле. Это весь продукт
  целиком, то есть ручная приёмка, а не эвал.

Разделение проверок на машинные и судейские — то же самое и по той же причине:

* **провенанс** — машинно. Ссылка обязана разрешаться в существующий фрагмент
  индекса. Судья этого не знает и охотно одобрит правдоподобную ссылку на
  страницу, где ничего подобного нет;
* **заголовок, связи, блок противоречия, сохранность чужой строки** — машинно,
  тем же `wiki_lint`, что работает в продукте. Это факты о тексте;
* **покрытие ключевых фактов** — судьёй: вопрос «сказано ли главное» — это
  вопрос о смысле, и списком подстрок он не решается.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "eval" / "runner"))
sys.path.insert(0, str(REPO_ROOT / "mcp" / "aec_rag" / "src"))

import run as qa  # noqa: E402 — путь к раннеру достраивается выше

SKILL = REPO_ROOT / "skills" / "aec-wiki" / "SKILL.md"
#: Мини-проект, а не эталонный: материал должен помещаться в судью целиком —
#: см. eval/fixtures/wiki-project/README.md.
WIKI_VAULT = REPO_ROOT / "eval" / ".wiki-vault"
REPORT = REPO_ROOT / "eval" / "reports" / "wiki-smoke.md"

MODEL = qa.ANSWER_MODEL
JUDGE_MODEL = qa.JUDGE_MODEL

WIKILINK = re.compile(r"\[\[([^[\]\n|]+)(?:\|[^[\]\n]*)?\]\]")
CONTRADICTION = re.compile(r"^#{2,}\s*Противоречие", re.MULTILINE)


@dataclass
class Scenario:
    """Один сценарий. `checks` — имена проверок, которые к нему применимы."""

    id: str
    topic: str
    task: str
    checks: list[str]
    #: Текст, который «дописал инженер» — для сценария сохранности правки.
    manual_line: str = ""
    #: Существующая страница, которую надо обновить.
    existing: str = ""


SCENARIOS = [
    Scenario(
        id="build-entity",
        topic="электроснабжение объекта: мощность, категория надёжности",
        task=(
            "Напиши страницу вики про электроснабжение объекта по этому материалу. "
            "Одну страницу целиком, вместе с YAML-заголовком."
        ),
        checks=["provenance", "frontmatter", "links", "coverage", "no-invention"],
    ),
    Scenario(
        id="build-systems",
        topic="вентиляция, теплоснабжение и водоснабжение объекта",
        task=(
            "Напиши страницу вики про инженерные системы объекта по этому материалу. "
            "Одну страницу целиком, вместе с YAML-заголовком."
        ),
        checks=["provenance", "frontmatter", "links", "coverage", "no-invention"],
    ),
    Scenario(
        id="no-invention",
        topic="марка стали для колонн подземного паркинга",
        task=(
            "Напиши страницу вики про конструкции объекта по этому материалу. "
            "Отдельно укажи, какая марка стали применена для колонн подземного "
            "паркинга."
        ),
        # Ровно тот случай, на котором ловится выдумка: спрошено про предмет,
        # которого в проекте нет, а рядом лежит похожий.
        checks=["provenance", "no-invention"],
    ),
    Scenario(
        id="contradiction",
        topic="установленная мощность объекта по заданию на электроснабжение",
        task=(
            "Напиши страницу вики про установленную мощность объекта. В материале "
            "могут оказаться разные значения из разных редакций документов — "
            "оформи страницу так, как этого требуют правила."
        ),
        checks=["provenance", "contradiction", "no-invention"],
    ),
    Scenario(
        id="manual-edit",
        topic="электроснабжение объекта: мощность, категория надёжности",
        task=(
            "Обнови эту страницу вики по материалу ниже: источник переиздан. "
            "Верни страницу целиком."
        ),
        existing=(
            "---\n"
            "title: Электроснабжение объекта\n"
            "type: entity\n"
            "tags: [object, system/ЭОМ]\n"
            'sources: ["устарело"]\n'
            "updated: 2026-01-01\n"
            "---\n\n"
            "# Электроснабжение объекта\n\n"
            "Установленная мощность — 180 кВт.\n\n"
            "## Заметка инженера\n\n"
            "СОГЛАСОВАНО УСТНО С ЗАКАЗЧИКОМ 12.02: резерв держать на ТП-2.\n"
        ),
        manual_line="СОГЛАСОВАНО УСТНО С ЗАКАЗЧИКОМ 12.02: резерв держать на ТП-2.",
        checks=["provenance", "manual-edit"],
    ),
]


COVERAGE_RULES = """Ты проверяешь страницу вики проекта, написанную по материалу из документов.

Тебе дают МАТЕРИАЛ (фрагменты документов) и СТРАНИЦУ, написанную по нему.

Ответь строгим JSON: {"covered": true/false, "invented": true/false, "why": "одна фраза"}

covered — переданы ли на странице ключевые факты материала: значения, величины,
требования. Не требуй полноты пересказа: важно, что главное не потеряно.

invented — есть ли на странице утверждение О ПРОЕКТЕ, которого в материале нет:
число, марка, срок, взявшиеся ниоткуда. Сюда же — ВЫЧИСЛЕННОЕ значение (сумма,
разность, процент по данным материала): в документах его нет, а выглядит оно
как факт документа.

Выдумкой НЕ считаются, даже если этих слов в материале нет:
— оформление и редакционные формулы вики: «действующая редакция не определена»,
  «решение за инженером», заголовки разделов, подписи таблиц;
— утверждение, что чего-то в документах НЕТ, если оно опирается на материал
  («подземной автостоянки не предусмотрено»);
— связки и обобщения («объект имеет систему электроснабжения»).

Тебя спрашивают про факты о проекте, а не про стиль изложения.

Отвечай только JSON."""


@dataclass
class Outcome:
    scenario: str
    page: str
    results: dict[str, bool] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(self.results.values())


def check_provenance(conn, page: str) -> tuple[bool, str]:
    """Каждая ссылка разрешается в существующий фрагмент индекса."""
    citations, texts = qa.citation_texts(conn, page)
    if not citations:
        return False, "на странице нет ни одной ссылки"
    dead = [citation for citation, text in zip(citations, texts, strict=True) if not text]
    if dead:
        return False, f"ссылки в никуда: {', '.join(dead[:3])}"
    return True, f"{len(citations)} ссыл., все разрешаются"


def check_frontmatter(page: str) -> tuple[bool, str]:
    from aec_rag.wiki_lint import REQUIRED_FIELDS, parse_frontmatter

    fields = parse_frontmatter(page.strip())
    if not fields:
        return False, "нет YAML-заголовка"
    missing = [name for name in REQUIRED_FIELDS if not fields.get(name, "").strip()]
    return (not missing), ("все поля на месте" if not missing else f"нет полей: {missing}")


def check_links(page: str) -> tuple[bool, str]:
    links = WIKILINK.findall(page)
    return len(links) >= 2, f"связей: {len(links)} (нужно ≥2)"


def check_contradiction(page: str) -> tuple[bool, str]:
    if not CONTRADICTION.search(page):
        return False, "блока «Противоречие» нет"
    # Обе версии обязаны остаться: блок с одним значением — это не
    # противоречие, а тихий выбор редакции.
    numbers = set(re.findall(r"\d[\d\s.,]*\s*кВт", page))
    if len(numbers) < 2:
        return False, f"в блоке одно значение: {numbers or 'ни одного'}"
    return True, f"обе версии на месте: {', '.join(sorted(numbers))}"


# Разделитель только МЕЖДУ цифрами. С `[\d.,]*` на конце регулярка съедала
# точку в конце предложения: «С255.» в материале и «С255» на странице
# переставали быть одним числом, и проверка ругалась на своё же чтение.
NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


def check_numbers(material: str, page: str) -> tuple[bool, str]:
    """Каждое число страницы обязано встречаться в материале.

    Это и есть «нет выдумок», сведённое к тому, что можно проверить. Судья с
    этим вопросом не справился на трёх прогонах подряд: страница вики по
    построению перекладывает материал — заводит заголовки, связи `[[…]]`,
    сводные таблицы, — и любую перекладку он называл выдумкой («не в таком
    виде»). Число же либо есть в документах, либо взято ниоткуда, и спорить тут
    не о чем.

    Ловит ровно тот случай, ради которого проверка нужна: сумма мощностей по
    ведомости, которой ни в одном документе нет, а на странице она выглядит
    фактом документа.
    """
    known = set(NUMBER.findall(material))
    # Заголовок страницы и тела ссылок не в счёт: `updated:` — сегодняшняя дата,
    # а имя файла в ссылке и так пришло из материала.
    body = page.split("---", 2)[-1] if page.strip().startswith("---") else page
    body = re.sub(r"\[src:[^\]]*\]", " ", body)

    invented = sorted(
        {
            number
            for number in NUMBER.findall(body)
            # Однозначные не в счёт: это нумерация списков и пунктов, а не
            # величины, и в материале они есть почти всегда.
            if len(number) > 1 and number not in known
        },
        key=len,
        reverse=True,
    )
    if invented:
        return False, f"чисел не из материала: {', '.join(invented[:5])}"
    return True, "все числа из материала"


def check_manual_edit(page: str, manual_line: str) -> tuple[bool, str]:
    kept = manual_line.strip() in page
    return kept, "строка инженера на месте" if kept else "СТРОКА ИНЖЕНЕРА ЗАТЁРТА"


async def judge_coverage(material: str, page: str) -> tuple[bool, bool, str]:
    payload = json.dumps({"материал": material, "страница": page}, ensure_ascii=False)
    raw = await qa.ask(JUDGE_MODEL, COVERAGE_RULES, payload, json_mode=True)
    try:
        verdict = json.loads(raw)
    except json.JSONDecodeError:
        return False, True, f"судья ответил не JSON: {raw[:120]}"
    return (
        bool(verdict.get("covered")),
        bool(verdict.get("invented")),
        str(verdict.get("why", "")),
    )


async def run_scenario(conn, rag, scenario: Scenario, rules: str, top_k: int) -> Outcome:
    material = qa.render_context(
        {"chunks": await _search(conn, rag, scenario.topic, top_k)},
    )

    parts = [
        scenario.task,
        "Ответь ТОЛЬКО текстом страницы, целиком, от YAML-заголовка до конца. "
        "Файловых инструментов здесь нет: отчёт о проделанной работе вместо "
        "страницы — это пустой ответ.",
    ]
    if scenario.existing:
        parts.append("ТЕКУЩАЯ СТРАНИЦА:" + chr(10) * 2 + scenario.existing)
    parts.append("МАТЕРИАЛ:" + chr(10) * 2 + material)
    prompt = (chr(10) * 2).join(parts)

    page = await qa.ask(MODEL, rules, prompt)
    outcome = Outcome(scenario=scenario.id, page=page)

    if "provenance" in scenario.checks:
        ok, note = check_provenance(conn, page)
        outcome.results["provenance"] = ok
        outcome.notes.append(f"провенанс: {note}")
    if "frontmatter" in scenario.checks:
        ok, note = check_frontmatter(page)
        outcome.results["frontmatter"] = ok
        outcome.notes.append(f"заголовок: {note}")
    if "links" in scenario.checks:
        ok, note = check_links(page)
        outcome.results["links"] = ok
        outcome.notes.append(f"связи: {note}")
    if "contradiction" in scenario.checks:
        ok, note = check_contradiction(page)
        outcome.results["contradiction"] = ok
        outcome.notes.append(f"противоречие: {note}")
    if "manual-edit" in scenario.checks:
        ok, note = check_manual_edit(page, scenario.manual_line)
        outcome.results["manual-edit"] = ok
        outcome.notes.append(f"чужая правка: {note}")
    if "no-invention" in scenario.checks:
        ok, note = check_numbers(material, page)
        outcome.results["no-invention"] = ok
        outcome.notes.append(f"числа: {note}")
    if "coverage" in scenario.checks:
        covered, _invented, why = await judge_coverage(material, page)
        outcome.results["coverage"] = covered
        outcome.notes.append(f"покрытие: {'да' if covered else 'нет'} — {why}")

    return outcome


async def _search(conn, rag, query: str, top_k: int):
    from aec_rag.server import search_chunks

    return await search_chunks(conn, rag, query, top_k=top_k)


def render_report(outcomes: list[Outcome], started: str) -> str:
    passed = sum(1 for outcome in outcomes if outcome.passed)
    lines = [
        "# Smoke-эвал aec-wiki",
        "",
        f"Прогон: {started}. Модель: `{MODEL}`, судья: `{JUDGE_MODEL}`.",
        f"Сценариев: {len(outcomes)}, прошло целиком: {passed}.",
        "",
        "Критерии — `docs/history/specs/wiki.md` §Feature-level acceptance: покрытие ключевых",
        "фактов, валидность провенанса, отсутствие выдумок, явное оформление",
        "противоречия. Плюс то, что спека требует от страницы: заголовок и связи.",
        "",
        "Что именно меряет `manual-edit`: **правило само по себе**, без",
        "инструмента, — и одного прогона тут мало. Замерено по пять раз:",
        "**0 из 5** с первой редакцией правила, **3 из 5** после того, как",
        "требование переносить чужие абзацы дословно встало прямо в раздел",
        "обновления. То есть правило помогает и всё равно остаётся монеткой.",
        "",
        "Поэтому в продукте страницы вики пишутся через `wiki_write_page`: он",
        "отклоняет запись, из которой пропал чужой абзац, и называет пропавший",
        "(тесты — `mcp/aec_rag/tests/test_wiki.py`). Зелёная строка ниже",
        "означает «в этот раз обошлось», а не «правило держит»: держит",
        "инструмент.",
        "",
        "| Сценарий | Итог | Проверки |",
        "|---|---|---|",
    ]
    for outcome in outcomes:
        marks = ", ".join(
            f"{name}: {'✓' if value else '✗'}" for name, value in outcome.results.items()
        )
        verdict = "прошёл" if outcome.passed else "**НЕ прошёл**"
        lines.append(f"| `{outcome.scenario}` | {verdict} | {marks} |")

    lines += ["", "## Подробно", ""]
    for outcome in outcomes:
        lines += [f"### {outcome.scenario}", ""]
        lines += [f"- {note}" for note in outcome.notes]
        lines += [
            "",
            "<details><summary>Страница</summary>",
            "",
            "```markdown",
            outcome.page,
            "```",
            "",
            "</details>",
            "",
        ]
    return "\n".join(lines)


async def main_async(args) -> int:
    qa.load_env_file(Path(args.env_file))
    # Раннер `aec-qa` открывает свой vault константой модуля; здесь нужен
    # другой, поэтому она подменяется на время прогона. Подмена одной строкой
    # честнее, чем копия функции открытия индекса.
    qa.VAULT = Path(args.vault)
    conn, rag = await qa.open_index_and_db()
    rules = qa.skill_rules(SKILL)

    scenarios = [s for s in SCENARIOS if not args.only or s.id == args.only]
    if not scenarios:
        raise SystemExit(f"нет сценария {args.only!r}")

    started = datetime.now(UTC).isoformat(timespec="seconds")
    outcomes = []
    for scenario in scenarios:
        print(f"— {scenario.id}", flush=True)
        outcomes.append(await run_scenario(conn, rag, scenario, rules, args.top_k))

    report = render_report(outcomes, started)
    out = Path(args.out) if args.out else REPORT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8", newline="\n")
    print(f"\nотчёт: {out}")

    failed = [outcome.scenario for outcome in outcomes if not outcome.passed]
    if failed:
        print(f"не прошли: {', '.join(failed)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="wiki-eval")
    parser.add_argument("--only", help="Один сценарий по id")
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--out", help="Куда записать отчёт")
    parser.add_argument("--env-file", default=str(qa.DEFAULT_ENV_FILE))
    parser.add_argument("--vault", default=str(WIKI_VAULT))
    args = parser.parse_args(argv)
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
