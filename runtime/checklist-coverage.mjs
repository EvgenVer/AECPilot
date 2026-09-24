// Счётчик покрытия чек-листа (задача 3F.2, SPEC AC15).
//
// Читает `docs/manual-checklist.md`, нумерует каждую позицию «✓» по схеме
// `<блок>.<шаг>.<порядковый ✓ внутри шага>` и сверяет её метку с тестами:
//
//   [e2e]     — проект `acceptance` (mock-стенд), файлы `e2e/acceptance/blocks-*`
//   [live]    — проект `acceptance-live` (живое ядро), файлы `live-*` и `model-*`
//   [человек] — остаток владельцу: микрофон, ввод ключа, Microsoft, настоящий проект
//   [фаза 6]  — блок 35: вторая машина, задача 6.17
//   [дефект ядра] — обмен A2A с партнёром: задача 3.11, дефект подписи у ядра
//
// Падает, если есть позиция без метки или метка `[e2e]`/`[live]`, у которой нет
// теста с таким номером. Имя теста обязано НАЧИНАТЬСЯ с номера позиции — так
// отчёт приёмки и чек-лист сходятся по строке без второго реестра.
//
// Usage: node runtime/checklist-coverage.mjs [--dump]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECKLIST = path.join(ROOT, "docs", "manual-checklist.md");
const SPEC_DIR = path.join(ROOT, "apps", "desktop", "e2e", "acceptance");

export const LABELS = ["[e2e]", "[live]", "[человек]", "[фаза 6]", "[дефект ядра]"];
/** Метки, за которыми обязан стоять тест. */
const TESTED = new Set(["[e2e]", "[live]"]);

/** Позиции чек-листа в порядке чтения файла. */
export function parseChecklist(text) {
  const positions = [];
  let block = 0;
  let step = 0;
  let tick = 0;

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const heading = line.match(/^## Блок (\d+)\./);
    if (heading) {
      block = Number(heading[1]);
      step = 0;
      tick = 0;
      continue;
    }
    if (/^## /.test(line)) {
      block = 0; // вышли из блоков (карта, «что писать в замечании»)
      continue;
    }
    if (block === 0) continue;

    const numbered = line.match(/^\s{0,4}(\d+)\.\s/);
    if (numbered) {
      step = Number(numbered[1]);
      tick = 0;
      continue;
    }
    const checkmark = line.match(/^(\s*)✓\s*(\S.*)$/);
    if (!checkmark) continue;
    tick += 1;
    const rest = checkmark[2];
    const label = LABELS.find((candidate) => rest.startsWith(candidate)) ?? "";
    positions.push({
      id: `${block}.${step}.${tick}`,
      block,
      step,
      line: index + 1,
      label,
      text: (label ? rest.slice(label.length) : rest).trim().slice(0, 90),
    });
  }
  return positions;
}

/** Номера позиций, за которые отвечает хотя бы один тест: имя теста начинается
 *  с номера. */
export function testedPositions() {
  const found = new Map();
  if (!fs.existsSync(SPEC_DIR)) return found;
  for (const name of fs.readdirSync(SPEC_DIR)) {
    if (!name.endsWith(".spec.ts")) continue;
    const body = fs.readFileSync(path.join(SPEC_DIR, name), "utf-8");
    for (const match of body.matchAll(/^\s*test\(\s*(['"`])(\d+(?:\.\d+)*)\b/gm)) {
      const id = match[2];
      if (!found.has(id)) found.set(id, []);
      found.get(id).push(name);
    }
  }
  return found;
}

/** Путь к чек-листу — его читает и сборщик отчёта (3F.11). */
export { CHECKLIST };

function main() {
  const text = fs.readFileSync(CHECKLIST, "utf-8");
  const positions = parseChecklist(text);
  const tests = testedPositions();

  if (process.argv.includes("--dump")) {
    for (const position of positions) {
      console.log(`${position.id}\t${position.label || "—"}\t${position.text}`);
    }
  }

  const counts = new Map(LABELS.map((label) => [label, 0]));
  const unlabelled = [];
  const untested = [];

  for (const position of positions) {
    if (!position.label) {
      unlabelled.push(position);
      continue;
    }
    counts.set(position.label, counts.get(position.label) + 1);
    if (TESTED.has(position.label) && !tests.has(position.id)) untested.push(position);
  }

  console.log("Покрытие чек-листа (SPEC AC15)");
  console.log(`  позиций всего: ${positions.length}`);
  for (const label of LABELS) console.log(`  ${label.padEnd(14)} ${counts.get(label)}`);
  console.log(`  тестов с номером позиции: ${tests.size}`);

  if (unlabelled.length > 0) {
    console.log(`\nБЕЗ МЕТКИ (${unlabelled.length}):`);
    for (const position of unlabelled.slice(0, 40)) {
      console.log(`  строка ${position.line}\t${position.id}\t${position.text}`);
    }
    if (unlabelled.length > 40) console.log(`  … и ещё ${unlabelled.length - 40}`);
  }

  if (untested.length > 0) {
    console.log(`\nМЕТКА ЕСТЬ, ТЕСТА НЕТ (${untested.length}):`);
    for (const position of untested.slice(0, 40)) {
      console.log(`  строка ${position.line}\t${position.id}\t${position.label}\t${position.text}`);
    }
    if (untested.length > 40) console.log(`  … и ещё ${untested.length - 40}`);
  }

  // Тест, которому не соответствует ни одна позиция, — тоже расхождение: либо
  // номер опечатан, либо позицию из чек-листа убрали, а тест остался.
  const known = new Set(positions.map((position) => position.id));
  const orphans = [...tests.keys()].filter((id) => !known.has(id) && !id.startsWith("0."));
  if (orphans.length > 0) {
    console.log(`\nТЕСТ ЕСТЬ, ПОЗИЦИИ НЕТ (${orphans.length}):`);
    for (const id of orphans) console.log(`  ${id}\t${tests.get(id).join(", ")}`);
  }

  const failed = unlabelled.length + untested.length + orphans.length;
  console.log(failed === 0 ? "\nСошлось." : `\nНЕ СОШЛОСЬ: ${failed}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

// Модуль импортирует сборщик отчёта (3F.11) ради `parseChecklist`; сводка
// печатается только при прямом запуске.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
