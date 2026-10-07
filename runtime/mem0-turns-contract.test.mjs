// D-171 (задача 3G.39) — в дифф контрактов подъёма mem0.
//
// При удалении факта наш `plugins/aec_secret_filter/mem0_turns.py` чистит журнал
// реплик проекта во ВНУТРЕННЕЙ таблице mem0: публичного пути для этого у mem0 нет.
// Держится это на четырёх фактах их кода. Сменится любой — чистка молча
// перестанет действовать, и удалённые факты снова начнут возвращаться. Тест читает
// установленный mem0 из venv ядра и падает при подъёме: тогда чистку сверяют заново.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RUNTIME_DIR, VENV_DIR } from "./hermes-env.mjs";

function mem0Dir() {
  const windows = join(VENV_DIR, "Lib", "site-packages", "mem0");
  if (existsSync(windows)) return windows;
  const lib = join(VENV_DIR, "lib");
  const python = readdirSync(lib).find((name) => name.startsWith("python"));
  return join(lib, python, "site-packages", "mem0");
}

const storage = readFileSync(join(mem0Dir(), "memory", "storage.py"), "utf8");
const main = readFileSync(join(mem0Dir(), "memory", "main.py"), "utf8");
// Задача 3H.20: удаление живёт в модуле плагина ядра (`memory-facts.py` его зовёт).
const reader = readFileSync(
  join(RUNTIME_DIR, "..", "plugins", "aec_secret_filter", "memory_facts.py"),
  "utf8",
);

describe("журнал реплик mem0, который чистит удаление факта", () => {
  it("извлечение подмешивает последние реплики области", () => {
    // Сама причина D-171: без этого вызова чистка была бы не нужна.
    expect(main).toContain("last_messages = self.db.get_last_messages(session_scope, limit=10)");
  });

  it("область — части `ключ=значение` через `&`", () => {
    // Наша чистка узнаёт свою область по части `user_id=<проект>`.
    expect(main).toMatch(/def _build_session_scope\(filters\):[\s\S]*?parts\.append\(f"\{key\}=\{val\}"\)[\s\S]*?return "&"\.join\(parts\)/);
  });

  it("реплики лежат в таблице messages с колонкой session_scope", () => {
    expect(storage).toMatch(/CREATE TABLE IF NOT EXISTS messages \(\s*id TEXT PRIMARY KEY,\s*session_scope TEXT,/);
  });

  it("хранилище держит соединение и замок, которыми пользуется и чистка", () => {
    expect(storage).toContain("self.connection = sqlite3.connect(self.db_path, check_same_thread=False)");
    expect(storage).toContain("self._lock = threading.Lock()");
  });

  it("удаление в окне памяти зовёт чистку", () => {
    expect(reader).toContain("forget_scope_turns(");
  });
});
