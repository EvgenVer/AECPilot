// Задача T20.6: кладёт провайдер памяти Mem0 в профиль ядра.
//
// ПОЧЕМУ ЭТО НАША ЗАБОТА. С ядра 0.22.0 Mem0 ушёл из ядра в каталожный плагин
// `mem0ai/mem0` (`integrations/hermes-plugin-mem0`). Это плагин-каталог без
// системы сборки и без entry point: ядро находит его только в
// `$HERMES_HOME/plugins/mem0/` (`plugins/memory/__init__.py::find_provider_dir`).
// Если там пусто, а `memory.provider: mem0`, ядро при старте агента САМО ставит
// его с GitHub (`hermes_cli/memory_provider_migration.py`) — сетевая установка
// мимо нашего пина. Поэтому `setup.mjs` держит исходник на пине
// (`runtime/.mem0-plugin-src`), а здесь он копируется в профиль, как наш фильтр
// секретов (`register-secret-filter.mjs`): символическая ссылка на Windows
// требует прав, копия сверяется по содержимому при каждом открытии.
//
// `plugins.enabled` провайдеру памяти не нужен: загрузчик провайдеров смотрит
// только `plugins.disabled` (`load_memory_provider` → `_explicitly_disabled`).
//
// Тесты, README и pyproject плагина в профиль не едут; LICENSE едет — Apache-2.0
// и MIT требуют сохранять уведомление вместе с кодом.

import fs from "node:fs";
import path from "node:path";

import { MEM0_PLUGIN_DIR } from "./hermes-env.mjs";

/** Имя провайдера = имя папки в профиле = `memory.provider`. */
export const MEM0_PROVIDER_ID = "mem0";

/** Что составляет плагин на пине 1.3.0 (`MEM0_PLUGIN_SHA`). Список явный: при
 *  смене раскладки на новом пине установка падает, а не копирует молча часть. */
export const MEM0_PLUGIN_FILES = [
  "plugin.yaml",
  "__init__.py",
  "_backend.py",
  "_openai_llm.py",
  "_oss_providers.py",
  "_setup.py",
  "LICENSE",
];

/**
 * Ставит провайдер Mem0 в профиль. Идемпотентно; `{ changed, missing }`.
 * `missing: true` — исходника нет (не прогнан `node runtime/setup.mjs`): тогда
 * профиль не трогается, а решать, что делать, — вызывающему.
 */
export function installMem0Plugin(hermesHomeDir, sourceDir = MEM0_PLUGIN_DIR) {
  if (!fs.existsSync(path.join(sourceDir, "plugin.yaml"))) return { changed: false, missing: true };

  const target = path.join(hermesHomeDir, "plugins", MEM0_PROVIDER_ID);
  fs.mkdirSync(target, { recursive: true });
  let changed = false;
  for (const name of MEM0_PLUGIN_FILES) {
    const source = fs.readFileSync(path.join(sourceDir, name));
    let existing = null;
    try {
      existing = fs.readFileSync(path.join(target, name));
    } catch {
      // файла ещё нет
    }
    if (existing === null || !existing.equals(source)) {
      fs.writeFileSync(path.join(target, name), source);
      changed = true;
    }
  }
  return { changed, missing: false };
}
