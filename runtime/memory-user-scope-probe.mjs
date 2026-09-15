// Задача 5.1г — пользовательский скоуп: работает ли он и правда даром.
//
// ИЗ РАЗБОРА 5.0 СЛЕДОВАЛО, ЧТО ДА: записка о человеке живёт в профиле
// (`$HERMES_HOME/memories/USER.md`), а профиль от проекта не зависит. Но
// «следует» и «проверено» — разные вещи, и на этом допущении стоит целый
// сценарий спеки («Автозапись пользовательского предпочтения»: факт действует
// во всех проектах человека без переноса).
//
// ЧТО ДЕЛАЕТ ЗОНД. Кладёт факт в `USER.md`, открывает проект A нашим же
// `applyMemoryProfile`, спрашивает у ЯДРА, что оно читает с диска
// (`tools.memory_tool.MemoryStore.load_from_disk`), затем открывает проект B —
// другим процессом — и спрашивает снова. Ни модели, ни сети: слой 1 это файлы.
//
// ВТОРАЯ ПОЛОВИНА ПРОВЕРКИ ВАЖНЕЕ ПЕРВОЙ: вместе с фактом о человеке зонд
// смотрит, что проектный ключ слоя 2 при этом ДЕЙСТВИТЕЛЬНО сменился. Иначе
// «читается в обоих проектах» доказывало бы только то, что проект не менялся.
//
// Запуск: node runtime/memory-user-scope-probe.mjs

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PYTHON_BIN, RUNTIME_DIR } from "./hermes-env.mjs";
import { applyMemoryProfile, memoryEnv } from "./memory-config.mjs";

const HERMES_SRC = path.join(RUNTIME_DIR, ".hermes-src");
const USER_FACT = "Ведёт раздел ОВ. Отвечать коротко.";

const PY = [
  "import os, sys",
  `sys.path.insert(0, r"${HERMES_SRC}")`,
  "from tools.memory_tool import MemoryStore",
  "store = MemoryStore(memory_char_limit=2200, user_char_limit=1375, memory_enabled=True, user_profile_enabled=True)",
  "store.load_from_disk()",
  "entries = list(getattr(store, 'user_entries', []) or [])",
  "print('USER ' + ' | '.join(e.replace(chr(10), ' ') for e in entries))",
].join("\n");

function askCore(home, scriptPath) {
  const out = spawnSync(PYTHON_BIN, [scriptPath], {
    env: { ...process.env, HERMES_HOME: home, ...memoryEnv(home), PYTHONIOENCODING: "utf-8" },
    encoding: "utf-8",
  });
  const text = `${out.stdout ?? ""}${out.stderr ?? ""}`;
  return /USER (.*)/.exec(text)?.[1] ?? `(не прочиталось: ${text.trim().slice(0, 200)})`;
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), "aec-mem-user-"));
const vaultA = fs.mkdtempSync(path.join(os.tmpdir(), "aec-vault-A-"));
const vaultB = fs.mkdtempSync(path.join(os.tmpdir(), "aec-vault-B-"));
const scriptPath = path.join(home, "probe.py");
fs.writeFileSync(scriptPath, PY, "utf-8");

fs.mkdirSync(path.join(home, "memories"), { recursive: true });
fs.writeFileSync(path.join(home, "memories", "USER.md"), USER_FACT, "utf-8");

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "OK  " : "ПЛОХО"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const keyA = applyMemoryProfile({ hermesHomeDir: home, vaultPath: vaultA }).key;
const inA = askCore(home, scriptPath);
console.log(`проект A (${keyA}): ${inA}`);

const keyB = applyMemoryProfile({ hermesHomeDir: home, vaultPath: vaultB }).key;
const inB = askCore(home, scriptPath);
console.log(`проект B (${keyB}): ${inB}`);

check("проект действительно сменился", keyA !== keyB, `${keyA} / ${keyB}`);
check("факт о человеке читается в проекте A", inA.includes("раздел ОВ"), inA.slice(0, 120));
check("он же читается в проекте B — без переноса", inB.includes("раздел ОВ"), inB.slice(0, 120));

console.log(failures === 0 ? "\nПОЛЬЗОВАТЕЛЬСКИЙ СКОУП РАБОТАЕТ ДАРОМ" : `\nПРОВАЛОВ: ${failures}`);
process.exitCode = failures === 0 ? 0 : 1;
