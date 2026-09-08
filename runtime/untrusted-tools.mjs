// Какие ответы инструментов ядро само помечает недоверенными — и какие нет
// (задача 3E.4, риск R22).
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ЗАМЕР. R22 требует, чтобы содержимое страницы приезжало в
// контекст модели помеченным как ДАННЫЕ, а не указания. Выяснилось, что ядро
// делает это само — оборачивает ответы `web_search`, `web_extract` и всего с
// префиксами `browser_`/`mcp_` в `<untrusted_tool_result>`. Значит наша работа
// — не построить защиту заново, а знать, ГДЕ ЕЁ НЕТ, и закрыть только это.
//
// НЕ ЗАКРЫТЫ ТРИ ИСТОЧНИКА, все наши: `desktop_preview` (action=read) — текст
// открытой вкладки; `drive_preview` — опись элементов для руки агента; `tour` —
// цели экскурсии, собранные внутри гостя. Все три закрывает наш главный процесс
// (`main/gateway-passthrough-pure.ts`, `markUntrustedPageText`).
//
// ДВА НОСИТЕЛЯ ОДНОГО ПРЕДЛОЖЕНИЯ. У текста — рамка `<untrusted_tool_result>`
// как у ядра. У описи и целей рамка не годится: ядро делает `json.loads` нашего
// ответа, и обёртка вокруг JSON схлопнула бы ссылки на элементы. Там пометка
// едет полем `untrusted_content_notice` первым ключом объекта. Слова в обоих
// носителях обязаны совпадать с ядром дословно — это тоже проверяется ниже.
//
// ПОЧЕМУ ЭТО ФАЙЛ, А НЕ АБЗАЦ В ЗАДАЧЕ. Множество имён живёт в ядре, а пин
// ядра двигался шесть раз. Абзац устареет молча — и хуже всего он устареет в
// «хорошую» сторону: если ядро добавит `desktop_preview` к себе, у страницы
// окажутся ДВЕ рамки, а мы будем считать, что одна. Прогон говорит об этом
// вслух.
//
//   node runtime/untrusted-tools.mjs
//
// Код возврата 1, когда замер разошёлся с записанным ожиданием.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HERMES_SRC_DIR, HERMES_VERSION, HERMES_SHA } from "./hermes-env.mjs";

const HELPERS = path.join(HERMES_SRC_DIR, "agent", "tool_dispatch_helpers.py");

/** Наша половина защиты — она обязана покрывать ровно то, чего не покрывает ядро. */
const OUR_WRAPPER = path.resolve(
  HERMES_SRC_DIR,
  "..",
  "..",
  "apps/desktop/src/main/gateway-passthrough-pure.ts",
);

/** Инструменты, чей ответ несёт содержимое, написанное снаружи. Источник
 * каждого назван, потому что «почему этот в списке» — единственный вопрос,
 * который задают такому списку. */
export const EXPECTED = {
  names: ["web_extract", "web_search"],
  prefixes: ["browser_", "mcp_"],
  // Ожидание НЕ покрытых ядром: их закрываем мы.
  //
  // `desktop_preview` (action=read) — текст открытой вкладки.
  // `drive_preview` и `tour` добавлены 2026-09-08 (замечание D-69, задача
  // 3E.21): в их ответах едет СТРУКТУРА, собранная со страницы — опись
  // элементов с подписями из `aria-label`, текста узла, `placeholder` и
  // `value`, а у экскурсии при `surface: "preview"` цели собираются внутри
  // гостя. Ни одного из трёх ядро не помечает — и у самого донора тоже, что
  // проверяется ниже: появление любого из них в списке ядра означает две рамки.
  uncovered: ["desktop_preview", "drive_preview", "tour"],
};

/** Предложение, которым ядро объясняет модели правило. Снимается из исходника,
 * потому что ДВЕ формулировки одного правила модель читает как два правила, а
 * наших носителей теперь два: рамка вокруг текста и поле внутри JSON. */
export function readCoreSentence(source) {
  const region = /<untrusted_tool_result source=[^\n]*\\n'(.*?)f'\{safe_content\}/s.exec(source);
  if (!region) return null;

  const parts = [...region[1].matchAll(/f'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  return normalizeSentence(parts.join(""));
}

/** Одна и та же нормализация для обеих сторон: переносы и повторные пробелы к
 * одному пробелу, края обрезаны. Сравнивать сырые строки нельзя — у ядра текст
 * разбит на f-строки, у нас на конкатенацию, и разбиение у них своё. */
function normalizeSentence(text) {
  return text
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Наше предложение — из константы `UNTRUSTED_SENTENCE`. */
export function readOurSentence(wrapperText) {
  const block = /const UNTRUSTED_SENTENCE\s*=([\s\S]*?)\n\n/.exec(wrapperText);
  if (!block) return null;

  const parts = [...block[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  return normalizeSentence(parts.join(""));
}

/** Читает множество имён и префиксов прямо из исходника ядра. */
export function readCoreUntrusted(source) {
  const names = new Set();
  const prefixes = new Set();

  const nameBlock = /_UNTRUSTED_TOOL_NAMES\s*=\s*frozenset\(\{([^}]*)\}\)/s.exec(source);
  for (const m of (nameBlock?.[1] ?? "").matchAll(/"([^"]+)"/g)) names.add(m[1]);

  const prefixBlock = /_UNTRUSTED_TOOL_PREFIXES\s*=\s*\(([^)]*)\)/s.exec(source);
  for (const m of (prefixBlock?.[1] ?? "").matchAll(/"([^"]+)"/g)) prefixes.add(m[1]);

  const floor = /_UNTRUSTED_WRAP_MIN_CHARS\s*=\s*(\d+)/.exec(source);

  return {
    names: [...names].sort(),
    prefixes: [...prefixes].sort(),
    minChars: floor ? Number(floor[1]) : null,
    sentence: readCoreSentence(source),
  };
}

/** Покрывает ли ядро этот инструмент своей рамкой. */
export function coveredByCore(tool, { names, prefixes }) {
  return names.includes(tool) || prefixes.some((p) => tool.startsWith(p));
}

export function compare(core, ourWrapperText) {
  const problems = [];

  for (const name of EXPECTED.names) {
    if (!core.names.includes(name)) {
      problems.push(`ядро перестало помечать «${name}» — R22 закрыт им уже не полностью`);
    }
  }
  for (const prefix of EXPECTED.prefixes) {
    if (!core.prefixes.includes(prefix)) {
      problems.push(`ядро перестало помечать префикс «${prefix}»`);
    }
  }

  for (const tool of EXPECTED.uncovered) {
    if (coveredByCore(tool, core)) {
      problems.push(
        `ядро ТЕПЕРЬ помечает «${tool}» само — у страницы стало две рамки; ` +
          `нашу (markUntrustedPageText) надо снять, а не оставлять на всякий случай`,
      );
    }
  }

  // Наша рамка обязана существовать и совпадать с ядром по тегу: две разных
  // рамки вокруг одного по смыслу текста модель читала бы как два правила.
  if (!/<untrusted_tool_result source="desktop_preview">/.test(ourWrapperText)) {
    problems.push("наша рамка для desktop_preview исчезла из gateway-passthrough-pure.ts");
  }
  if (core.minChars !== null && !new RegExp(`WRAP_MIN_CHARS = ${core.minChars}\\b`).test(ourWrapperText)) {
    problems.push(`порог обёртки разошёлся с ядром (у ядра ${core.minChars})`);
  }

  // Пометка для руки агента и экскурсии (задача 3E.21) — другой носитель, то же
  // предложение. Проверяется и носитель, и совпадение слов.
  if (!/untrusted_content_notice/.test(ourWrapperText)) {
    problems.push("поле-пометка для preview.act / tour исчезло из gateway-passthrough-pure.ts");
  }
  for (const method of ["preview.act.respond", "tour.respond"]) {
    if (!ourWrapperText.includes(`'${method}'`)) {
      problems.push(`метод «${method}» больше не помечается — ответ со страницы уедет без пометки`);
    }
  }

  const coreSentence = core.sentence;
  const ourSentence = readOurSentence(ourWrapperText);
  if (coreSentence === null) {
    problems.push("в исходнике ядра не нашлось предложения рамки — разбор устарел, а не ядро изменилось");
  } else if (ourSentence === null) {
    problems.push("у нас не нашлось константы UNTRUSTED_SENTENCE");
  } else if (coreSentence !== ourSentence) {
    problems.push(
      "формулировка разошлась с ядром — модель прочтёт два разных правила вместо одного:\n" +
        `    ядро: ${coreSentence}\n` +
        `    наше: ${ourSentence}`,
    );
  }

  return problems;
}

function main() {
  if (!fs.existsSync(HELPERS)) {
    console.error(`нет исходника ядра: ${HELPERS}`);
    console.error("прогон требует клона ядра — `node runtime/install-hermes.mjs`");
    process.exitCode = 1;
    return;
  }

  const core = readCoreUntrusted(fs.readFileSync(HELPERS, "utf8"));
  const ours = fs.readFileSync(OUR_WRAPPER, "utf8");

  console.log(`ядро ${HERMES_VERSION} (${HERMES_SHA.slice(0, 8)})`);
  console.log(`  помечает по имени:     ${core.names.join(", ") || "—"}`);
  console.log(`  помечает по префиксу:  ${core.prefixes.join(", ") || "—"}`);
  console.log(`  порог обёртки:         ${core.minChars ?? "—"} знаков`);
  console.log("");
  console.log("не покрыто ядром, закрывает наш главный процесс:");
  for (const tool of EXPECTED.uncovered) {
    console.log(`  ${tool}  ${coveredByCore(tool, core) ? "← УЖЕ ПОКРЫТ ЯДРОМ" : "— наша рамка"}`);
  }

  const problems = compare(core, ours);
  console.log("");
  if (problems.length === 0) {
    console.log("== расхождений нет: замер совпал с записанным ожиданием");
    return;
  }
  console.log(`== РАСХОЖДЕНИЕ (${problems.length})`);
  for (const problem of problems) console.log(`  ${problem}`);
  process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main();
