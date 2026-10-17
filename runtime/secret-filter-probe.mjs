// Задача 5.3 — BDD «Фильтр секретов (негативный)» на живом ядре.
//
// ЧТО ПРОВЕРЯЕТСЯ. Не «файлы лежат в папке», а то, что ядро само зовёт наш отказ
// на своём же пути вызова инструмента. Ход идёт через `_dispatch_pre_tool_call_hooks`
// — ту самую функцию, которую агент зовёт в `agent_runtime_helpers.py:3476` перед
// каждым инструментом. Наше участие кончается на `installSecretFilter`, том самом,
// которым приложение готовит профиль перед подъёмом ядра.
//
// КОНТРОЛЬ ОБЯЗАТЕЛЕН, И ОН ЗДЕСЬ ГЛАВНЫЙ. Второй профиль получает ТЕ ЖЕ файлы
// плагина, но без строки в `plugins.enabled`. Если бы отказ срабатывал и там,
// зонд доказывал бы, что фильтр работает от чего угодно, только не от нашей
// установки — а заодно скрыл бы, что `plugins.enabled` можно было не писать.
//
// БЕЗ КЛЮЧА И БЕЗ СЕТИ: хук стоит ДО инструмента, никакая модель и никакой
// эмбеддер для него не нужны.
//
// Запуск: node runtime/secret-filter-probe.mjs

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PYTHON_ARGS, PYTHON_BIN, RUNTIME_DIR } from "./hermes-env.mjs";
import { memoryEnv } from "./memory-config.mjs";
import { installSecretFilter, PLUGIN_ID } from "./register-secret-filter.mjs";

const HERMES_SRC = path.join(RUNTIME_DIR, ".hermes-src");

/** Значение секрета живёт ТОЛЬКО здесь и в проверке «отказ его не повторил». */
const SECRET_TEXT = "запомни: пароль: Qwerty12345!";
const INNOCENT_TEXT = "заказчик просил закладывать резерв мощности 20 процентов";

// Три вызова одним процессом: их реестр плагинов сканируется один раз за процесс
// (флаг `_discovered`), и повторный `discover_plugins()` без `force` — пустышка.
// Ровно поэтому приложение ставит плагин ДО `startServe`.
const PY = [
  "import json, sys",
  `sys.path.insert(0, r"${HERMES_SRC}")`,
  "from hermes_cli.plugins import discover_plugins, get_plugin_manager, _dispatch_pre_tool_call_hooks",
  "discover_plugins()",
  `ours = [p for p in get_plugin_manager().list_plugins() if p["name"] == ${JSON.stringify(PLUGIN_ID)}]`,
  "def ask(tool, args):",
  "    message, _ = _dispatch_pre_tool_call_hooks(tool, args)",
  "    return message",
  "out = {",
  '  "found": ours,',
  `  "secret": ask("memory", {"action": "add", "content": ${JSON.stringify(SECRET_TEXT)}}),`,
  `  "innocent": ask("memory", {"action": "add", "content": ${JSON.stringify(INNOCENT_TEXT)}}),`,
  `  "mem0": ask("mem0_add", {"content": ${JSON.stringify(SECRET_TEXT)}}),`,
  `  "other_tool": ask("write_file", {"content": ${JSON.stringify(SECRET_TEXT)}}),`,
  "}",
  "print('RESULT ' + json.dumps(out, ensure_ascii=False))",
].join("\n");

function runPython(scriptPath, home) {
  return new Promise((resolve) => {
    const child = spawn(PYTHON_BIN, [...PYTHON_ARGS, scriptPath], {
      env: { ...process.env, HERMES_HOME: home, ...memoryEnv(home), PYTHONIOENCODING: "utf-8" },
    });

    let text = "";
    child.stdout.on("data", (chunk) => (text += chunk.toString()));
    child.stderr.on("data", (chunk) => (text += chunk.toString()));
    child.on("close", () => {
      const line = /RESULT (.+)/.exec(text)?.[1];
      if (!line) {
        resolve({ error: text.trim().slice(-600) });
        return;
      }
      resolve(JSON.parse(line));
    });
  });
}

async function main() {
  const scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), "aec-secret-probe-"));
  const scriptPath = path.join(scriptDir, "probe.py");
  fs.writeFileSync(scriptPath, PY, "utf-8");

  let failures = 0;
  const check = (label, ok, detail) => {
    console.log(`${ok ? "OK  " : "ПЛОХО"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures += 1;
  };

  // ── Профиль под фильтром: ровно то, что делает приложение ───────────────────
  const armed = fs.mkdtempSync(path.join(os.tmpdir(), "aec-secret-armed-"));
  installSecretFilter(armed);
  console.log(`профиль под фильтром: ${armed}`);

  const on = await runPython(scriptPath, armed);
  if (on.error) {
    console.log(`ПЛОХО зонд не отработал — ${on.error}`);
    process.exit(1);
  }

  const plugin = on.found[0];
  console.log(`\n== плагин глазами ядра: ${JSON.stringify(plugin)}`);
  check("ядро нашло плагин", Boolean(plugin), `найдено записей: ${on.found.length}`);
  check("плагин включён", plugin?.enabled === true, `enabled=${plugin?.enabled}`);
  check("хук зарегистрирован", plugin?.hooks === 1, `hooks=${plugin?.hooks}`);
  check("плагин загрузился без ошибки", !plugin?.error, String(plugin?.error));

  console.log(`\n== вызовы`);
  check("секрет в слой 1 не пропущен", typeof on.secret === "string", String(on.secret));
  check("секрет в слой 2 не пропущен", typeof on.mem0 === "string", String(on.mem0));
  check("обычный факт проходит", on.innocent === null, String(on.innocent));
  check("чужой инструмент не тронут", on.other_tool === null, String(on.other_tool));
  check(
    "отказ не повторил сам секрет",
    typeof on.secret === "string" && !on.secret.includes("Qwerty12345"),
    on.secret ? `${String(on.secret).slice(0, 120)}…` : ""
  );

  // ── Контроль: те же файлы, но плагин не включён ─────────────────────────────
  const off = fs.mkdtempSync(path.join(os.tmpdir(), "aec-secret-off-"));
  installSecretFilter(off);
  const configPath = path.join(off, "config.yaml");
  fs.writeFileSync(
    configPath,
    fs.readFileSync(configPath, "utf-8").replace(`    - ${PLUGIN_ID}\n`, ""),
    "utf-8"
  );
  console.log(`\nконтрольный профиль (плагин на диске, но не включён): ${off}`);

  const control = await runPython(scriptPath, off);
  if (control.error) {
    console.log(`ПЛОХО контроль не отработал — ${control.error}`);
    process.exit(1);
  }
  check(
    "БЕЗ строки в plugins.enabled секрет проходит",
    control.secret === null,
    `отказ=${String(control.secret).slice(0, 80)}`
  );

  console.log(
    failures === 0
      ? "\nФИЛЬТР СТОИТ И ДЕРЖИТ (и держит именно потому, что включён)"
      : `\nпровалов: ${failures}`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
