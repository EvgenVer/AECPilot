// Точка подмены бэкенда Mem0 (задачи 3F.D2/D-111, 3G.4/D-157, T20.6) — в дифф
// контрактов подъёма ядра и плагина.
//
// Наш плагин (`plugins/aec_secret_filter/mem0_shared.py`) кладёт на место их
// `OSSBackend` наследника, подставляющего ключ по имени переменной, и полагается
// на их общий клиент на папку (D-111). Держится это на фактах их кода ниже.
// Сменится любой — ключ молча перестанет подставляться или память снова
// заработает у одной сессии из многих. Тест читает их исходник по пину и падает
// при подъёме, если факт изменился: тогда подмену сверяют заново.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MEM0_PLUGIN_DIR, RUNTIME_DIR } from "./hermes-env.mjs";

// С 0.22.0 провайдер Mem0 — внешний плагин по своему пину (задача T20.3): его код
// читается из `runtime/.mem0-plugin-src`, загрузчик — по-прежнему из ядра.
const memoryDir = join(RUNTIME_DIR, ".hermes-src", "plugins", "memory");
const provider = readFileSync(join(MEM0_PLUGIN_DIR, "__init__.py"), "utf8");
const loader = readFileSync(join(memoryDir, "__init__.py"), "utf8");
const backend = readFileSync(join(MEM0_PLUGIN_DIR, "_backend.py"), "utf8");

describe("точка подмены бэкенда Mem0", () => {
  it("их провайдер берёт OSSBackend атрибутом модуля в момент создания", () => {
    // `from . import _backend` внутри `_create_backend` и вызов через атрибут —
    // поэтому подмена атрибута модуля доходит до каждого нового агента.
    expect(provider).toContain("from . import _backend");
    expect(provider).toContain('return _backend.OSSBackend(self._config.get("oss", {}))');
  });

  it("на месте класса — только наследник: их модуль зовёт статические методы по имени класса", () => {
    // Функция на этом месте роняла Mem0 (замерено T20.6: `'function' object has no
    // attribute '_reject_dimension_mismatch'`).
    expect(backend).toContain("class OSSBackend(Mem0Backend):");
    expect(backend).toContain("OSSBackend._reject_dimension_mismatch(");
  });

  it("один клиент на папку и закрытие по счётчику держат они сами (D-111)", () => {
    expect(backend).toContain("_LOCAL_QDRANT_MEMORIES: dict[str, _LocalQdrantMemory] = {}");
    expect(backend).toMatch(/self\._owner\.users -= 1\s+if self\._owner\.users == 0:/);
    // Агент отпускает клиента только через close().
    expect(provider).toMatch(/def _shutdown_backend\(self\):[\s\S]*?self\._backend\.close\(\)/);
  });

  it("ключ они берут только из OPENAI_API_KEY — имя переменной подставляем мы (D-157)", () => {
    expect(backend).toContain('provider_config.get("api_key") or get_secret("OPENAI_API_KEY", "")');
    expect(backend).not.toContain("api_key_env");
  });

  it("модуль бэкенда достаётся через их import_provider_module", () => {
    expect(loader).toContain("def import_provider_module(name: str, submodule: Optional[str] = None)");
  });
});
