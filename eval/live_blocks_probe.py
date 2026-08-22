"""Замер под задачу 3.4г: научится ли агент выдавать живые блоки — и не начнёт ли
ставить их где попало.

    uv run python eval/live_blocks_probe.py

ЗАЧЕМ ЗАМЕР ВООБЩЕ. Правка продуктовой инструкции для агента по правилам проекта
(AGENTS §9) либо проверяется эвалом, либо сопровождается записанным отказом от
проверки. Владелец выбрал эвал (решение 2026-08-21).

ТРИ ПЛЕЧА на одних и тех же пяти вопросах:

* **A** — скил `aec-qa` как он есть: блоки нарисованы в приложении, но имена
  директив знает только оно, и агент их не выдаёт. Ожидание — ноль блоков.
* **B** — тот же скил плюс правило-ОПИСАНИЕ о трёх блоках
  (`eval/variants/live-blocks-rule.md`): «когда рамка лучше абзаца».
* **C** — то же правило в форме ЗАПРЕТА альтернативы
  (`eval/variants/live-blocks-rule-strict.md`): «не перепечатывай таблицу
  markdown — выведи блок». Разница между B и C одна и она в форме, а не в
  содержании; это и есть измеряемая гипотеза.

ЧТО СЧИТАЕТСЯ, И ПОЧЕМУ ИМЕННО ЭТО. «Появился ли блок» — половина вопроса, и
более лёгкая. Вторая половина: не начал ли агент обрамлять рамками то, чему
хватало предложения. Правило, из-за которого каждый ответ обрастает блоками,
ХУЖЕ отсутствия правила: читать станет труднее, а не легче. Поэтому в наборе
два вопроса, где блок уместен, и три, где он не нужен, и провалом считается
любая из двух ошибок.

`correct` и `citation_valid` в отчёте ЕСТЬ, но приговором здесь не являются: у
случаев этого замера нет эталонных ответов, и судья раннера, не имея с чем
сверить, называет конкретное число неподтверждённым. Правильность ответов —
работа обычного эвала (2.17) на его собственном наборе; здесь эти числа стоят
рядом только чтобы видеть, что ответы не превратились в мусор.

МАТЕРИАЛ — вымышленный мини-проект `eval/fixtures/wiki-project` (индекс
`eval/.wiki-vault`): в нём есть две редакции одного задания с разными числами
(расхождение) и ведомость щитов в CSV (таблица). Настоящие документы владельца
для этого не нужны, а замер воспроизводится на свежем клоне.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "eval"))
sys.path.insert(0, str(REPO_ROOT / "eval" / "runner"))

import run as qa  # noqa: E402  (раннер эвала — его же функции, чтобы числа были сравнимы)

VARIANT_B = REPO_ROOT / "eval" / "variants" / "live-blocks-rule.md"
VARIANT_C = REPO_ROOT / "eval" / "variants" / "live-blocks-rule-strict.md"
WIKI_VAULT = REPO_ROOT / "eval" / ".wiki-vault"
OUT = REPO_ROOT / "eval" / "reports" / "live-blocks-probe.json"

# Директива занимает АБЗАЦ ЦЕЛИКОМ — то же правило, что у разбора в приложении
# (`aec/transcript-blocks/blocks-pure.ts`). Здесь оно и проверяется: строка с
# текстом до или после директивы блоком не станет, и засчитывать её нельзя.
DIRECTIVE_RE = re.compile(r"^::(aec-clause|aec-conflict|aec-table)\{[^\n}]*\}\s*$", re.MULTILINE)


class Case:
    """Вопрос и ожидание: какой блок уместен — или что блока быть не должно."""

    def __init__(
        self, id: str, question: str, expect: str | None, why: str, type: str = "factual"
    ) -> None:
        self.id = id
        self.question = question
        self.expect = expect
        self.why = why
        # Тип нужен судье раннера: отказ «этого в документах нет» он засчитывает
        # правильным только для `negative`, а для `factual` считает промахом.
        self.type = type

    def as_question(self) -> qa.Question:
        return qa.Question(
            id=self.id,
            question=self.question,
            type=self.type,
            provenance="live-blocks-probe",
        )


# `::aec-clause` здесь НЕ измеряется, и это не пропуск, а свойство материала:
# ни в одном документе вымышленного мини-проекта нет нумерованных пунктов (ни
# «п. 3.2», ни ссылок на СП/ГОСТ) — проверено поиском. Вопрос «каким пунктом
# задано …» на таком материале не имеет правильного ответа, и агент правильно
# отвечает прозой. Правило про этот блок уезжает в скил НЕИЗМЕРЕННЫМ, и так и
# записано в задаче: измерить его можно будет на настоящем проекте, где
# нормативные пункты есть.
CASES = [
    Case(
        "b-conflict",
        "Сверь ЭОМ-задание редакции 1 и редакции 2: что изменилось по установленной мощности?",
        "aec-conflict",
        "два документа говорят разное об одном предмете — это и есть карточка расхождения",
    ),
    Case(
        "b-table",
        "Покажи ведомость щитов.",
        "aec-table",
        "ответ — в строках файла-ведомости; пересказ прозой теряет столбцы",
    ),
    Case(
        "b-plain-power",
        "Какая установленная мощность указана в ЭОМ-задании редакции 2?",
        "none",
        "одно значение — рамка вокруг цифры не делает её вернее",
    ),
    Case(
        "b-plain-heating",
        "Какая расчётная температура внутреннего воздуха в задании по отоплению и вентиляции?",
        "none",
        "один факт со ссылкой; блоку здесь нечего показывать",
    ),
    Case(
        "b-plain-absent",
        "Что сказано в проекте про газоснабжение?",
        "none",
        "отказ «в документах этого нет» — блок превратил бы пустоту в рамку",
        type="negative",
    ),
]


def directives_in(answer: str) -> list[str]:
    return [match.group(1) for match in DIRECTIVE_RE.finditer(answer)]


def grade(case: Case, answer: str) -> dict[str, Any]:
    found = directives_in(answer)

    if case.expect == "none":
        return {
            "expected": "none",
            "found": found,
            "ok": len(found) == 0,
            "failure": "лишний блок" if found else "",
        }

    return {
        "expected": case.expect,
        "found": found,
        "ok": case.expect in found,
        "failure": "" if case.expect in found else ("не тот блок" if found else "блока нет"),
    }


async def run_arm(conn, rag, cases: list[Case], rules: str, top_k: int, label: str):
    rows: list[dict[str, Any]] = []
    for index, case in enumerate(cases, start=1):
        outcome = await qa.run_one(conn, rag, case.as_question(), rules, top_k)
        row = outcome.as_dict()
        row["blocks"] = grade(case, outcome.answer)
        row["why"] = case.why
        row["answer_chars"] = len(outcome.answer)
        rows.append(row)
        mark = "OK  " if row["blocks"]["ok"] else "FAIL"
        print(
            f"[{label} {index}/{len(cases)}] {mark} {case.id}: "
            f"ждали {row['blocks']['expected']}, нашли {row['blocks']['found'] or '—'} "
            f"{row['blocks']['failure']}",
            flush=True,
        )
    return rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    # Плечо могло не гоняться вовсе (`--arms A` для повторов). Пустая сводка —
    # нормальный ответ; деление на ноль здесь стоило двух потерянных отчётов.
    if not rows:
        return {"cases": 0}

    wanted = [row for row in rows if row["blocks"]["expected"] != "none"]
    plain = [row for row in rows if row["blocks"]["expected"] == "none"]

    return {
        "cases": len(rows),
        # Блок появился там, где он уместен.
        "blocks_when_wanted": sum(1 for row in wanted if row["blocks"]["ok"]),
        "blocks_wanted_total": len(wanted),
        # Блока НЕТ там, где хватало текста. Это вторая половина замера и
        # единственная защита от правила, которое обрамляет всё подряд.
        "clean_when_plain": sum(1 for row in plain if row["blocks"]["ok"]),
        "plain_total": len(plain),
        "correct": sum(1 for row in rows if row["correct"]),
        "citation_valid": sum(1 for row in rows if row["citation_valid"]),
        "answer_chars_avg": round(sum(row["answer_chars"] for row in rows) / len(rows)),
    }


async def main_async(args) -> int:
    qa.load_env_file(Path(args.env_file))
    # Раннер открывает свой vault константой модуля; здесь нужен вымышленный
    # мини-проект. Подмена одной строкой честнее копии функции открытия индекса
    # (тот же приём, что в `eval/wiki_eval.py`).
    qa.VAULT = Path(args.vault)

    base_rules = qa.skill_rules()

    def variant(path: Path) -> str:
        """Скил плюс испытуемая добавка — и ничего кроме неё."""
        body = path.read_text(encoding="utf-8").split("---", 1)[-1].strip()
        return f"{base_rules}\n\n{body}"

    cases = [case for case in CASES if not args.only or case.id == args.only]
    if not cases:
        raise SystemExit(f"нет случая {args.only!r}")

    conn, rag = await qa.open_index_and_db()
    try:
        arms = set(args.arms.split(","))
        arm_a = await run_arm(conn, rag, cases, base_rules, args.top_k, "A") if "A" in arms else []
        arm_b = (
            await run_arm(conn, rag, cases, variant(VARIANT_B), args.top_k, "B")
            if "B" in arms
            else []
        )
        arm_c = (
            await run_arm(conn, rag, cases, variant(VARIANT_C), args.top_k, "C")
            if "C" in arms
            else []
        )
    finally:
        conn.close()

    report = {
        "started_at": args.stamp,
        "answer_model": qa.ANSWER_MODEL,
        "judge_model": qa.JUDGE_MODEL,
        "vault": str(Path(args.vault).name),
        "cases": [{"id": c.id, "expect": c.expect, "why": c.why} for c in cases],
        "arms": {
            "A": {
                "rules": "skills/aec-qa/SKILL.md",
                "summary": summarize(arm_a),
                "outcomes": arm_a,
            },
            "B": {
                "rules": "skills/aec-qa/SKILL.md + eval/variants/live-blocks-rule.md",
                "summary": summarize(arm_b),
                "outcomes": arm_b,
            },
            "C": {
                "rules": "skills/aec-qa/SKILL.md + eval/variants/live-blocks-rule-strict.md",
                "summary": summarize(arm_c),
                "outcomes": arm_c,
            },
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    out = Path(args.out) if args.out else OUT
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        json.dumps(
            {
                arm: report["arms"][arm]["summary"]
                for arm in ("A", "B", "C")
                if report["arms"][arm]["outcomes"]
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    print(f"== отчёт: {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="live-blocks-probe")
    parser.add_argument("--vault", default=str(WIKI_VAULT))
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--only", help="Только этот случай")
    # Плечи по отдельности нужны для ПОВТОРОВ: одна удача — не результат, а
    # прогонять ради повтора все три плеча значит платить втрое за ответ на
    # вопрос об одном.
    parser.add_argument("--arms", default="A,B,C", help="Какие плечи гонять")
    parser.add_argument("--out", help="Куда записать отчёт")
    parser.add_argument("--env-file", default=str(qa.DEFAULT_ENV_FILE))
    args = parser.parse_args(argv)
    args.stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
