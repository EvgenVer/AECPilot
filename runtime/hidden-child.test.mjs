// D-198: пустое окно консоли. Каждый процесс, который приложение запускает на
// Windows, — со скрытой консолью (`windowsHide`), как у донора
// (`hiddenWindowsChildOptions`): ядро на это рассчитывает, его потомки
// наследуют скрытую консоль. Проверка по исходнику — грубая, но ловит ровно ту
// ошибку, что была: новый `spawn` без скрытия.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { hiddenChild } from "./serve.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Тексты вызовов `spawn(`/`spawnSync(` до закрывающей скобки верхнего уровня. */
function spawnCalls(file) {
  const text = fs.readFileSync(file, "utf8");
  const calls = [];
  const re = /\bspawn(Sync)?\(/g;
  let match;
  while ((match = re.exec(text))) {
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < text.length && depth > 0) {
      if (text[i] === "(") depth += 1;
      if (text[i] === ")") depth -= 1;
      i += 1;
    }
    calls.push(text.slice(match.index, i));
  }
  return calls;
}

describe("D-198 скрытая консоль у процессов приложения", () => {
  it("hiddenChild добавляет windowsHide и не теряет остальное", () => {
    expect(hiddenChild({ stdio: "ignore", env: { A: "1" } })).toEqual({
      stdio: "ignore",
      env: { A: "1" },
      windowsHide: true,
    });
  });

  for (const rel of ["serve.mjs", "../apps/desktop/src/main/cron-runner.ts"]) {
    it(`каждый запуск процесса в ${rel} — со скрытой консолью`, () => {
      const calls = spawnCalls(path.join(here, rel));
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call, call).toMatch(/hiddenChild\(|windowsHide:\s*true/);
      }
    });
  }
});
