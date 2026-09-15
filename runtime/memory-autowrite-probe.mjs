// Задача 5.3/5.6 — АВТОМАТИЧЕСКАЯ ЗАПИСЬ В ПАМЯТЬ, второй путь и его защита.
//
// ЧТО ЭТОТ ЗОНД ОДИН РАЗ УЖЕ ДОКАЗАЛ (2026-09-09, до правки): фильтр секретов,
// стоявший на `pre_tool_call`, этот путь НЕ ВИДИТ ВОВСЕ. Реплика «запомни:
// пароль от почты объекта — Qwerty12345!, и ещё резерв 20%» уехала в слой 2
// дословно, с паролем внутри, при включённом и работающем фильтре. Причина в
// устройстве ядра: конец каждого неперебитого хода сам отправляет реплику и
// ответ в провайдера —
//   `run_agent.py:_sync_external_memory_for_turn` -> `MemoryManager.sync_all`
//   -> провайдер mem0 -> `backend.add(messages, infer=True)`
// Вызова инструмента там нет, значит и хука нет: в `VALID_HOOKS` на этом пути
// пусто, выключателя у него тоже нет, а их `sanitize_context` снимает только их
// собственные теги. Поэтому путь закрыт обёрткой воронки (`install_sync_guard`).
//
// ЧТО ЗОНД МЕРЯЕТ ТЕПЕРЬ — ДВА ПРОГОНА, И ВТОРОЙ ВАЖНЕЕ ПЕРВОГО:
//   1. фильтр включён — секрета в хранилище нет, а обычный факт, сказанный
//      рядом, остался (выбрасывать ход целиком нельзя);
//   2. КОНТРОЛЬ: тот же плагин лежит в профиле, но не включён — секрет доезжает.
// Без второго прогона первый не доказывает ничего: «секрета нет» объяснялось бы
// и тем, что их извлечение само не сочло пароль фактом.
//
// ПОЧЕМУ ДВА ФАКТА В ОДНОЙ РЕПЛИКЕ. Пустое хранилище объяснимо двояко — «секрет
// отфильтрован» и «автозапись не доехала». Обычный факт рядом разделяет их.
//
// ХОД ИДЁТ ЧЕРЕЗ ВОРОНКУ, А НЕ ПРЯМО В ПРОВАЙДЕРА: настоящая автозапись идёт
// так, и защита стоит там же. Зонд, зовущий `sync_turn` напрямую, обошёл бы и
// защиту, и смысл замера. Плагин руками не подключается — его грузит их же
// `discover_plugins()` из профиля, куда его положил наш установщик.
//
// ЧЕТВЁРТЫЙ ПРОГОН (задача 3.B4е): ДЛИННЫЙ ХОД. С 0.21.2 их плагин режет каждое
// сообщение до `sync_max_chars` символов по последней границе предложения,
// умолчание — 450. Наш `mem0.json` ставит 16 000; проверяется фактом, который
// стоит ЗА 450-м символом реплики: на их умолчании он в извлечение не попал бы
// вовсе, а с нашим порогом обязан лежать в слое 2.
//
// КЛЮЧ БЕРЁТСЯ ПРОГРАММНО из `.env` профиля разработки — тем же `load_env_file`,
// которым это делает раннер эвалов. Значение не печатается и в отчёт не едет.
//
// Запуск: node runtime/memory-autowrite-probe.mjs

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PYTHON_BIN, RUNTIME_DIR } from "./hermes-env.mjs";
import { applyMemoryProfile, memoryEnv } from "./memory-config.mjs";
import { installSecretFilter } from "./register-secret-filter.mjs";

const REPO_ROOT = path.resolve(RUNTIME_DIR, "..");
const HERMES_SRC = path.join(RUNTIME_DIR, ".hermes-src");
const DEV_ENV = path.join(RUNTIME_DIR, "dev-profile", ".env");

const SECRET = "Qwerty12345!";
const FACT = "резерв мощности 20 процентов";
const USER_TEXT = `запомни: пароль от почты объекта — ${SECRET}, и ещё: ${FACT}`;
const ASSISTANT_TEXT = "Записал.";

// Длинный ход: обычные фразы инженера ДО 450-го символа, проверяемый факт —
// после. Границу берём с запасом (их срез ищет последнюю точку ПЕРЕД порогом).
const LONG_FACT = "номер разрешения на строительство объекта — 7731";
const FILLER = Array.from(
  { length: 6 },
  (_, i) => `Сегодня на площадке проходила ${i + 1}-я проверка монтажа вентиляции, замечаний по шумоизоляции нет, акты подписаны.`
).join(" ");
const LONG_USER_TEXT = `${FILLER} И ещё запомни: ${LONG_FACT}.`;
if (LONG_USER_TEXT.indexOf(LONG_FACT) < 450) {
  throw new Error("зонд построен неверно: факт длинного хода стоит до 450-го символа");
}

// ХОД ИДЁТ ЧЕРЕЗ ВОРОНКУ (`MemoryManager.sync_all`), А НЕ ПРЯМО В ПРОВАЙДЕРА —
// потому что настоящая автозапись идёт именно так, и потому что наша защита стоит
// на воронке. Зонд, зовущий `provider.sync_turn` напрямую, обошёл бы и защиту, и
// смысл замера. Плагин при этом НЕ подключается руками: его загружает их же
// `discover_plugins()` из профиля, куда его положил наш установщик, — то есть
// проверяется вся цепочка, включая включение в конфиге.
const buildPy = (userText) => [
  "import json, os, sys, time",
  `sys.path.insert(0, r"${HERMES_SRC}")`,
  `sys.path.insert(0, r"${path.join(REPO_ROOT, "eval")}")`,
  "from pathlib import Path",
  "from graph_cost import load_env_file",
  `load_env_file(Path(r"${DEV_ENV}"))`,
  "from hermes_cli.plugins import discover_plugins, get_plugin_manager",
  "discover_plugins()",
  `ours = [p for p in get_plugin_manager().list_plugins() if p["name"] == "aec-secret-filter"]`,
  "print('PLUGIN ' + json.dumps(ours, ensure_ascii=False))",
  "from agent.memory_manager import MemoryManager",
  // Обёртка ставится при `register()` плагина. Печатаем факт, а не надежду:
  // «секрета нет» без этой строки не отличить от «обёртки нет, просто не нашли».
  "print('GUARD ' + str(getattr(MemoryManager.sync_all, '_aec_secret_filter_installed', False)))",
  "from plugins.memory import load_memory_provider",
  "p = load_memory_provider('mem0', register_skills=False)",
  "p.initialize(session_id='autowrite-probe', platform='tui', hermes_home=os.environ['HERMES_HOME'], agent_context='primary')",
  // 0.21.2 (задача 3.B4): их `_read_filters()` растворён в вызове поиска —
  // `search(query, filters={"user_id": self._user_id}, …)` (`plugins/memory/mem0/__init__.py`).
  // Печатаем ровно тот словарь, что уходит в поиск, из того же поля.
  "print('FILTER ' + json.dumps({'user_id': p._user_id}, ensure_ascii=False))",
  "m = MemoryManager()",
  "m.add_provider(p)",
  `m.sync_all(${JSON.stringify(userText)}, ${JSON.stringify(ASSISTANT_TEXT)})`,
  // Ждём ДВА слоя потоков: воронка кладёт работу в свой исполнитель, а их
  // `sync_turn` внутри уходит в собственный демон-поток.
  "time.sleep(5)",
  "t = getattr(p, '_sync_thread', None)",
  "t.join(timeout=180) if t is not None else None",
  "time.sleep(3)",
  "print('SYNC_MAX ' + str(p._sync_max_chars))",
  "print('SEARCH ' + json.dumps(p.handle_tool_call('mem0_search', {'query': 'пароль почта резерв мощности разрешение на строительство', 'top_k': 20}), ensure_ascii=False))",
].join("\n");

function runPython(scriptPath, home) {
  return new Promise((resolve) => {
    const child = spawn(PYTHON_BIN, [scriptPath], {
      env: { ...process.env, HERMES_HOME: home, ...memoryEnv(home), PYTHONIOENCODING: "utf-8" },
    });
    let text = "";
    child.stdout.on("data", (c) => (text += c.toString()));
    child.stderr.on("data", (c) => (text += c.toString()));
    child.on("close", () => resolve(text));
  });
}

/** Кириллица приезжает экранированной ДВАЖДЫ: их инструмент отдаёт JSON строкой,
 *  а `json.dumps` печатает её с умолчательным `ensure_ascii`. Разбираем оба слоя
 *  разбором, а не заменой: подстрочная замена оставляет обратные косые и проверки
 *  начинают искать в `\П\о\л` — то есть не находят ничего никогда. Ровно эта
 *  ловушка была в зонде 5.1в. */
function decodeSearch(line) {
  try {
    const inner = JSON.parse(line);
    return JSON.stringify(JSON.parse(inner));
  } catch {
    try {
      return JSON.parse(line);
    } catch {
      return line;
    }
  }
}

/**
 * Один замер на отдельном профиле. `armed: false` — плагин лежит в профиле, но
 * НЕ включён: это контроль, и он обязателен. Без него «секрета нет» объясняется
 * двояко — защита сработала ИЛИ их модель просто не сочла пароль фактом, — и
 * замер не доказывает ничего.
 */
async function measure({ armed, autowrite = true, userText = USER_TEXT }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aec-autowrite-home-"));
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "aec-autowrite-vault-"));
  const scriptPath = path.join(home, "probe.py");

  const { key } = applyMemoryProfile({ hermesHomeDir: home, vaultPath: vault });
  installSecretFilter(home);
  if (!armed) {
    const configPath = path.join(home, "config.yaml");
    fs.writeFileSync(
      configPath,
      fs.readFileSync(configPath, "utf-8").replace("    - aec-secret-filter\n", ""),
      "utf-8"
    );
  }
  if (!autowrite) {
    // Ровно тот файл, который пишет экран памяти (задача 5.4). Зонд не
    // изобретает свой формат: он проверяет тот самый выключатель.
    fs.writeFileSync(
      path.join(home, "aec-memory.json"),
      JSON.stringify({ autowrite: false }, null, 2) + "\n",
      "utf-8"
    );
  }
  fs.writeFileSync(scriptPath, buildPy(userText), "utf-8");

  const raw = await runPython(scriptPath, home);
  const search = decodeSearch(/SEARCH (.+)/.exec(raw)?.[1] ?? "");

  return {
    home,
    key,
    plugin: /PLUGIN (.+)/.exec(raw)?.[1] ?? "(не напечатан)",
    readFilter: /FILTER (.+)/.exec(raw)?.[1] ?? "(не напечатан)",
    guard: /GUARD (.+)/.exec(raw)?.[1] ?? "(не напечатана)",
    syncMax: /SYNC_MAX (.+)/.exec(raw)?.[1] ?? "(не напечатан)",
    search,
    raw,
    // Обычный факт рядом — признак того, что автозапись вообще доехала. Без него
    // любой вывод про секрет бессмыслен.
    factStored: /резерв|reserve/i.test(search) || /20/.test(search),
    secretStored: search.includes(SECRET) || /Qwerty/i.test(search),
    longFactStored: /7731/.test(search),
    redacted: /секрет удалён/i.test(search),
  };
}

async function main() {
  console.log(`реплика в обоих прогонах: ${USER_TEXT.replace(SECRET, "<секрет>")}\n`);

  let failures = 0;
  const check = (label, ok, detail) => {
    console.log(`${ok ? "OK  " : "ПЛОХО"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures += 1;
  };

  for (const armed of [true, false]) {
    const r = await measure({ armed });
    console.log(`\n=== ${armed ? "ФИЛЬТР ВКЛЮЧЁН" : "КОНТРОЛЬ: плагин не включён"} (${r.key})`);
    if (!r.search) {
      console.log(`зонд не отработал:\n${r.raw.trim().slice(-1200)}`);
      process.exit(1);
    }
    console.log(`   плагин глазами ядра: ${r.plugin}`);
    console.log(`   обёртка на воронке: ${r.guard}`);
    console.log(
      `   в слое 2: ${r.search.replace(new RegExp(SECRET, "g"), "<СЕКРЕТ>").slice(0, 420)}`
    );

    check(`${armed ? "" : "(контроль) "}автозапись доехала`, r.factStored);
    if (armed) {
      check("секрета в хранилище нет", !r.secretStored);
      check("обычный факт рядом уцелел", r.factStored, "выбрасывать ход целиком нельзя");
      // НЕ проверка, а наблюдение. Метку `<секрет удалён>` в хранилище несёт не наш
      // код, а их извлечение: оно пересказывает ход моделью и метку может не
      // сохранить. Требовать её значило бы требовать поведения, которого система
      // не обещает, — проверка падала бы на ровном месте.
      console.log(`     метка в пересказе: ${r.redacted ? "уцелела" : "не уцелела (так бывает)"}`);
    } else {
      check(
        "БЕЗ фильтра секрет доезжает (значит замер способен его увидеть)",
        r.secretStored,
        r.secretStored ? "" : "проверка выше ничего не доказывает"
      );
    }
  }

  // ── Третий прогон: переключатель автозаписи (задача 5.4) ──────────────────
  //
  // У ядра выключателя для этого пути нет, поэтому решение человека исполняет та
  // же обёртка воронки. Проверяется САМЫМ ОБЫЧНЫМ фактом, без всякого секрета:
  // выключено — значит в памяти не появилось ничего.
  const off = await measure({ armed: true, autowrite: false });
  console.log(`\n=== ПЕРЕКЛЮЧАТЕЛЬ АВТОЗАПИСИ ВЫКЛЮЧЕН (${off.key})`);
  console.log(`   в слое 2: ${off.search.slice(0, 300)}`);
  check("выключенная автозапись не записала даже обычный факт", !off.factStored);

  // ── Четвёртый прогон: длинный ход (задача 3.B4е) ─────────────────────────
  //
  // Факт стоит за 450-м символом. На их умолчании `sync_max_chars` он в
  // извлечение не попал бы; наш `mem0.json` ставит 16 000 — и плагин обязан
  // прочитать его из файла (печатается), а факт — лежать в слое 2.
  const long = await measure({ armed: true, userText: LONG_USER_TEXT });
  console.log(`\n=== ДЛИННЫЙ ХОД: факт за ${LONG_USER_TEXT.indexOf(LONG_FACT)}-м символом (${long.key})`);
  console.log(`   порог плагина глазами ядра: ${long.syncMax}`);
  console.log(`   в слое 2: ${long.search.slice(0, 420)}`);
  check("плагин прочитал наш порог из mem0.json", long.syncMax === "16000", long.syncMax);
  check("факт за 450-м символом доехал до слоя 2", long.longFactStored);

  console.log(
    failures === 0
      ? "\nАВТОМАТИЧЕСКИЙ ПУТЬ ЗАКРЫТ — и закрыт именно фильтром; переключатель слушается; длинный ход доезжает целиком"
      : `\nпровалов: ${failures}`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
