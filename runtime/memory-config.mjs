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

import fs from "node:fs";
import path from "node:path";

/** Ключ, которым ядро выбирает плагин памяти (`agent/agent_init.py:1905`). */
export const MEMORY_PROVIDER = "mem0";

/** Окружение процесса ядра. Раскрывается в `serve.mjs` при запуске `hermes serve`:
 *  переменную читают при импорте `mem0`, и после старта её не поставить. */
export const MEMORY_ENV = Object.freeze({ MEM0_TELEMETRY: "false" });

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
 */
export function buildMem0Json(existing, { baseUrl, vectorPath }) {
  const base = existing && typeof existing === "object" ? existing : {};
  const oss = base.oss && typeof base.oss === "object" ? base.oss : {};

  return {
    ...base,
    mode: "oss",
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
