// Находка D-58. Три случая подстановки SOUL, и разница между ними — вся суть:
// потерять текст, который человек написал сам, хуже, чем оставить чужое имя.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AEC_SOUL_MD, ensureOurSoul } from "./default-soul.mjs";

/** Их умолчательный текст ровно так, как его пишет ядро
 *  (`hermes_cli/default_soul.py`) — сокращённый, но начало настоящее: по нему
 *  файл и узнаётся. */
const THEIR_DEFAULT =
  "You are Hermes Agent, an intelligent AI assistant created by Nous Research. " +
  "You are helpful, knowledgeable, and direct.";

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
});
