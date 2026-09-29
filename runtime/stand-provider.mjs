// Стенд = продукт на Gemini (задача 3G.8, решение владельца 2026-09-28).
//
// Живой стенд — копия `runtime/dev-profile` (e2e/lib/core.ts). Его модель задаёт
// `config.yaml` профиля, и там стоял OpenAI без кредитов. Этот скрипт ставит ровно
// то, что пишет их экран провайдера при выборе Gemini: `model.provider: gemini`
// и модель агента из нашей таблицы пресетов (`provider-presets-pure.ts`). Наши
// модули (aec-rag, Mem0) берут адрес, ключ и свои модели из той же таблицы по
// `model.provider` — отдельно их прописывать не нужно.
//
// Картинки: блок `image_gen` снимается (D-156, решение владельца «пока без
// картинок») — Gemini не отдаёт генерацию через совместимый адрес (зонд 3G.1).
//
// `.env` не читается и не трогается: ключ `GEMINI_API_KEY` на стенде уже есть.
//
// Запуск: node runtime/stand-provider.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STAND_PROVIDER = "gemini";
export const STAND_AGENT_MODEL = "gemini-3.8-flash";

const IMAGE_GEN_NOTE =
  "# image_gen: не задан — Gemini не отдаёт картинок через совместимый адрес (D-156).";

/** Возвращает `config.yaml` со стендовым провайдером. Правка построчная: всё,
 *  кроме двух строк блока `model:` и блока `image_gen:`, остаётся как было —
 *  вместе с окончанием каждой строки (файл стенда смешанный: CRLF и LF). */
export function standConfig(yamlText) {
  const nl = yamlText.includes("\r\n") ? "\r\n" : "\n";
  const parts = yamlText.split(/(\r?\n)/);
  const out = [];
  let block = null;
  let wroteModel = false;

  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i];
    const end = parts[i + 1] ?? "";
    if (line === "" && end === "") continue;
    const top = /^([A-Za-z_][\w-]*):\s*(#.*)?$/.exec(line);
    if (top) block = top[1];
    else if (line !== "" && !line.startsWith(" ") && !line.startsWith("#")) block = null;

    if (block === "image_gen") continue;
    if (line.startsWith("# image_gen:")) continue;

    if (block === "model" && /^ {2}(default|provider):/.test(line)) {
      if (!wroteModel) {
        out.push(`  default: ${STAND_AGENT_MODEL}${end}`, `  provider: ${STAND_PROVIDER}${end}`);
        wroteModel = true;
      }
      continue;
    }
    out.push(line + (end || nl));
  }

  if (!wroteModel) {
    throw new Error("в config.yaml нет блока model: с default/provider — стенд не собран");
  }
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  out.push(IMAGE_GEN_NOTE + nl);
  return out.join("");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "dev-profile", "config.yaml");
  const before = fs.readFileSync(file, "utf-8");
  const after = standConfig(before);
  if (after === before) {
    console.log(`стенд уже на ${STAND_PROVIDER} / ${STAND_AGENT_MODEL}`);
  } else {
    fs.writeFileSync(file, after, "utf-8");
    console.log(`стенд переключён: ${STAND_PROVIDER} / ${STAND_AGENT_MODEL}, image_gen снят`);
  }
}
