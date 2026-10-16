// Замер для задачи 3.8а: чей скил выигрывает при совпадении имён.
//
// ЗАЧЕМ. Отчёт 3.8б назвал третью цену внешнего яруса: порядок обхода у ядра —
// `project → local → external`, первое имя выигрывает. На ПРОЕКТНОМ ярусе скил
// проекта перекрывает одноимённый профильный; на ВНЕШНЕМ (а мы вынуждены жить
// на нём — `.git` у vault нет) выходит наоборот: профильный перекроет проектный.
//
// Для UR29 это заметно: «правила нормоконтроля ЭТОЙ организации» должны
// перебивать общие, а не наоборот. Отчёт оставил пункт «проверить руками» —
// проба его закрывает.
//
// ОПЫТ. Кладём два скила с ОДНИМ именем и разными описаниями: один в профиль
// (`<HERMES_HOME>/skills/<имя>/SKILL.md`), другой в папку проекта, путь которой
// прописан в `skills.external_dirs`. Спрашиваем у ядра список скилов и смотрим,
// чьё описание вернулось.
//
// Usage: node runtime/skill-priority-probe.mjs

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { HERMES_HOME_DIR } from "./hermes-env.mjs";
import { startServe, waitHealthy, stopServe } from "./serve.mjs";

const SKILL_NAME = "aecpilot-priority-probe";
const PROFILE_SKILL_DIR = path.join(HERMES_HOME_DIR, "skills", SKILL_NAME);
const PROJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "aec-priority-project-"));
const PROJECT_SKILL_DIR = path.join(PROJECT_DIR, ".agents", "skills", SKILL_NAME);
const CONFIG_PATH = path.join(HERMES_HOME_DIR, "config.yaml");

function skillBody(where) {
  return [
    "---",
    `name: ${SKILL_NAME}`,
    `description: OTVET-${where}`,
    "---",
    `# ${where}`,
    ""
  ].join("\n");
}

function makeRest(handle) {
  const base = `http://${handle.host}:${handle.port}`;
  const headers = {
    "X-Hermes-Session-Token": handle.token,
    "Content-Type": "application/json"
  };
  return async function rest(method, path_) {
    const response = await fetch(`${base}${path_}`, { method, headers });
    const text = await response.text();
    try {
      return { status: response.status, body: text ? JSON.parse(text) : null };
    } catch {
      return { status: response.status, body: text };
    }
  };
}

async function main() {
  const originalConfig = fs.readFileSync(CONFIG_PATH, "utf-8");

  fs.mkdirSync(PROFILE_SKILL_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_SKILL_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROFILE_SKILL_DIR, "SKILL.md"), skillBody("PROFILNYJ"), "utf-8");
  fs.writeFileSync(path.join(PROJECT_SKILL_DIR, "SKILL.md"), skillBody("PROEKTNYJ"), "utf-8");

  const externalDir = path.join(PROJECT_DIR, ".agents", "skills").replace(/\\/g, "/");
  const item = `    - ${JSON.stringify(externalDir)}`;
  // В профиле уже есть раздел `skills:` (с T20.5 — `auto_load: [aec-qa]`), часто и
  // `external_dirs` в нём, а ядро 0.22 на повторе ключа не стартует (код 2).
  // Поэтому папка дописывается элементом в существующий список, а не вторым
  // `skills:` в конец файла.
  const lines = originalConfig.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const section = lines.findIndex((line) => /^skills:\s*$/.test(line));
  let end = lines.length;
  for (let i = section + 1; section !== -1 && i < lines.length; i += 1) {
    if (/^\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const list = section === -1 ? -1 : lines.findIndex((l, i) => i > section && i < end && /^  external_dirs:\s*$/.test(l));
  if (section === -1) lines.push("skills:", "  external_dirs:", item);
  else if (list === -1) lines.splice(section + 1, 0, "  external_dirs:", item);
  else lines.splice(list + 1, 0, item);
  fs.writeFileSync(CONFIG_PATH, `${lines.join("\n")}\n`, "utf-8");

  const handle = await startServe();

  try {
    await waitHealthy(handle);
    const rest = makeRest(handle);

    const list = await rest("GET", "/api/skills");
    const rows = Array.isArray(list.body) ? list.body : (list.body?.skills ?? []);
    const mine = rows.filter((row) => String(row?.name ?? "").includes(SKILL_NAME));

    console.log(`скилов с этим именем в списке: ${mine.length}`);
    for (const row of mine) {
      console.log(`  name=${row.name} description=${JSON.stringify(row.description)}`);
      if (row.path) console.log(`  path=${row.path}`);
    }

    console.log("\nВЫВОД");
    const text = JSON.stringify(mine);
    if (text.includes("OTVET-PROEKTNYJ") && !text.includes("OTVET-PROFILNYJ")) {
      console.log("  выигрывает ПРОЕКТНЫЙ — как и нужно для UR29, править нечего.");
    } else if (text.includes("OTVET-PROFILNYJ") && !text.includes("OTVET-PROEKTNYJ")) {
      console.log("  выигрывает ПРОФИЛЬНЫЙ — перекрывает проектный, для UR29 это неверно.");
    } else if (mine.length === 0) {
      console.log("  ни одного не видно — замер неинформативен, проверить путь и поле.");
    } else {
      console.log("  видны ОБА — перекрытия нет, имена не конфликтуют.");
    }
  } finally {
    fs.writeFileSync(CONFIG_PATH, originalConfig, "utf-8");
    fs.rmSync(PROFILE_SKILL_DIR, { force: true, recursive: true });
    fs.rmSync(PROJECT_DIR, { force: true, recursive: true });
    await stopServe(handle);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
