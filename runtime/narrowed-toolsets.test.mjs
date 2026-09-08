// Замечание D-66. Проверяется не «умеет ли ядро сужать наборы» (умеет), а то,
// ради чего сторож заведён: состояние, при котором каждый следующий замер
// молча меряет обрезанного агента, обязано быть НАЗВАНО, а файл — не тронут.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { narrowingWarning, warnIfToolsetsNarrowed } from "./narrowed-toolsets.mjs";

const NARROWED = ["model:", "  default: gpt-5-mini", "platform_toolsets:", "  cli:", "    - bfl", "    - a2a", ""].join("\n");

describe("сторож сужения наборов", () => {
  it("тот самый блок из D-66 назван, и в тексте есть, что делать", () => {
    const warning = narrowingWarning(NARROWED);

    expect(warning).toContain("platform_toolsets");
    expect(warning, "человеку сказано, что набор сужен").toMatch(/СУЖЕН/);
    expect(warning, "названо, откуда это берётся").toMatch(/Blank Slate|hermes tools/);
  });

  it("чистый профиль молчит", () => {
    expect(narrowingWarning("model:\n  default: gpt-5-mini\nbrowser:\n  backend: \"off\"\n")).toBeNull();
  });

  it("похожее имя за сужение не принимается", () => {
    // Рядом в их же конфиге живут `toolsets:` (наш ключ доски) и
    // `known_builtin_toolsets:` — кэш ядра. Ни один из них агента не сужает.
    expect(narrowingWarning("toolsets:\n  - hermes-cli\n  - kanban\n")).toBeNull();
    expect(narrowingWarning("known_builtin_toolsets:\n  cli:\n    - web\n")).toBeNull();
    expect(narrowingWarning("  platform_toolsets: вложенный, не тот ключ\n")).toBeNull();
  });

  it("файл не трогается — сторож только говорит", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aec-narrowed-"));
    const file = path.join(home, "config.yaml");
    fs.writeFileSync(file, NARROWED, "utf-8");

    const said = [];
    const warning = warnIfToolsetsNarrowed(home, (text) => said.push(text));

    expect(warning).not.toBeNull();
    expect(said).toHaveLength(1);
    // Блок мог поставить человек сознательно, их же командой: стереть его молча
    // значило бы отменить его решение ровно тем способом, из-за которого это
    // замечание и завелось.
    expect(fs.readFileSync(file, "utf-8")).toBe(NARROWED);

    fs.rmSync(home, { force: true, recursive: true });
  });

  it("профиля ещё нет — это не повод шуметь", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aec-narrowed-empty-"));

    const said = [];
    expect(warnIfToolsetsNarrowed(home, (text) => said.push(text))).toBeNull();
    expect(said).toEqual([]);

    fs.rmSync(home, { force: true, recursive: true });
  });
});
