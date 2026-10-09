// Задача 5.3: ставит наш плагин-фильтр секретов в профиль ядра и включает его.
//
// ПОЧЕМУ КОПИЕЙ, А НЕ ССЫЛКОЙ. Ядро ищет пользовательские плагины ровно в
// `$HERMES_HOME/plugins/<имя>/` (`hermes_cli/plugins.py`, «2. User plugins»), а
// символическая ссылка на Windows требует прав, которых у обычного запуска нет.
// Копия сверяется по содержимому при каждом открытии проекта, так что правка
// исходника доезжает сама.
//
// ПОЧЕМУ ЕЩЁ И `plugins.enabled`. Пользовательский плагин у них выключен, пока не
// назван (их же комментарий: «user-installed still gated by plugins.enabled»).
// Положить папку и не включить — это фильтр, которого нет, а выглядит как есть.
//
// Тесты плагина (`tests/`) НЕ КОПИРУЮТСЯ: они импортируют pytest, которого в
// venv ядра нет, и в профиле им делать нечего.

import fs from "node:fs";
import path from "node:path";

import { RUNTIME_DIR } from "./hermes-env.mjs";

const REPO_ROOT = path.resolve(RUNTIME_DIR, "..");

/** Имя папки плагина в профиле = `name` из его манифеста. */
export const PLUGIN_ID = "aec-secret-filter";

/** Что именно составляет плагин. Список явный, а не «всё, что в папке»: рядом
 *  лежат тесты и `__pycache__`, и уехать в профиль они не должны. */
export const PLUGIN_FILES = [
  "plugin.yaml",
  "__init__.py",
  "secrets.py",
  "mem0_shared.py",
  // Задача 3H.20: команда фактов памяти и чистка журнала реплик при удалении.
  "memory_facts.py",
  "mem0_turns.py",
  // Задача 3I.2 (D-195): ключи провайдеров — внешним источником секретов.
  "key_source.py",
];

/** Имя источника ключей в плагине (`key_source.py::NAME`) — ключ раздела
 *  `secrets:` конфига, которым ядро его включает. */
export const KEY_SOURCE_ID = "aecpilot";

/** Исходник лежит В `plugins/`, А НЕ В `mcp/`, и имя у него через подчёркивание.
 *
 *  Папка `mcp/` — про MCP-серверы, которые ставятся в venv и объявляются в
 *  `mcpServers`; этот же плагин ставится копированием и грузится ядром. Заодно
 *  снимается поломка: рабочее пространство uv собирает `mcp/*`, и папка без
 *  `pyproject.toml` роняла `uv lock` целиком (замерено 2026-09-09).
 *
 *  Подчёркивание — потому что тесты импортируют его как пакет python, а дефис в
 *  имени модуля недопустим. В профиле папка называется по манифесту, через дефис:
 *  ядро ищет плагины по `plugin.yaml`, а не по имени папки (проверено зондом). */
export const PLUGIN_SOURCE_DIR = path.join(REPO_ROOT, "plugins", "aec_secret_filter");

const PLUGINS_SECTION_RE = /^plugins:\s*(#.*)?$/;
const ENABLED_LIST_RE = /^ {2}enabled:\s*(#.*)?$/;
const TOP_LEVEL_LINE_RE = /^\S/;
const SECOND_LEVEL_LINE_RE = /^ {2}\S/;

/**
 * Вносит `plugins.enabled: [… , aec-secret-filter]` в текст `config.yaml`,
 * не трогая остальное. Возвращает `{ text, changed }`.
 *
 * Слияние текстовое, без парсера YAML — тот же приём и та же причина, что у
 * `register-aec-rag.mjs`: в файле живут чужие ключи и чужие комментарии.
 */
export function mergePluginEnabledIntoConfigYaml(yamlText, pluginId = PLUGIN_ID) {
  const entry = `    - ${pluginId}`;
  const hadTrailingNewline = yamlText.endsWith("\n");
  const lines = (hadTrailingNewline ? yamlText.slice(0, -1) : yamlText).split("\n");

  const sectionStart = lines.findIndex((line) => PLUGINS_SECTION_RE.test(line));

  if (sectionStart === -1) {
    const separator = yamlText === "" || hadTrailingNewline ? "" : "\n";
    return { text: `${yamlText}${separator}plugins:\n  enabled:\n${entry}\n`, changed: true };
  }

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (TOP_LEVEL_LINE_RE.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  const section = lines.slice(sectionStart + 1, sectionEnd);
  const listStart = section.findIndex((line) => ENABLED_LIST_RE.test(line));

  if (listStart === -1) {
    const next = ["  enabled:", entry, ...section];
    return {
      text:
        [...lines.slice(0, sectionStart + 1), ...next, ...lines.slice(sectionEnd)].join("\n") + "\n",
      changed: true,
    };
  }

  // Конец списка — первая строка второго уровня после него (`  disabled:` и т.п.).
  let listEnd = section.length;
  for (let i = listStart + 1; i < section.length; i++) {
    if (SECOND_LEVEL_LINE_RE.test(section[i])) {
      listEnd = i;
      break;
    }
  }

  const items = section.slice(listStart + 1, listEnd);
  if (items.some((line) => line.trim() === `- ${pluginId}`)) {
    return { text: yamlText, changed: false };
  }

  const next = [
    ...section.slice(0, listStart + 1),
    ...items,
    entry,
    ...section.slice(listEnd),
  ];

  return {
    text:
      [...lines.slice(0, sectionStart + 1), ...next, ...lines.slice(sectionEnd)].join("\n") + "\n",
    changed: true,
  };
}

const SECRETS_SECTION_RE = /^secrets:\s*(#.*)?$/;

/**
 * Вносит `secrets: { aecpilot: { enabled: true } }` в текст `config.yaml`
 * (задача 3I.2, D-195). Без раздела `secrets:` ядро не опрашивает внешние
 * источники профиля вовсе (`env_loader._hydrate_profile_secret_sources`, замер
 * 3I.1), и ключи при специалистах не доходят до MCP и Mem0.
 *
 * Только когда записи нет: если человек выключил источник (`enabled: false`),
 * это его решение, и запись не трогается.
 */
export function mergeKeySourceIntoConfigYaml(yamlText, sourceId = KEY_SOURCE_ID) {
  const block = [`  ${sourceId}:`, "    enabled: true"];
  const hadTrailingNewline = yamlText.endsWith("\n");
  const lines = (hadTrailingNewline ? yamlText.slice(0, -1) : yamlText).split("\n");

  const sectionStart = lines.findIndex((line) => SECRETS_SECTION_RE.test(line));
  if (sectionStart === -1) {
    const separator = yamlText === "" || hadTrailingNewline ? "" : "\n";
    return { text: `${yamlText}${separator}secrets:\n${block.join("\n")}\n`, changed: true };
  }

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (TOP_LEVEL_LINE_RE.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }
  const own = new RegExp(`^ {2}${sourceId}:\\s*(#.*)?$`);
  if (lines.slice(sectionStart + 1, sectionEnd).some((line) => own.test(line))) {
    return { text: yamlText, changed: false };
  }

  return {
    text: [...lines.slice(0, sectionStart + 1), ...block, ...lines.slice(sectionStart + 1)].join("\n") + "\n",
    changed: true,
  };
}

/** Ставит плагин в профиль. Идемпотентно; возвращает `{ changed }`. */
export function installSecretFilter(hermesHomeDir) {
  const target = path.join(hermesHomeDir, "plugins", PLUGIN_ID);
  let changed = false;

  fs.mkdirSync(target, { recursive: true });

  for (const name of PLUGIN_FILES) {
    const source = fs.readFileSync(path.join(PLUGIN_SOURCE_DIR, name), "utf-8");
    let existing = null;
    try {
      existing = fs.readFileSync(path.join(target, name), "utf-8");
    } catch {
      // файла ещё нет
    }
    if (existing !== source) {
      fs.writeFileSync(path.join(target, name), source, "utf-8");
      changed = true;
    }
  }

  const configPath = path.join(hermesHomeDir, "config.yaml");
  let yamlText = "";
  try {
    yamlText = fs.readFileSync(configPath, "utf-8");
  } catch {
    // конфига ещё нет — секция допишется в новый файл
  }

  const enabled = mergePluginEnabledIntoConfigYaml(yamlText);
  const merged = mergeKeySourceIntoConfigYaml(enabled.text);
  if (enabled.changed || merged.changed) {
    fs.writeFileSync(configPath, merged.text, "utf-8");
    changed = true;
  }

  return { changed };
}

/**
 * Профили специалистов: `<home>/profiles/<имя>/` с `config.yaml` (задача 3I.2,
 * D-195). Ядро ищет пользовательские плагины только в `<home профиля>/plugins`
 * (`hermes_cli/plugins_discovery.py`), а копия конфига при создании специалиста
 * плагин с собой не несёт — без этой установки у специалиста нет ни фильтра
 * секретов, ни источника ключей.
 */
export function specialistHomes(hermesHomeDir) {
  const root = path.join(hermesHomeDir, "profiles");
  let names = [];
  try {
    names = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  return names
    .map((name) => path.join(root, name))
    .filter((home) => fs.existsSync(path.join(home, "config.yaml")));
}

/** Главный профиль и все профили специалистов. Идемпотентно. */
export function installSecretFilterEverywhere(hermesHomeDir) {
  let changed = false;
  for (const home of [hermesHomeDir, ...specialistHomes(hermesHomeDir)]) {
    if (installSecretFilter(home).changed) changed = true;
  }
  return { changed };
}
