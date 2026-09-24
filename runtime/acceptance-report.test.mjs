// Отчёт приёмки (3F.11) собирается из записей прогона. Тесты — на чистых
// функциях генератора: сведение записей по позиции, сумма расхода, шаг
// чек-листа и раскладка позиций по разделам отчёта.

import { describe, expect, it } from "vitest";
import { buildReport, mergeEvidence, stepText, sumUsage } from "../apps/desktop/e2e/lib/report.mjs";

describe("mergeEvidence", () => {
  it("keeps the worst verdict and collects shots and transcripts without repeats", () => {
    const merged = mergeEvidence([
      { position: "1.1.1", verdict: "pass", title: "t", shot: "a.png", transcript: "x" },
      { position: "1.1.1", verdict: "note", title: "t", note: "к владельцу", shot: "a.png" },
      { position: "1.1.1", verdict: "pass", title: "t" },
      { verdict: "fail" }
    ]);
    expect(merged.size).toBe(1);
    const row = merged.get("1.1.1");
    expect(row.verdict).toBe("note");
    expect(row.shots).toEqual(["a.png"]);
    expect(row.transcripts).toEqual(["x"]);
    expect(row.notes).toEqual(["к владельцу"]);
  });
});

describe("sumUsage", () => {
  it("adds every numeric field and counts turns", () => {
    const usage = sumUsage([
      { usage: { input: 10, output: 2, model: "m" } },
      { usage: { input: 5 } },
      { usage: null }
    ]);
    expect(usage).toEqual({ turns: 3, total: { input: 15, output: 2 } });
  });
});

describe("stepText", () => {
  it("returns the numbered step above the position with its continuation", () => {
    const lines = ["## 1. Блок", "", "1. Открой окно", "   и нажми кнопку.", "   ✓ 1.1.1 [человек] видно окно"];
    expect(stepText(lines, 5)).toBe("1. Открой окно и нажми кнопку.");
  });

  it("stops at the block heading", () => {
    expect(stepText(["## 2. Блок", "   ✓ 2.1.1 [e2e] x"], 2)).toBe("");
  });
});

describe("buildReport", () => {
  const positions = [
    { id: "1.1.1", label: "[e2e]", text: "пройдена", block: "1", step: "1", line: 1 },
    { id: "1.1.2", label: "[live]", text: "красная", block: "1", step: "1", line: 1 },
    { id: "1.1.3", label: "[live]", text: "fixme", block: "1", step: "1", line: 1 },
    { id: "1.1.4", label: "[человек]", text: "рукой", block: "1", step: "1", line: 1 }
  ];
  const report = buildReport({
    date: "2026-09-24",
    positions,
    merged: mergeEvidence([
      { position: "1.1.1", verdict: "pass", transcript: "стенограмма" },
      { position: "1.1.2", verdict: "fail", note: "a | b" }
    ]),
    tested: new Set(["1.1.1", "1.1.2", "1.1.3"]),
    fixme: new Set(["1.1.3"]),
    usage: { turns: 2, total: { input: 7 } },
    run: null,
    lines: ["1. Шаг"],
    build: { commit: "abc1234", core: "0.21.3" }
  });

  it("puts each position in its section", () => {
    expect(report).toContain("## Красные позиции (1)");
    expect(report).toContain("| 1.1.2 | [live] | ❌ красная | красная | a \\| b |");
    expect(report).toContain("| 1.1.3 | [live] | ⏸ fixme |");
    expect(report).toContain("- [ ] 1.1.4 — рукой");
    expect(report).toContain("Ходов модели: 2; токены — input: 7.");
  });

  it("links the transcript to its anchor", () => {
    expect(report).toContain("[стенограмма](#t-1-1-1)");
    expect(report).toContain('<a id="t-1-1-1"></a>');
  });
});
