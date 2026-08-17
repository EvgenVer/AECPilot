"""Замер под решение по скилу `grounded-citations` (задача 3.22).

    uv run python eval/grounded_citations_probe.py

Три плеча на одних и тех же пяти вопросах эталонного набора:

* **A** — скил `aec-qa` как он есть сегодня;
* **B** — тот же скил плюс требование дословной выдержки, но БЕЗ проверки
  (`eval/variants/evidence-rule.md`) — «перенесли правило своими словами»;
* **C** — то же требование, но выдержку принимает или отвергает **их скрипт**
  `sources.py` из скила `grounded-citations` (`eval/variants/evidence-with-script.md`).

Плечо C — это «взять скил целиком»: их инструкция, их скрипт, вызываемый как
есть, без единой правки и без вендоринга — скил ставится вместе с ядром. В
продукте эту же команду выполнил бы терминал агента; здесь она подставлена
инструментом, чтобы текст фрагмента брался из индекса, а не из того, что
прислала модель.

От их механики не берётся только рендер блока `Sources:` и нумерация `[1]`:
интерфейс узнаёт цитату по форме `[src: …](#cite)` и по ней открывает документ
(задача 2.13), а номер в скобках открыть нечего. Реестр при этом используется —
без него нет `quote`, а `quote` и есть проверка.

Сверку выдержки в отчёте считает ИХ же функция `quote_in_evidence`, а не наша
копия: замер про их код.

Что считается:

* correctness и citation validity — теми же функциями, что и обычный эвал
  (`eval/runner/run.py`), чтобы числа сравнивались с baseline 2.17;
* доля выдержек, которые ДЕЙСТВИТЕЛЬНО есть в процитированном тексте;
* в плече C — сколько раз скрипт вызвали и сколько раз он отказал;
* длина ответа — цена правила в символах.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import tempfile
import time
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
VARIANT_C = REPO_ROOT / "eval" / "variants" / "evidence-with-script.md"
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


# --- плечо C: их скрипт в цепочке ------------------------------------------
#
# Плечо B показало, что переносить ПРАВИЛО без их ПРОВЕРКИ бессмысленно.
# Здесь проверка на месте: выдержку принимает или отвергает `sources.py` —
# скрипт самого скила, вызываемый как есть, без единой правки. Ничего не
# вендорится: скил ставится вместе с ядром (`skills/research/grounded-citations`).

SOURCES_PY = DONOR_SKILL / "scripts" / "sources.py"

ATTACH_TOOL = {
    "type": "function",
    "function": {
        "name": "attach_evidence",
        "description": (
            "Проверяет дословную выдержку по тексту процитированного фрагмента. "
            "Вызывать ДО того, как выдержка попадёт в ответ."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "citation": {
                    "type": "string",
                    "description": "Ссылка на фрагмент целиком, как в ответе: [src: …]",
                },
                "quote": {
                    "type": "string",
                    "description": "Фраза, скопированная из текста фрагмента дословно",
                },
            },
            "required": ["citation", "quote"],
        },
    },
}


class EvidenceGate:
    """Их `sources.py` как подпроцесс: `add` заводит источник, `quote` сверяет.

    Текст фрагмента берётся из индекса по самой ссылке, а не из того, что
    прислала модель, — иначе «доказательством» становился бы её собственный
    текст. В продукте роль этого класса сыграл бы терминал агента: скил уже
    установлен, команда та же.
    """

    def __init__(self, conn, workdir: Path) -> None:
        self.conn = conn
        self.workdir = workdir
        self.ledger = workdir / "ledger.json"
        self.ids: dict[str, int] = {}
        self.calls: list[dict[str, Any]] = []
        self._run(["reset"])

    def _run(self, argv: list[str]) -> tuple[int, str]:
        import os
        import subprocess

        # Их скрипт печатает по-русски (наши ссылки и цитаты), а консоль Windows
        # по умолчанию не utf-8 — без этого падает не проверка, а её чтение.
        env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
        result = subprocess.run(
            [sys.executable, str(SOURCES_PY), "--ledger", str(self.ledger), *argv],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
        )
        return result.returncode, ((result.stdout or "") + (result.stderr or "")).strip()

    def attach(self, citation: str, quote: str) -> str:
        _, texts = qa.citation_texts(self.conn, citation)
        evidence = "\n".join(text for text in texts if text)
        if not evidence:
            answer = (
                "error: эта ссылка не разрешается ни в один фрагмент индекса — "
                "проверьте её или возьмите другой фрагмент"
            )
            self.calls.append(
                {"citation": citation, "quote": quote, "accepted": False, "out": answer}
            )
            return answer

        if citation not in self.ids:
            code, out = self._run(["add", f"aecpilot://{citation}"])
            if code != 0:
                return out
            self.ids[citation] = int(out.split("]")[0].lstrip("["))

        evidence_file = self.workdir / f"evidence-{self.ids[citation]}.txt"
        evidence_file.write_text(evidence, encoding="utf-8")
        code, out = self._run(
            ["quote", str(self.ids[citation]), "--text", quote, "--from", str(evidence_file)]
        )
        self.calls.append({"citation": citation, "quote": quote, "accepted": code == 0, "out": out})
        return out


async def answer_with_gate(rules: str, prompt: str, gate: EvidenceGate) -> str:
    """Тот же вызов модели, что и в раннере, но с инструментом и циклом.

    Цикл — и есть «скрипт в цепочке»: пока модель не получит от скрипта
    «принято», выдержки у неё нет.
    """
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": rules},
        {"role": "user", "content": prompt},
    ]
    client = qa.client()
    for _ in range(8):
        response = await client.chat.completions.create(
            model=qa.ANSWER_MODEL, messages=messages, tools=[ATTACH_TOOL]
        )
        message = response.choices[0].message
        if not message.tool_calls:
            return message.content or ""
        messages.append(message.model_dump(exclude_none=True))
        for call in message.tool_calls:
            try:
                payload = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                payload = {}
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": gate.attach(
                        str(payload.get("citation", "")), str(payload.get("quote", ""))
                    ),
                }
            )
    # Восемь ходов — это уже не «уточнил выдержку», а зацикливание; такой ответ
    # честнее считать несостоявшимся, чем дорисовывать.
    return ""


async def run_arm_c(conn, rag, questions, rules: str, top_k: int, workdir: Path):
    rows: list[dict[str, Any]] = []
    for index, question in enumerate(questions, start=1):
        started = time.monotonic()
        material = await qa.gather_context(conn, rag, question, top_k)
        prompt = (
            f"Найденное в документах проекта:\n\n{qa.render_context(material)}\n\n"
            f"ВОПРОС: {question.question}"
        )
        gate = EvidenceGate(conn, workdir / question.id)
        answer = (await answer_with_gate(rules, prompt, gate)).strip()
        citations, texts = qa.citation_texts(conn, answer)
        citation_valid, problems = qa.check_answer(question, answer, citations, texts)
        correct, reason = await qa.judge(question, answer)
        outcome = qa.Outcome(
            question=question,
            answer=answer,
            citations=citations,
            correct=correct,
            citation_valid=citation_valid,
            judge_reason=reason,
            problems=problems,
            seconds=time.monotonic() - started,
        )
        row = outcome.as_dict()
        row["evidence"] = evidence_stats(answer, texts)
        row["answer_chars"] = len(answer)
        row["gate"] = {
            "calls": len(gate.calls),
            "rejected": sum(1 for call in gate.calls if not call["accepted"]),
            "log": gate.calls,
        }
        rows.append(row)
        mark = "OK " if correct and citation_valid else "FAIL"
        print(
            f"[C {index}/{len(questions)}] {mark} {question.id} ({question.type}) "
            f"выдержек {row['evidence']['quotes']}, подтверждено {row['evidence']['grounded']}, "
            f"скрипт: {row['gate']['calls']} вызов(ов), отказов {row['gate']['rejected']} "
            f"{'; '.join(problems)}",
            flush=True,
        )
    return rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    answered = [row for row in rows if row["type"] not in ("negative", "injection")]
    quotes = sum(row["evidence"]["quotes"] for row in rows)
    grounded = sum(row["evidence"]["grounded"] for row in rows)
    summary = {
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
    if any("gate" in row for row in rows):
        summary["gate_calls"] = sum(row.get("gate", {}).get("calls", 0) for row in rows)
        summary["gate_rejected"] = sum(row.get("gate", {}).get("rejected", 0) for row in rows)
    return summary


async def main_async(args) -> int:
    questions = {q.id: q for q in qa.load_dataset(Path(args.dataset))}
    missing = [qid for qid in QUESTION_IDS if qid not in questions]
    if missing:
        raise SystemExit(f"в наборе нет вопросов: {', '.join(missing)}")
    selected = [questions[qid] for qid in QUESTION_IDS]

    base_rules = qa.skill_rules()

    def variant(path: Path) -> str:
        return f"{base_rules}\n\n{path.read_text(encoding='utf-8').split('---', 1)[-1].strip()}"

    workdir = Path(tempfile.mkdtemp(prefix="grounded-citations-"))

    conn, rag = await qa.open_index_and_db()
    try:
        arm_a = await run_arm(conn, rag, selected, base_rules, args.top_k, "A")
        arm_b = await run_arm(conn, rag, selected, variant(VARIANT), args.top_k, "B")
        arm_c = await run_arm_c(conn, rag, selected, variant(VARIANT_C), args.top_k, workdir)
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
            "C": {
                "rules": "skills/aec-qa/SKILL.md + eval/variants/evidence-with-script.md",
                "script": str(SOURCES_PY.relative_to(REPO_ROOT)),
                "summary": summarize(arm_c),
                "outcomes": arm_c,
            },
        },
    }
    out = Path(args.out) if args.out else OUT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        json.dumps(
            {arm: report["arms"][arm]["summary"] for arm in ("A", "B", "C")},
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
