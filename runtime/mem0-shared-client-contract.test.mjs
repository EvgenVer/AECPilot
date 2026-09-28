// Точка подмены задачи 3F.D2 (D-111) — в дифф контрактов подъёма ядра.
//
// Наш плагин (`plugins/aec_secret_filter/mem0_shared.py`) кладёт общую фабрику на
// место их `OSSBackend`, и держится это на трёх фактах их кода. Сменится любой —
// подмена молча перестанет действовать, и память снова заработает у одной сессии
// из многих. Этот тест читает исходник ядра по пину и падает при подъёме, если
// факт изменился: тогда подмену сверяют заново, а не узнают о ней из приёмки.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RUNTIME_DIR } from "./hermes-env.mjs";

const memoryDir = join(RUNTIME_DIR, ".hermes-src", "plugins", "memory");
const provider = readFileSync(join(memoryDir, "mem0", "__init__.py"), "utf8");
const loader = readFileSync(join(memoryDir, "__init__.py"), "utf8");
const backend = readFileSync(join(memoryDir, "mem0", "_backend.py"), "utf8");

describe("точка подмены общего клиента Mem0", () => {
  it("их провайдер берёт OSSBackend атрибутом модуля в момент создания", () => {
    // `from . import _backend` внутри `_create_backend` и вызов через атрибут —
    // поэтому подмена атрибута модуля доходит до каждого нового агента.
    expect(provider).toContain("from . import _backend");
    expect(provider).toContain('return _backend.OSSBackend(self._config.get("oss", {}))');
  });

  it("агент отпускает клиента только через close()", () => {
    // Наш счётчик закрывает общий клиент на последнем `close`; иной путь
    // освобождения обошёл бы счётчик.
    expect(provider).toMatch(/def _shutdown_backend\(self\):[\s\S]*?self\._backend\.close\(\)/);
  });

  it("модуль бэкенда достаётся через их import_provider_module, клиент — по пути хранилища", () => {
    expect(loader).toContain("def import_provider_module(name: str, submodule: Optional[str] = None)");
    expect(backend).toContain("class OSSBackend(Mem0Backend):");
    expect(backend).toContain('vs_config = dict(vector_store.get("config", {}))');
  });
});
