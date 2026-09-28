// Находка D-58. Три случая подстановки SOUL, и разница между ними — вся суть:
// потерять текст, который человек написал сам, хуже, чем оставить чужое имя.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AEC_SOUL_MD, PREVIOUS_AEC_SOUL_MD, ensureOurSoul } from "./default-soul.mjs";
import { HERMES_SRC_DIR } from "./hermes-env.mjs";

/** Их умолчательный текст ровно так, как его писало ядро ДО 0.21.0
 *  (`hermes_cli/default_soul.py`) — сокращённый, но начало настоящее: по нему
 *  файл и узнаётся. Оставлен: установки, заведённые на прежних версиях, лежат
 *  с этим текстом, и узнавать его надо по-прежнему. */
const THEIR_DEFAULT =
  "You are Hermes Agent, an intelligent AI assistant created by Nous Research. " +
  "You are helpful, knowledgeable, and direct.";

/** Он же в 0.21.0 — текст переписан целиком (#95681), начало то же. */
const THEIR_DEFAULT_0_21 =
  "You are Hermes Agent, built by Nous Research. Be direct: match the " +
  "length of your reply to the weight of the ask.";

const made = [];

function tempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aec-soul-"));
  made.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of made.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("умолчательный SOUL профиля", () => {
  it("файла нет — пишем свой", () => {
    const home = tempHome();

    expect(ensureOurSoul(home)).toBe("written");
    expect(fs.readFileSync(path.join(home, "SOUL.md"), "utf-8")).toBe(AEC_SOUL_MD);
  });

  it("каталога профиля ещё нет — создаём вместе с файлом", () => {
    // Так и бывает при первом запуске: `startServe` зовёт нас до того, как ядро
    // тронуло профиль.
    const home = path.join(tempHome(), "profile");

    expect(ensureOurSoul(home)).toBe("written");
    expect(fs.readFileSync(path.join(home, "SOUL.md"), "utf-8")).toBe(AEC_SOUL_MD);
  });

  it("лежит ИХ умолчательный — заменяем", () => {
    // Своего замысла в нём ноль: это тот самый текст, из-за которого находка и
    // заведена (C12 — чужое имя продукта там, где его видит человек).
    const home = tempHome();
    fs.writeFileSync(path.join(home, "SOUL.md"), THEIR_DEFAULT, "utf-8");

    expect(ensureOurSoul(home)).toBe("replaced");
    expect(fs.readFileSync(path.join(home, "SOUL.md"), "utf-8")).toBe(AEC_SOUL_MD);
  });

  it("их текст с ведущими пробелами узнаётся тоже", () => {
    const home = tempHome();
    fs.writeFileSync(path.join(home, "SOUL.md"), `\n\n  ${THEIR_DEFAULT}`, "utf-8");

    expect(ensureOurSoul(home)).toBe("replaced");
  });

  it("человек написал своё — НЕ ТРОГАЕМ", () => {
    const home = tempHome();
    const mine = "Ты — мой личный помощник. Отвечай коротко.";
    fs.writeFileSync(path.join(home, "SOUL.md"), mine, "utf-8");

    expect(ensureOurSoul(home)).toBe("kept");
    expect(fs.readFileSync(path.join(home, "SOUL.md"), "utf-8")).toBe(mine);
  });

  it("наш же текст повторным запуском не переписывается впустую", () => {
    const home = tempHome();
    ensureOurSoul(home);

    expect(ensureOurSoul(home)).toBe("kept");
  });

  it("в тексте нет чужого имени продукта — это и есть предмет C12", () => {
    expect(AEC_SOUL_MD).not.toMatch(/hermes|nous research/i);
    expect(AEC_SOUL_MD).toContain("AECPilot");
  });

  it("лежит НАШ ПРЕЖНИЙ умолчательный — заменяем на месте (UR41)", () => {
    // Его писали мы, не человек: установки до 2026-09-28 получают агента КР.
    const home = tempHome();
    fs.writeFileSync(path.join(home, "SOUL.md"), `${PREVIOUS_AEC_SOUL_MD}\n`, "utf-8");

    expect(ensureOurSoul(home)).toBe("replaced");
    expect(fs.readFileSync(path.join(home, "SOUL.md"), "utf-8")).toBe(AEC_SOUL_MD);
  });

  it("человек дописал что-то к нашему прежнему — это уже его текст, НЕ ТРОГАЕМ", () => {
    const home = tempHome();
    const edited = `${PREVIOUS_AEC_SOUL_MD}\nОтвечай только списками.`;
    fs.writeFileSync(path.join(home, "SOUL.md"), edited, "utf-8");

    expect(ensureOurSoul(home)).toBe("kept");
    expect(fs.readFileSync(path.join(home, "SOUL.md"), "utf-8")).toBe(edited);
  });

  it("агент по умолчанию — помощник инженера КР, заголовок «AECPilot — …» (UR41)", () => {
    expect(AEC_SOUL_MD.split("\n")[0]).toBe(
      "# AECPilot — инженерный помощник по конструктивным решениям",
    );
    expect(AEC_SOUL_MD).toContain("раздела КР");
  });

  it("редакцию нормы проверяет при нормативном выводе или ссылке на пункт, а не перед каждым ответом", () => {
    expect(AEC_SOUL_MD).toContain(
      "Когда делаешь нормативный вывод или ссылаешься на пункт, проверяй актуальный статус",
    );
    expect(AEC_SOUL_MD).not.toContain("Перед ответом проверяй");
  });

  it("их НОВЫЙ умолчательный текст (0.21.0) узнаётся так же", () => {
    // В 0.21.0 автор переписал `DEFAULT_SOUL_MD` целиком (#95681): текст стал
    // поведенческим. Самопредставление в начале не изменилось — на нём наша
    // подстановка и держится.
    const home = tempHome();
    fs.writeFileSync(path.join(home, "SOUL.md"), THEIR_DEFAULT_0_21, "utf-8");

    expect(ensureOurSoul(home)).toBe("replaced");
    expect(fs.readFileSync(path.join(home, "SOUL.md"), "utf-8")).toBe(AEC_SOUL_MD);
  });
});

// Проверка против УСТАНОВЛЕННОГО ядра, а не против нашей памяти о нём.
//
// Вся подстановка держится на одном допущении: их умолчательный SOUL.md
// начинается словами `You are Hermes Agent`. Допущение уже пережило четыре
// подъёма пина, но 0.21.0 показал, что текст автор переписывает целиком, —
// а если он перепишет и первую строку, наша проверка перестанет узнавать их
// умолчание МОЛЧА: файл с чужим именем останется лежать, и никто не упадёт.
// Поэтому допущение сверяется с исходником ядра при каждом прогоне.
describe("допущение о тексте ядра ещё верно", () => {
  const source = path.join(HERMES_SRC_DIR, "hermes_cli", "default_soul.py");
  const available = fs.existsSync(source);

  it.skipIf(!available)("их DEFAULT_SOUL_MD всё ещё начинается узнаваемо", () => {
    const text = fs.readFileSync(source, "utf-8");
    const start = text.indexOf("DEFAULT_SOUL_MD");
    expect(start, "константа на месте").toBeGreaterThan(-1);

    // Первая строковая литерала после объявления — начало их текста.
    const literal = /"((?:[^"\\]|\\.)*)"/.exec(text.slice(start));
    expect(literal, "литерал их текста найден").not.toBeNull();
    expect(literal[1]).toContain("You are Hermes Agent");
  });

  it.skipIf(!available)("наш текст не попал в их список legacy-шаблонов", () => {
    // Их `_ensure_default_soul_md` перезаписывает НА МЕСТЕ файл, совпадающий с
    // любым из этих шаблонов. В 0.21.0 список пополнился их прежним
    // умолчанием; если туда когда-нибудь попадёт что-то, похожее на наш текст,
    // ядро начнёт затирать нашу личность при каждом старте.
    const text = fs.readFileSync(source, "utf-8");
    expect(text).not.toContain("AECPilot");
    expect(text).not.toContain(AEC_SOUL_MD.slice(0, 40));
  });
});
