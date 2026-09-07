// Задача 3E.7 (R21). Тесты держат СВЕРКУ, а не список: сам список берётся у
// ядра прогоном. Ломаться должна сверка — иначе «расхождений нет» однажды будет
// значить «сверять перестали».

import { describe, expect, it } from "vitest";

import { compare, KNOWN_GAPS, MUST_ASK, MUST_PASS } from "./execution-boundary.mjs";

/** Ответ ядра в форме, в которой его отдаёт `askCore`. */
function coreSays({ asks = [], passes = [], gaps = [] } = {}) {
  const commands = {};
  for (const cmd of asks) commands[cmd] = { asks: true, why: "тест", hardline: false };
  for (const cmd of passes) commands[cmd] = { asks: false, why: null, hardline: false };
  for (const cmd of gaps) commands[cmd] = { asks: false, why: null, hardline: false };
  return { mode_without_key: "smart", commands };
}

const HEALTHY = coreSays({
  asks: MUST_ASK,
  passes: MUST_PASS,
  gaps: KNOWN_GAPS.map((g) => g.command),
});

const OUR_MAIN = `
  applyConfigDefault(homeDir, 'approvals', 'mode', 'manual', 'the approvals mode')
  ...(project ? { cwd: project.vaultPath } : {}),
`;

describe("compare", () => {
  it("здоровое состояние расхождений не даёт", () => {
    expect(compare(HEALTHY, OUR_MAIN)).toEqual([]);
  });

  it("ядро перестало спрашивать про разрушающую команду — расхождение", () => {
    const core = coreSays({
      asks: MUST_ASK.filter((c) => c !== "git reset --hard"),
      passes: [...MUST_PASS, "git reset --hard"],
      gaps: KNOWN_GAPS.map((g) => g.command),
    });
    expect(compare(core, OUR_MAIN).join(" ")).toContain("git reset --hard");
  });

  it("ядро начало спрашивать про обычную команду — тоже расхождение", () => {
    // Подтверждение на `ls` превращает диалог в кнопку «да», и защиты не
    // остаётся: это не «перестраховались», это сломали.
    const core = coreSays({
      asks: [...MUST_ASK, "ls -la"],
      passes: MUST_PASS.filter((c) => c !== "ls -la"),
      gaps: KNOWN_GAPS.map((g) => g.command),
    });
    expect(compare(core, OUR_MAIN).join(" ")).toContain("кнопкой");
  });

  it("дыра закрылась в ядре — говорим снять устаревшую запись", () => {
    const core = coreSays({
      asks: [...MUST_ASK, KNOWN_GAPS[0].command],
      passes: MUST_PASS,
      gaps: KNOWN_GAPS.slice(1).map((g) => g.command),
    });
    expect(compare(core, OUR_MAIN).join(" ")).toContain("ДЫРА ЗАКРЫТА");
  });

  it("наш слой пропал — расхождение по каждому слою отдельно", () => {
    const noMode = compare(HEALTHY, "...(project ? { cwd: project.vaultPath } : {})").join(" ");
    expect(noMode).toContain("approvals.mode: manual");

    const noCwd = compare(
      HEALTHY,
      "applyConfigDefault(homeDir, 'approvals', 'mode', 'manual', 'x')",
    ).join(" ");
    expect(noCwd).toContain("рабочую папку");
  });
});

describe("списки замера", () => {
  it("непустые и не пересекаются: иначе сверялось бы ничто", () => {
    expect(MUST_ASK.length).toBeGreaterThan(0);
    expect(MUST_PASS.length).toBeGreaterThan(0);
    expect(MUST_ASK.filter((c) => MUST_PASS.includes(c))).toEqual([]);
  });

  it("windows-команды в списке есть: продукт живёт на Windows", () => {
    // «`rm` ловится» ничего не говорит про `rd /s /q` — это разные шаблоны.
    expect(MUST_ASK.some((c) => /rd \/s|Remove-Item|reg delete|format /.test(c))).toBe(true);
  });

  it("у каждой дыры записано, ЧЕМ она опасна", () => {
    for (const gap of KNOWN_GAPS) expect(gap.note.length).toBeGreaterThan(20);
  });
});
