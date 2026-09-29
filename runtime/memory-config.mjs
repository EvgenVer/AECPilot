// Задача 5.1а. Четыре обязательных ключа второго слоя памяти — В КОДЕ, а не в
// инструкции по настройке (`specs/agent-memory.md` §«Что настраиваем мы»).
//
// ПОЧЕМУ ИМЕННО КОДОМ. Каждый из четырёх молча ломает обещание спеки, и ни один
// не диагностируется по ошибке:
//
//   `memory.provider: mem0`   — без него второй слой просто не включается, и
//                               человек этого не видит: разговор идёт, память
//                               не пополняется.
//   `mode: oss`               — умолчание плагина `platform` (`__init__.py`:
//                               `os.environ.get("MEM0_MODE", "platform")`), то
//                               есть облако и чужой ключ.
//   `openai_base_url` ОБОИХ   — умолчание mem0 `https://api.openai.com/v1`
//   блоков                      (`mem0/llms/openai.py`, `mem0/embeddings/openai.py`).
//                               Без ключа переписка уезжает туда МОЛЧА, мимо
//                               endpoint, который настроил человек, — сценарий
//                               «Локальность» нарушен без единого сообщения.
//   `MEM0_TELEMETRY=false`    — иначе отпечаток машины уходит на posthog с
//                               первого запуска. Читается ПРИ ИМПОРТЕ модуля
//                               (`mem0/memory/telemetry.py:14`), поэтому живёт
//                               в окружении процесса ядра, а не в конфиге.
//
// Здесь только решения и построение значений; запись на диск — задача 5.2.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Ключ, которым ядро выбирает плагин памяти (`agent/agent_init.py:1905`). */
export const MEMORY_PROVIDER = "mem0";

/** Окружение процесса ядра. Раскрывается в `serve.mjs` при запуске `hermes serve`:
 *  переменную читают при импорте `mem0`, и после старта её не поставить. */
export const MEMORY_ENV = Object.freeze({ MEM0_TELEMETRY: "false" });

/** Каталог служебных файлов mem0 — ВНУТРИ профиля ядра (решение владельца
 *  2026-09-15, D-85). Без переменной библиотека пишет журнал операций памяти
 *  `history.db` (с текстом фактов) и `config.json` в `~/.mem0`
 *  (`mem0/configs/base.py:13`, `mem0/memory/setup.py:11`) — за пределы профиля
 *  и в ОДИН файл с любым другим экземпляром Hermes на этой машине. Плагин ядра
 *  `history_db_path` из `mem0.json` не пробрасывает, так что конфигом это не
 *  задать — только окружением, и тоже при импорте. Имя каталога продублировано
 *  в `apps/desktop/src/main/cron-runner.ts` и `runtime/memory-facts.py` (main-процесс
 *  этот модуль статически не импортирует) — прибито тестом, читающим их текст. */
export const MEM0_DIR_NAME = "mem0";

/** Окружение памяти для процесса ядра с профилем `homeDir`: телеметрия выключена,
 *  файлы mem0 — в профиле. */
export function memoryEnv(homeDir) {
  return { ...MEMORY_ENV, MEM0_DIR: path.join(homeDir, MEM0_DIR_NAME) };
}

/** Умолчание ядра для провайдера `openai-api` — `hermes_cli/auth.py`,
 *  `ProviderConfig(inference_base_url=…, base_url_env_var="OPENAI_BASE_URL")`.
 *
 *  Продублировано здесь НАРОЧНО и прибито тестом, который читает их файл: если
 *  ядро сменит умолчание, тест покраснеет, а не разъедется молча. */
export const CORE_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const CORE_BASE_URL_ENV = "OPENAI_BASE_URL";

/** Endpoint, на который на самом деле ходит ЯДРО.
 *
 * Требование спеки — не «локальный адрес», а ТОТ ЖЕ адрес: перенаправив ядро на
 * свой сервер, человек обязан перенести туда же и память, не зная про mem0. */
export function coreEndpoint(env = process.env) {
  const configured = (env[CORE_BASE_URL_ENV] ?? "").trim();
  return configured === "" ? CORE_OPENAI_BASE_URL : configured;
}

/** Встроенный qdrant: путь на диске, без сервера и без слушающего порта
 *  (`specs/agent-memory.md` §Data schemas). Внутри профиля, а не в `~/.hermes`,
 *  куда смотрит их умолчание, — иначе два профиля делили бы одно хранилище. */
export function vectorStorePath(hermesHomeDir) {
  return path.join(hermesHomeDir, "mem0_qdrant");
}

/**
 * Содержимое `$HERMES_HOME/mem0.json`.
 *
 * `existing` сливается, а не затирается: ядро пишет в тот же файл своим
 * мастером (`_setup.py:_save_mem0_json`), и наши четыре ключа не повод стирать
 * чужой `user_id`. Но сами эти ключи — наши, и они выставляются всегда.
 *
 * Модели НЕ выдумываются: берутся умолчания их же таблицы
 * (`plugins/memory/mem0/_oss_providers.py`), чтобы вторая копия настроек не
 * разъезжалась с первой по составу полей.
 *
 * `sync_max_chars` — задача 3.B4е (решение владельца 2026-09-14). С 0.21.2
 * их плагин режет КАЖДОЕ сообщение хода до 450 символов по последней границе
 * предложения перед отправкой в извлечение (`_SYNC_MSG_MAX_CHARS`) — порог
 * под 512-токенные локальные эмбеддеры. У нас эмбеддер `text-embedding-3-small`
 * (8 191 токен) и `gpt-5-mini`, а факт в длинной реплике инженера стоит где
 * угодно, не в первых 450 символах. Ключ читается их `initialize()`:
 * `int(cfg.get("sync_max_chars") or 450)`; файл переписывается при каждом
 * открытии проекта, так что число меняется здесь одной константой.
 */
export const SYNC_MAX_CHARS = 16000;

/** Задача 3G.4 (D-157): коллекция на модель эмбеддингов. Их `OSSBackend` при
 *  другой ширине вектора УДАЛЯЕТ коллекцию (`_recreate_collection_if_dims_changed`),
 *  то есть смена провайдера стёрла бы факты. Своя коллекция на модель их не трогает:
 *  вернулся к прежнему провайдеру — вернулись и факты. Модель, на которой память
 *  жила до 3G.4, остаётся в их коллекции по умолчанию `mem0`. */
export function memoryCollection(embeddingModel) {
  if (!embeddingModel || embeddingModel === "text-embedding-3-small") return "mem0";
  return `mem0-${String(embeddingModel).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/** Блоки `llm`/`embedder`/`vector_store` под выбранного провайдера (3G.4).
 *  Ключ — ИМЕНЕМ переменной (`api_key_env`): значение подставляет наш плагин ядра
 *  в памяти процесса (`plugins/aec_secret_filter/mem0_shared.py`), на диск оно не
 *  попадает. Провайдер mem0 остаётся `openai` — их OpenAI-совместимый путь. */
function providerBlocks(provider, vectorPath) {
  return {
    llm: {
      provider: "openai",
      config: {
        model: provider.llmModel,
        openai_base_url: provider.baseUrl,
        api_key_env: provider.keyEnvVar,
      },
    },
    embedder: {
      provider: "openai",
      config: {
        model: provider.embeddingModel,
        embedding_dims: provider.embeddingDims,
        openai_base_url: provider.baseUrl,
        api_key_env: provider.keyEnvVar,
      },
    },
    vector_store: {
      provider: "qdrant",
      config: { path: vectorPath, collection_name: memoryCollection(provider.embeddingModel) },
    },
  };
}

export function buildMem0Json(existing, { baseUrl, vectorPath, provider = null }) {
  const base = existing && typeof existing === "object" ? existing : {};
  const oss = base.oss && typeof base.oss === "object" ? base.oss : {};

  if (provider) {
    return {
      ...base,
      mode: "oss",
      sync_max_chars: SYNC_MAX_CHARS,
      oss: { ...oss, ...providerBlocks(provider, vectorPath) },
    };
  }

  return {
    ...base,
    mode: "oss",
    sync_max_chars: SYNC_MAX_CHARS,
    oss: {
      ...oss,
      llm: {
        provider: "openai",
        config: {
          model: "gpt-5-mini",
          // Их же условие для этой модели (`_setup.py:build_oss_config`).
          is_reasoning_model: true,
          openai_base_url: baseUrl,
        },
      },
      embedder: {
        provider: "openai",
        config: {
          model: "text-embedding-3-small",
          embedding_dims: 1536,
          openai_base_url: baseUrl,
        },
      },
      vector_store: {
        provider: "qdrant",
        config: { path: vectorPath },
      },
    },
  };
}

const MEMORY_SECTION_RE = /^memory:\s*(#.*)?$/;
const PROVIDER_LINE_RE = /^ {2}provider:\s*(#.*)?/;
const TOP_LEVEL_LINE_RE = /^\S/;

/**
 * Вносит `memory.provider` в текст `config.yaml`, не трогая остальные ключи.
 * Возвращает `{ text, changed }`. Слияние текстовое, без парсера YAML — тот же
 * приём, что у `register-aec-rag.mjs` и по той же причине: в файле живут чужие
 * ключи и чужие комментарии, и переписывать его целиком мы не вправе.
 */
export function mergeMemoryProviderIntoConfigYaml(yamlText, provider = MEMORY_PROVIDER) {
  const line = `  provider: ${provider}`;
  const hadTrailingNewline = yamlText.endsWith("\n");
  const lines = (hadTrailingNewline ? yamlText.slice(0, -1) : yamlText).split("\n");

  const sectionStart = lines.findIndex((entry) => MEMORY_SECTION_RE.test(entry));

  if (sectionStart === -1) {
    const separator = yamlText === "" || hadTrailingNewline ? "" : "\n";
    return { text: `${yamlText}${separator}memory:\n${line}\n`, changed: true };
  }

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (TOP_LEVEL_LINE_RE.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  const section = lines.slice(sectionStart + 1, sectionEnd);
  const at = section.findIndex((entry) => PROVIDER_LINE_RE.test(entry));

  if (at !== -1 && section[at] === line) return { text: yamlText, changed: false };

  const nextSection = at === -1 ? [line, ...section] : section.with(at, line);

  return {
    text:
      [...lines.slice(0, sectionStart + 1), ...nextSection, ...lines.slice(sectionEnd)].join("\n") +
      "\n",
    changed: true,
  };
}

// ── Задача 5.2: проектный скоуп второго слоя.
//
// У ЯДРА ПРОЕКТНОЙ ОСИ ПАМЯТИ НЕТ (`specs/agent-memory.md` §Скоупы): провайдер
// получает профиль, сессию, канал и личность — но не каталог проекта. Спека
// назвала двух кандидатов и оставила выбор задаче.
//
// ВЫБРАН КЛЮЧ РАЗДЕЛЕНИЯ, КОТОРЫЙ MEM0 И ТАК ПРИМЕНЯЕТ К ЧТЕНИЮ, и выбор сделан
// замером (2026-09-09, зонд на venv ядра). Провайдер загружается заново на каждый
// ход — ядро строит агента на сообщение, — и `_load_config()` перечитывает
// `mem0.json`. Замерено на двух подряд загрузках с разными значениями:
//   проект A -> {'user_id': 'project-aaaa1111'}
//   проект B -> {'user_id': 'project-bbbb2222'}   разные экземпляры: True
// То есть смена проекта доезжает СО СЛЕДУЮЩЕГО ХОДА и без перезапуска ядра, а
// фильтр применяет их плагин (`_read_filters`), а не подсказка модели — ровно то
// требование, которое спека ставит любому кандидату.
//
// Второй кандидат (отдельное хранилище на проект) даёт ту же гарантию, но добавляет
// по векторному хранилищу на проект и оставляет клиента прошлого висеть до выхода.
// Больше движущихся частей за тот же результат.
//
// ПОЧЕМУ ЭТО НЕ ЛОМАЕТ ПОЛЬЗОВАТЕЛЬСКИЙ СКОУП: факты о человеке спека кладёт в
// слой 1 (`USER.md` профиля), который от проекта не зависит вовсе. Слой 2 —
// проектный, и `user_id` внутри профиля свободен: профиль и ЕСТЬ человек
// (PLAN §«Что оставляем открытым для многопользовательского сервера»).

/** Ключ проекта для второго слоя. Путь хранилища — не идентификатор: его
 *  показывают человеку, он длинный и на Windows отличается регистром. Берётся
 *  устойчивый отпечаток нормализованного пути.
 *
 *  Приставка `project-` не украшение: их плагин считает значение `hermes-user`
 *  «не задано» (`_DEFAULT_USER_ID`), и ключ обязан быть на него не похож. */
export function projectMemoryKey(vaultPath) {
  const abs = path.resolve(vaultPath);
  const normalized = process.platform === "win32" ? abs.toLowerCase() : abs;
  const digest = crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
  return `project-${digest.slice(0, 16)}`;
}

/** Читает `mem0.json` профиля, если он есть. Битый файл — не авария: их плагин
 *  на нём тоже молчит (`__init__.py:_load_config`, `except Exception: pass`), а
 *  наши ключи всё равно выставляются заново. */
export function readMem0Json(hermesHomeDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(hermesHomeDir, "mem0.json"), "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Задача 5.2 — привести профиль в состояние, описанное спекой, под открытый
 * проект. Идемпотентно: зовётся при каждом открытии проекта.
 *
 * ЛУЧШИЕ УСИЛИЯ, А НЕ ГАРАНТИЯ. Отказ записи не повод не открыть проект: без
 * второго слоя разговор идёт на первом, и человек об этом узнаёт сообщением
 * (задача 5.1б), а не пустым окном.
 *
 * Возвращает `{ changed, key }`. `changed` — правда, если что-то на диске
 * действительно изменилось: вызывающему это нужно, чтобы не дёргать ядро зря.
 */
export function applyMemoryProfile({ hermesHomeDir, vaultPath, env = process.env, provider = null }) {
  const key = projectMemoryKey(vaultPath);
  const configPath = path.join(hermesHomeDir, "config.yaml");
  const mem0Path = path.join(hermesHomeDir, "mem0.json");
  let changed = false;

  fs.mkdirSync(hermesHomeDir, { recursive: true });

  let yamlText = "";
  try {
    yamlText = fs.readFileSync(configPath, "utf-8");
  } catch {
    // Конфига ещё нет — ядро создаст свой при старте, наш ключ его переживёт:
    // слияние текстовое и дописывает секцию, а не переписывает файл.
  }

  const merged = mergeMemoryProviderIntoConfigYaml(yamlText);
  if (merged.changed) {
    fs.writeFileSync(configPath, merged.text, "utf-8");
    changed = true;
  }

  const existing = readMem0Json(hermesHomeDir);
  const next = {
    ...buildMem0Json(existing, {
      baseUrl: coreEndpoint(env),
      vectorPath: vectorStorePath(hermesHomeDir),
      provider,
    }),
    user_id: key,
  };
  const text = JSON.stringify(next, null, 2) + "\n";

  let before = "";
  try {
    before = fs.readFileSync(mem0Path, "utf-8");
  } catch {
    // нет файла — значит точно меняем
  }

  if (before !== text) {
    fs.writeFileSync(mem0Path, text, "utf-8");
    changed = true;
  }

  return { changed, key };
}
