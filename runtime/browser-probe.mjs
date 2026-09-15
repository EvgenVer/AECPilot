// Браузер агента — против ЖИВОГО ядра и живого Chromium (задача 3E.3, UR31).
//
// ЗАЧЕМ ПРОБА, А НЕ ЧТЕНИЕ КОНФИГУРАЦИИ. Ровно как с веб-поиском (3E.2),
// чтение обмануло бы: в наборах ядра `browser` числится включённым, и из этого
// следует вывод «браузер у агента есть». На деле при пустом `browser.backend`
// ядро включает режим Browser Use CLI — «если CLI вообще запускается» — и
// ЗАМЕНЯЕТ им весь набор `browser_*` одним инструментом `browser_exec`,
// принимающим произвольный код на Python. Запускался он у нас по совпадению:
// `uvx` стоит на машине, потому что мы сами ставим `uv` для ядра. Ни один файл
// репозитория этого не говорил.
//
// ЧТО ПРОВЕРЯЕТСЯ (на настоящем ядре, настоящем Chromium, настоящей сети):
//   1. Какой движок выбран и КАКИЕ ИНСТРУМЕНТЫ из-за этого видит модель.
//      ОЖИДАНИЕ ПЕРЕВЁРНУТО 2026-09-08 решением владельца (задача 3E.17): взят
//      `browser_exec`, и проверяется именно ЗАМЕНА — один инструмент вместо
//      десяти узких, а не одиннадцатый рядом с ними. Цена выбора записана в
//      SPEC UR32 и R21 (в ленте блок кода вместо действия, исполнение в
//      отдельном демоне мимо границы 3E.7, пакет с PyPI в момент вызова); эта
//      проба её не оспаривает — она проверяет, что выбранная форма живая.
//   2. Сеть: настоящая страница из интернета открывается и отдаёт заголовок.
//   3. Форма: открыть — снять слепок — ВВЕСТИ ТЕКСТ — НАЖАТЬ и увидеть
//      введённое в ответе. Страница поднимается тут же на петле, поэтому
//      проверка детерминирована и не зависит от чужой вёрстки: ответ обязан
//      содержать ровно ту строку, которую ввёл агент. Иначе «нажал» значит
//      только «вызов не бросил исключение».
//      ЭТИ НОГИ ГОНЯЮТ ВСТРОЕННЫЙ НАБОР, и после 3E.17 это ЗАПАСНАЯ форма — та,
//      что достаётся машине без `uvx`. Функции ядра зовутся напрямую, поэтому
//      выбранный режим на них не влияет. Живого прогона самого `browser_exec`
//      здесь нет намеренно: он тянет `browser-use` с PyPI в момент вызова, и
//      делать сетевую установку частью каждого замера — не то же самое, что
//      принять её как поведение продукта.
//   4. Слушающие порты, ПОКА БРАУЗЕР ЖИВ (C9, основание HX10). Локальный
//      движок поднимает свой демон; вопрос не «поднял ли», а НА КАКОМ АДРЕСЕ.
//      Порт на петле виден только этой машине; порт на `0.0.0.0` — сетевая
//      поверхность, которой у продукта быть не должно.
//
// Прогонять при каждом подъёме пина: умолчание движка у донора уже менялось
// (Browser Use CLI 3.0 стал умолчанием без объявления), а вместе с ним молча
// меняется вся форма браузерной поверхности агента.
//
// Usage: node runtime/browser-probe.mjs

import { execFileSync } from "node:child_process";

import { PYTHON_BIN, HERMES_SRC_DIR, HERMES_HOME_DIR } from "./hermes-env.mjs";

/** Страница из интернета для сетевой ноги пробы: без скриптов, без вёрстки,
 * которая переедет. */
const PAGE = "https://example.com";

/** Строка для формы. Кириллица намеренно: путь текста от инструмента до
 * страницы и обратно проверяется на том алфавите, на котором работает продукт. */
const TYPED = "СП 20.13330 нагрузки";

const PY = `
import json, os, subprocess, threading, urllib.parse
import http.server, socketserver

from hermes_cli.plugins import discover_plugins
discover_plugins()

from tools import browser_tool as bt
# Уборка переехала в browser_tool_lifecycle (0.21.3 предупреждает, что старый
# путь в browser_tool оставлен только внешним плагинам и снимается).
from tools.browser_tool_lifecycle import cleanup_all_browsers
from tools.browser_use_cli import get_browser_backend, is_browser_use_cli_mode
from tools.registry import registry

TYPED = os.environ["PROBE_TYPED"]
out = {}
out["backend"] = get_browser_backend()
out["browser_use_mode"] = bool(is_browser_use_cli_mode())

tools = getattr(registry, "_tools", None) or {}

def _attr(spec, name):
    got = getattr(spec, name, None)
    if got is None and isinstance(spec, dict):
        got = spec.get(name)
    return got

offered, hidden = [], []
for name in sorted(tools):
    spec = tools[name]
    if _attr(spec, "toolset") not in {"browser", "browser-use"}:
        continue
    check = _attr(spec, "check_fn")
    (offered if (check is None or bool(check())) else hidden).append(name)
out["offered"] = offered
out["hidden"] = hidden


def listeners():
    """Слушающие TCP-сокеты машины: 'адрес:порт'. Windows-первый продукт —
    спрашиваем netstat, а не гадаем по коду."""
    try:
        raw = subprocess.run(
            ["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True, timeout=30
        ).stdout
    except Exception:
        return None
    found = set()
    for line in raw.splitlines():
        parts = line.split()
        if len(parts) > 3 and parts[3] == "LISTENING":
            found.add(parts[1])
    return found


FORM = (
    "<!doctype html><meta charset=utf-8><title>AEC form</title>"
    "<form method=get action='/echo'><input name=q><button type=submit>Send</button></form>"
).encode("utf-8")


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.startswith("/echo"):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("q", [""])[0]
            body = (
                "<!doctype html><meta charset=utf-8><title>echo</title><h1>ECHO " + q + "</h1>"
            ).encode("utf-8")
        else:
            body = FORM
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


server = socketserver.TCPServer(("127.0.0.1", 0), Handler)
port = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()

# Снимок портов делается ПОСЛЕ подъёма нашей же страницы: иначе её собственный
# порт попал бы в разницу и был бы приписан браузеру.
before = listeners()

task = "aec_browser_probe"
try:
    net = json.loads(bt.browser_navigate(url=os.environ["PROBE_PAGE"], task_id=task))
    out["net_ok"] = bool(net.get("success"))
    out["net_title"] = net.get("title", "")

    nav = json.loads(bt.browser_navigate(url="http://127.0.0.1:%d/" % port, task_id=task))
    out["form_ok"] = bool(nav.get("success"))
    snap = json.loads(bt.browser_snapshot(task_id=task))
    tree = str(snap.get("snapshot", ""))
    out["snap_ok"] = "textbox" in tree and "button" in tree

    def ref_for(kind):
        for line in tree.splitlines():
            if kind in line and "[ref=" in line:
                return line.split("[ref=", 1)[1].split("]", 1)[0].split(",")[0].strip()
        return ""

    box, button = ref_for("textbox"), ref_for("button")
    out["refs"] = [box, button]
    out["type_ok"] = bool(json.loads(bt.browser_type(ref=box, text=TYPED, task_id=task)).get("success"))
    out["click_ok"] = bool(json.loads(bt.browser_click(ref=button, task_id=task)).get("success"))

    echoed = json.loads(bt.browser_snapshot(task_id=task))
    out["echo_ok"] = TYPED in str(echoed.get("snapshot", ""))

    # Порты — пока браузер ЖИВ. После уборки демона мерить нечего.
    during = listeners()
    if before is None or during is None:
        out["ports"] = None
    else:
        out["ports"] = sorted(during - before)
finally:
    try:
        cleanup_all_browsers()
    except Exception as exc:
        out["cleanup_error"] = repr(exc)[:200]
    server.shutdown()

print("PROBE_JSON " + json.dumps(out, ensure_ascii=False))
`;

let raw;
try {
  raw = execFileSync(PYTHON_BIN, ["-c", PY], {
    cwd: HERMES_SRC_DIR,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      HERMES_HOME: HERMES_HOME_DIR,
      PROBE_PAGE: PAGE,
      PROBE_TYPED: TYPED,
    },
  });
} catch (error) {
  console.error("Проба не запустилась:", error.stderr || error.message);
  process.exit(1);
}

const line = raw.split(/\r?\n/).find((l) => l.startsWith("PROBE_JSON "));
if (!line) {
  console.error("Ядро не ответило в ожидаемой форме:\n" + raw.slice(-2000));
  process.exit(1);
}
const r = JSON.parse(line.slice("PROBE_JSON ".length));

const problems = [];

console.log("── Движок ─────────────────────────────────────────────");
console.log(`  browser.backend: ${JSON.stringify(r.backend)}`);
console.log(`  режим Browser Use CLI: ${r.browser_use_mode ? "ВКЛЮЧЁН" : "выключен"}`);
if (!r.browser_use_mode) {
  problems.push(
    "режим Browser Use CLI ВЫКЛЮЧЕН: выбран `browser_exec` (решение владельца " +
      "2026-09-08, SPEC UR32), а модель получает встроенный набор. Причин ровно две — " +
      "либо `browser.backend` записан в config.yaml (прежнее умолчание `off` мы больше " +
      "не пишем, но записанное раньше остаётся), либо на машине нет ни `browser-use`, " +
      "ни `uvx`",
  );
}

console.log("\n── Что видит модель ───────────────────────────────────");
console.log(`  предлагается (${r.offered.length}): ${r.offered.join(", ") || "—"}`);
console.log(`  скрыто (${r.hidden.length}): ${r.hidden.join(", ") || "—"}`);
if (!r.offered.includes("browser_exec")) {
  problems.push("модели не предлагается `browser_exec` — выбранной формы браузера нет");
}
// ЗАМЕНА, А НЕ ДОБАВКА. Одиннадцатый инструмент рядом с десятью узкими означал
// бы, что режим не включился, а инструмент просто зарегистрировался, — и агент
// ходил бы в страницу то одним видом действий, то другим.
for (const gone of ["browser_navigate", "browser_click", "browser_type", "browser_snapshot"]) {
  if (r.offered.includes(gone)) {
    problems.push(`\`${gone}\` всё ещё предлагается модели: набор не подменён, а дополнен`);
  }
}

console.log("\n── Живой прогон ВСТРОЕННОГО набора (запасная форма) ───");
console.log(`  страница из сети: ${r.net_ok ? "да" : "НЕТ"} — «${r.net_title}»`);
console.log(`  страница с формой: ${r.form_ok ? "да" : "НЕТ"}`);
console.log(`  слепок: ${r.snap_ok ? "да" : "НЕТ"} — ссылки ${JSON.stringify(r.refs || [])}`);
console.log(`  ввёл текст: ${r.type_ok ? "да" : "НЕТ"}`);
console.log(`  нажал: ${r.click_ok ? "да" : "НЕТ"}`);
console.log(`  введённое вернулось со страницы: ${r.echo_ok ? "да" : "НЕТ"}`);
for (const [ok, what] of [
  [r.net_ok, "открыть страницу из сети"],
  [r.form_ok, "открыть страницу с формой"],
  [r.snap_ok, "снять слепок с полем и кнопкой"],
  [r.type_ok, "ввести текст"],
  [r.click_ok, "нажать кнопку"],
  [r.echo_ok, "увидеть введённое в ответе страницы"],
]) {
  if (!ok) problems.push(`живой прогон: не удалось ${what}`);
}
if (r.cleanup_error) console.log(`  ⚠ уборка демона: ${r.cleanup_error}`);

console.log("\n── Слушающие порты, пока браузер жив (C9) ─────────────");
if (r.ports === null || r.ports === undefined) {
  console.log("  netstat недоступен — проверку сделать не удалось");
  problems.push("проверка слушающих портов не выполнена");
} else {
  const external = r.ports.filter((a) => !/^(127\.0\.0\.1|\[::1\]):/.test(a));
  console.log(`  появилось: ${r.ports.join(", ") || "ничего"}`);
  console.log(`  из них НЕ на петле: ${external.join(", ") || "ничего"}`);
  if (external.length) {
    problems.push(
      `браузерный движок поднял слушающий порт вне петли (${external.join(", ")}) — ` +
        "это сетевая поверхность продукта, основание HX10",
    );
  }
}

console.log("");
if (problems.length === 0) {
  console.log(
    "✅ Браузер агента: модели предлагается `browser_exec` вместо узких (замена, а не " +
      "добавка), запасной встроенный набор жив, сетевого порта не появилось.",
  );
  process.exit(0);
}
for (const p of problems) console.log(`❌ ${p}`);
process.exit(1);
