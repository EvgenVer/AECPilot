// Задача 5.3 — установка фильтра секретов в профиль.
//
// Проверяется не «файлы скопировались», а два условия, без которых фильтра нет,
// хотя папка на месте: плагин ВКЛЮЧЁН в конфиге и его состав совпадает с
// исходником. Плюс то, что установка не портит чужие ключи конфига.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  installSecretFilter,
  mergePluginEnabledIntoConfigYaml,
  PLUGIN_FILES,
  PLUGIN_ID,
  PLUGIN_SOURCE_DIR,
} from "./register-secret-filter.mjs";

const home = () => fs.mkdtempSync(path.join(os.tmpdir(), "aec-secret-home-"));

describe("включение в конфиге", () => {
  it("создаёт секцию, когда её нет", () => {
    const { text, changed } = mergePluginEnabledIntoConfigYaml("model:\n  default: gpt-5-mini\n");

    expect(changed).toBe(true);
    expect(text).toContain(`plugins:\n  enabled:\n    - ${PLUGIN_ID}\n`);
    expect(text, "чужие ключи обязаны уцелеть").toContain("default: gpt-5-mini");
  });

  it("дописывает в существующий список, а не затирает его", () => {
    const before = "plugins:\n  enabled:\n    - a2a-platform\n  disabled:\n    - other\n";
    const { text } = mergePluginEnabledIntoConfigYaml(before);

    expect(text).toContain("    - a2a-platform");
    expect(text).toContain(`    - ${PLUGIN_ID}`);
    expect(text, "соседний ключ секции — не наш").toContain("  disabled:\n    - other");
  });

  it("ставит запись В СПИСОК, а не после соседнего ключа", () => {
    // Строка, уехавшая под `disabled:`, выключила бы плагин вместо включения.
    const { text } = mergePluginEnabledIntoConfigYaml(
      "plugins:\n  enabled:\n    - a2a-platform\n  disabled:\n    - other\n"
    );
    const lines = text.split("\n");

    expect(lines.indexOf(`    - ${PLUGIN_ID}`)).toBeLessThan(lines.indexOf("  disabled:"));
  });

  it("заводит список, когда секция есть, а списка нет", () => {
    const { text } = mergePluginEnabledIntoConfigYaml("plugins:\n  disabled:\n    - other\n");

    expect(text).toContain(`  enabled:\n    - ${PLUGIN_ID}`);
    expect(text).toContain("  disabled:");
  });

  it("повторный вызов ничего не меняет", () => {
    const once = mergePluginEnabledIntoConfigYaml("plugins:\n  enabled:\n    - a2a-platform\n");
    const twice = mergePluginEnabledIntoConfigYaml(once.text);

    expect(twice.changed).toBe(false);
    expect(twice.text).toBe(once.text);
  });
});

describe("установка в профиль", () => {
  it("кладёт состав плагина и включает его", () => {
    const dir = home();
    expect(installSecretFilter(dir).changed).toBe(true);

    for (const name of PLUGIN_FILES) {
      const installed = fs.readFileSync(path.join(dir, "plugins", PLUGIN_ID, name), "utf-8");
      expect(installed).toBe(fs.readFileSync(path.join(PLUGIN_SOURCE_DIR, name), "utf-8"));
    }

    expect(fs.readFileSync(path.join(dir, "config.yaml"), "utf-8")).toContain(`- ${PLUGIN_ID}`);
  });

  it("тесты плагина в профиль НЕ уезжают — там нет pytest", () => {
    const dir = home();
    installSecretFilter(dir);

    expect(fs.existsSync(path.join(dir, "plugins", PLUGIN_ID, "tests"))).toBe(false);
  });

  it("повторная установка ничего не меняет", () => {
    const dir = home();

    expect(installSecretFilter(dir).changed).toBe(true);
    expect(installSecretFilter(dir).changed).toBe(false);
  });

  it("правка исходника доезжает в профиль", () => {
    const dir = home();
    installSecretFilter(dir);
    fs.writeFileSync(path.join(dir, "plugins", PLUGIN_ID, "secrets.py"), "# устарело\n", "utf-8");

    expect(installSecretFilter(dir).changed).toBe(true);
    expect(fs.readFileSync(path.join(dir, "plugins", PLUGIN_ID, "secrets.py"), "utf-8")).toBe(
      fs.readFileSync(path.join(PLUGIN_SOURCE_DIR, "secrets.py"), "utf-8")
    );
  });

  it("манифест объявляет ровно тот хук, на котором стоит отказ", () => {
    // Плагин без своего хука в манифесте ядро загрузит молча и ничего не
    // повесит: фильтр будет «установлен» и не будет работать.
    const manifest = fs.readFileSync(path.join(PLUGIN_SOURCE_DIR, "plugin.yaml"), "utf-8");

    expect(manifest).toContain("pre_tool_call");
    expect(manifest).toContain(`name: ${PLUGIN_ID}`);
  });

  it("манифест объявляет вид плагина ЯВНО", () => {
    // ЛОВУШКА, КОТОРАЯ УЖЕ СРАБОТАЛА (2026-09-09). Без явного `kind` ядро
    // угадывает вид ПОДСТРОКОЙ в первых 8 КБ `__init__.py`
    // (`_detect_kind_from_source`): слово `MemoryProvider` — хоть в коде, хоть в
    // комментарии — делает плагин «чужим провайдером памяти», и ядро НЕ грузит
    // модуль и не вешает ни одного хука. Снаружи всё выглядит целым: папка на
    // месте, строка в `plugins.enabled` на месте. Нас поймало упоминание их
    // класса в пояснении; замерено зондом — `hooks: 0`, `enabled: false`.
    const manifest = fs.readFileSync(path.join(PLUGIN_SOURCE_DIR, "plugin.yaml"), "utf-8");

    expect(manifest).toMatch(/^kind:\s*standalone\s*$/m);
  });
});
