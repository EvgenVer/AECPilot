// SPEC UR44 (к UR41), задача 3J.3: шаблон AGENTS.md нового проекта — для
// инженера-конструктора раздела КР, а не для инженера ПТО (решение владельца
// 2026-10-09). Существующие проекты приложение не переписывает.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const template = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "templates", "AGENTS.md"),
  "utf8",
);

describe("шаблон AGENTS.md проекта", () => {
  it("описывает рабочее место инженера-конструктора КР", () => {
    expect(template).toContain("инженера-конструктора (раздел КР)");
    expect(template).not.toMatch(/ПТО/);
  });

  it("сохраняет подстановку имени проекта", () => {
    expect(template).toContain("{{PROJECT_NAME}}");
  });
});
