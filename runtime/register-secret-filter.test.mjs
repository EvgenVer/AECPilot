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
  installSecretFilterEverywhere,
  KEY_SOURCE_ID,
  mergeKeySourceIntoConfigYaml,
  mergePluginEnabledIntoConfigYaml,
  PLUGIN_FILES,
  PLUGIN_ID,
  PLUGIN_SOURCE_DIR,
  specialistHomes,
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

// Задача 3I.2 (D-195): источник ключей включается разделом `secrets:` — без него
// ядро внешние источники профиля не опрашивает (замер 3I.1).
describe("источник ключей в конфиге", () => {
  it("заводит раздел, когда его нет, не трогая чужое", () => {
    const { text, changed } = mergeKeySourceIntoConfigYaml("model:\n  default: x\n");

    expect(changed).toBe(true);
    expect(text).toContain(`secrets:\n  ${KEY_SOURCE_ID}:\n    enabled: true\n`);
    expect(text).toContain("model:\n  default: x");
  });

  it("дописывает в чужой раздел `secrets:`, не ломая соседний источник", () => {
    const before = "secrets:\n  bitwarden:\n    enabled: false\nmodel:\n  default: x\n";
    const { text } = mergeKeySourceIntoConfigYaml(before);

    expect(text).toContain(`  ${KEY_SOURCE_ID}:\n    enabled: true`);
    expect(text).toContain("  bitwarden:\n    enabled: false");
    expect(text).toContain("model:\n  default: x");
  });

  it("выключенный человеком источник остаётся выключенным", () => {
    const before = `secrets:\n  ${KEY_SOURCE_ID}:\n    enabled: false\n`;
    const { text, changed } = mergeKeySourceIntoConfigYaml(before);

    expect(changed).toBe(false);
    expect(text).toBe(before);
  });

  it("установка в профиль включает источник", () => {
    const dir = home();
    installSecretFilter(dir);

    expect(fs.readFileSync(path.join(dir, "config.yaml"), "utf-8")).toContain(
      `secrets:\n  ${KEY_SOURCE_ID}:\n    enabled: true`
    );
    expect(installSecretFilter(dir).changed, "второй раз — без изменений").toBe(false);
  });
});

describe("профили специалистов", () => {
  it("плагин и источник ставятся в каждый профиль с конфигом, папка без конфига пропускается", () => {
    const dir = home();
    for (const name of ["1", "2"]) {
      fs.mkdirSync(path.join(dir, "profiles", name), { recursive: true });
      fs.writeFileSync(path.join(dir, "profiles", name, "config.yaml"), "model:\n  default: x\n");
    }
    fs.mkdirSync(path.join(dir, "profiles", "broken"), { recursive: true });

    expect(specialistHomes(dir).map((home) => path.basename(home)).sort()).toEqual(["1", "2"]);
    expect(installSecretFilterEverywhere(dir).changed).toBe(true);

    for (const home of [dir, path.join(dir, "profiles", "1"), path.join(dir, "profiles", "2")]) {
      expect(fs.existsSync(path.join(home, "plugins", PLUGIN_ID, "key_source.py"))).toBe(true);
      expect(fs.readFileSync(path.join(home, "config.yaml"), "utf-8")).toContain(`${KEY_SOURCE_ID}:`);
    }
    expect(fs.existsSync(path.join(dir, "profiles", "broken", "plugins"))).toBe(false);
    expect(installSecretFilterEverywhere(dir).changed).toBe(false);
  });

  it("без папки профилей — только главный", () => {
    expect(specialistHomes(home())).toEqual([]);
  });
});
