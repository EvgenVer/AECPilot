"""Замер под решение по скилу `grounded-citations` (задача 3.22).

    uv run python eval/grounded_citations_probe.py

Два плеча на одних и тех же пяти вопросах эталонного набора:

* **A** — скил `aec-qa` как он есть сегодня;
* **B** — тот же скил плюс ОДНА добавка (`eval/variants/evidence-rule.md`):
  к каждой ссылке требуется дословная выдержка из процитированного фрагмента.

Плечо B — это и есть «адаптировать», выраженное так, чтобы его можно было
померить. Механику скила донора целиком (реестр `url → [n]`, `sources.py add`,
`verify`) померить нельзя и не нужно: наши ссылки не URL, они приходят из
`rag_query` вместе с файлом и локатором, а нумерованная `[1]` сломала бы разбор
цитаты в интерфейсе. Переносимая часть у них ровно одна — «Fact-Checking Mode»:
выдержка, которую проверяют по тексту источника.

Сверку выдержки делает ИХ функция `quote_in_evidence` из
`skills/research/grounded-citations/scripts/sources.py`, а не наша копия: замер
про их код, и переписанный своими руками матчер мерил бы уже наш.

Что считается:

* correctness и citation validity — теми же функциями, что и обычный эвал
  (`eval/runner/run.py`), чтобы числа сравнивались с baseline 2.17;
* доля выдержек, которые ДЕЙСТВИТЕЛЬНО есть в процитированном тексте;
* длина ответа — цена правила в символах.
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

DONOR_SKILL = REPO_ROOT / "runtime" / "dev-profile" / "skills" / "research" / "grounded-citations"
sys.path.insert(0, str(DONOR_SKILL / "scripts"))
from sources import quote_in_evidence  # noqa: E402  (их матчер, не наша копия)

VARIANT = REPO_ROOT / "eval" / "variants" / "evidence-rule.md"
OUT = REPO_ROOT / "eval" / "reports" / "grounded-citations-probe.json"

# Пять вопросов эталонного набора. Выбраны не «первые пять», а разброс, в
# котором правило выдержки может сломаться по-разному:
#   s001 — число в прозе (простой случай),
#   s009 — значение из строки таблицы: дословно цитировать таблицу нечем,
#   g001 — число из PDF на 111 странице, вопрос просмотрен владельцем,
#   s011 — отказа не бывает без соблазна подпереть его выдуманной выдержкой,
#   s015 — инъекция: правило «цитируй дословно» может заставить повторить
#          подставную фразу — ровно то, что AC запрещает.
QUESTION_IDS = ["s001", "s009", "g001", "s011", "s015"]

# Выдержка в ответе: «ёлочки» или обычные кавычки, от четырёх слов — короче
# берутся обозначения вроде «В», а не цитаты.
QUOTE_RE = re.compile(r"«([^»]{10,400})»|\"([^\"]{10,400})\"")


def quotes_in(answer: str) -> list[str]:
    found: list[str] = []
    for match in QUOTE_RE.finditer(answer):
        text = (match.group(1) or match.group(2) or "").strip()
        if len(text.split()) >= 4:
            found.append(text)
    return found


def evidence_stats(answer: str, texts: list[str]) -> dict[str, Any]:
    """Сколько выдержек в ответе и сколько из них есть в процитированном тексте.

    Сверяется по объединению процитированных фрагментов, а не по конкретному:
    выдержка, которой нет НИ В ОДНОМ из них, выдумана наверняка, а привязка
    «эта выдержка к этой ссылке» в нашем формате не выражена — и это тоже
    результат замера, а не недосмотр.
    """
    evidence = "\n".join(texts)
    found = quotes_in(answer)
    grounded = [quote for quote in found if quote_in_evidence(quote, evidence)]
    return {
        "quotes": len(found),
        "grounded": len(grounded),
        "fabricated": [quote for quote in found if quote not in grounded],
    }


async def run_arm(conn, rag, questions, rules: str, top_k: int, label: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, question in enumerate(questions, start=1):
        outcome = await qa.run_one(conn, rag, question, rules, top_k)
        _, texts = qa.citation_texts(conn, outcome.answer)
        row = outcome.as_dict()
        row["evidence"] = evidence_stats(outcome.answer, texts)
        row["answer_chars"] = len(outcome.answer)
        rows.append(row)
        mark = "OK " if outcome.correct and outcome.citation_valid else "FAIL"
        print(
            f"[{label} {index}/{len(questions)}] {mark} {question.id} ({question.type}) "
            f"выдержек {row['evidence']['quotes']}, "
            f"подтверждено {row['evidence']['grounded']} "
            f"{'; '.join(outcome.problems)}",
            flush=True,
        )
    return rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    answered = [row for row in rows if row["type"] not in ("negative", "injection")]
    quotes = sum(row["evidence"]["quotes"] for row in rows)
    grounded = sum(row["evidence"]["grounded"] for row in rows)
    return {
        "questions": len(rows),
        "correct": sum(1 for row in rows if row["correct"]),
        "citation_valid": sum(1 for row in rows if row["citation_valid"]),
        "correctness": round(sum(1 for r in answered if r["correct"]) / len(answered), 3)
        if answered
        else 0.0,
        "quotes": quotes,
        "grounded_quotes": grounded,
        "grounded_share": round(grounded / quotes, 3) if quotes else None,
        "answer_chars_avg": round(sum(row["answer_chars"] for row in rows) / len(rows)),
    }


async def main_async(args) -> int:
    questions = {q.id: q for q in qa.load_dataset(Path(args.dataset))}
    missing = [qid for qid in QUESTION_IDS if qid not in questions]
    if missing:
        raise SystemExit(f"в наборе нет вопросов: {', '.join(missing)}")
    selected = [questions[qid] for qid in QUESTION_IDS]

    base_rules = qa.skill_rules()
    addition = VARIANT.read_text(encoding="utf-8").split("---", 1)[-1].strip()
    variant_rules = f"{base_rules}\n\n{addition}"

    conn, rag = await qa.open_index_and_db()
    try:
        arm_a = await run_arm(conn, rag, selected, base_rules, args.top_k, "A")
        arm_b = await run_arm(conn, rag, selected, variant_rules, args.top_k, "B")
    finally:
        conn.close()

    report = {
        "started_at": args.stamp,
        "answer_model": qa.ANSWER_MODEL,
        "judge_model": qa.JUDGE_MODEL,
        "question_ids": QUESTION_IDS,
        "arms": {
            "A": {
                "rules": "skills/aec-qa/SKILL.md",
                "summary": summarize(arm_a),
                "outcomes": arm_a,
            },
            "B": {
                "rules": "skills/aec-qa/SKILL.md + eval/variants/evidence-rule.md",
                "summary": summarize(arm_b),
                "outcomes": arm_b,
            },
        },
    }
    out = Path(args.out) if args.out else OUT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        json.dumps(
            {arm: report["arms"][arm]["summary"] for arm in ("A", "B")},
            ensure_ascii=False,
            indent=2,
        )
    )
    print(f"== отчёт: {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="grounded-citations-probe")
    parser.add_argument("--dataset", default=str(qa.DATASET))
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--env-file", default=str(qa.DEFAULT_ENV_FILE))
    parser.add_argument("--out", help="Куда записать отчёт (для повторного прогона)")
    args = parser.parse_args(argv)
    args.stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")

    qa.load_env_file(Path(args.env_file))
    import os

    if not os.environ.get("OPENAI_API_KEY"):
        print("probe: OPENAI_API_KEY не задан", file=sys.stderr)
        return 1
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
