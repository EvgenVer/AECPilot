// Чистый старт для ручной приёмки (решение владельца 2026-10-06): приложение
// запускается так, будто его поставили впервые — без ключей, проектов, истории
// разговоров и памяти.
//
// Что удаляется:
//   - runtime/dev-profile — профиль ядра, на котором работает `pnpm dev`
//     (сессии, память, канбан, рутины, ключ в `.env`); папка остаётся пустой;
//   - %APPDATA%\@aecpilot\desktop — данные приложения (сохранённые ключи,
//     недавние проекты, привязка чатов, память мастера, кэши окна);
//   - %TEMP%\aecpilot-* — папки, оставшиеся от прогонов автотестов.
// Что НЕ трогается: runtime/e2e-profile (профиль автотестов с их ключом), ядро
// и его venv, папки ваших проектов.
//
// Использование: node runtime/reset-clean.mjs   (спросит подтверждение)
//                node runtime/reset-clean.mjs --yes

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEV_PROFILE = path.join(RUNTIME_DIR, "dev-profile");
const APP_DATA = process.env.APPDATA ? path.join(process.env.APPDATA, "@aecpilot", "desktop") : null;
const TEMP = os.tmpdir();

const tempLeftovers = () =>
  fs
    .readdirSync(TEMP, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("aecpilot-"))
    .map((entry) => path.join(TEMP, entry.name));

/** Приложение и шлюз ядра держат базы профиля открытыми — без остановки часть
 *  файлов не удалится. Останавливается только наше: Electron разработки и шлюз,
 *  запущенный из этого репозитория. */
function stopProcesses() {
  if (process.platform !== "win32") return;
  const script = [
    "Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force",
    "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'gateway run' -and $_.CommandLine -match 'AECPilot' -and $_.Name -notin @('bash.exe','powershell.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join("; ");
  spawnSync("powershell", ["-NoProfile", "-Command", script], { stdio: "ignore" });
}

/** Базы SQLite отпускаются с задержкой после выхода процесса — несколько попыток. */
function remove(target) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
      if (!fs.existsSync(target)) return true;
    } catch {
      // следующая попытка
    }
  }
  return !fs.existsSync(target);
}

const leftovers = tempLeftovers();
console.log("Будет удалено:");
console.log(`  профиль ядра       ${DEV_PROFILE}`);
if (APP_DATA) console.log(`  данные приложения  ${APP_DATA}`);
console.log(`  папки автотестов   ${leftovers.length} шт. в ${TEMP}\\aecpilot-*`);
console.log("Не трогается: runtime/e2e-profile, ядро, папки ваших проектов.");

if (!process.argv.includes("--yes")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Закройте приложение и введите «да», чтобы продолжить: ")).trim().toLowerCase();
  rl.close();
  if (answer !== "да" && answer !== "yes") {
    console.log("Отменено, ничего не удалено.");
    process.exit(0);
  }
}

stopProcesses();

const failed = [];
for (const target of [DEV_PROFILE, APP_DATA, ...leftovers]) {
  if (target && fs.existsSync(target) && !remove(target)) failed.push(target);
}
fs.mkdirSync(DEV_PROFILE, { recursive: true });

if (failed.length > 0) {
  console.log("Не удалилось (занято другим процессом?) — закройте его и повторите:");
  for (const target of failed) console.log(`  ${target}`);
  process.exit(1);
}
console.log("Готово: следующий `corepack pnpm dev` — чистый первый запуск.");
