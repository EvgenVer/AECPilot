// Браузер агента — против ЖИВОГО ядра и живого Chromium (задача 3E.3, UR31).
//
// ЗАЧЕМ ПРОБА, А НЕ ЧТЕНИЕ КОНФИГУРАЦИИ. Ровно как с веб-поиском (3E.2), чтение
// обманывало: в наборах ядра `browser` числился включённым, а какой формы браузер
// получает модель, решала машина. До 0.22.2 при пустом `browser.backend` ядро
// ЗАМЕНЯЛО десять узких `browser_*` одним `browser_exec` с кодом на Python — «если CLI
// вообще запускается» (решение владельца 2026-09-08, задача 3E.17: берём `browser_exec`).
//
// С ядра 0.23.0 (задача T51) выбора больше нет: узкие инструменты и `agent-browser` ядро
// убрало (`tools/browser_tool.py` — пустая заглушка), `browser_exec` — единственный
// браузер, и он идёт через `browser-harness` из venv ядра, а не через `uvx browser-use`
// с PyPI в момент вызова. Поэтому живой прогон теперь гоняет сам `browser_exec`.
//
// ЧТО ПРОВЕРЯЕТСЯ (на настоящем ядре, настоящем Chromium, настоящей сети):
//   1. Какие браузерные инструменты видит модель: `browser_exec` есть, узких нет.
//   2. Сеть: настоящая страница из интернета открывается и отдаёт заголовок.
//   3. Форма: открыть — ВВЕСТИ ТЕКСТ — НАЖАТЬ и увидеть введённое в ответе. Страница
//      поднимается тут же на петле, поэтому проверка детерминирована и не зависит от
//      чужой вёрстки: ответ обязан содержать ровно ту строку, которую ввёл код.
//   4. Слушающие порты, ПОКА БРАУЗЕР ЖИВ (C9, основание HX10). Локальный движок
//      поднимает свой демон; вопрос не «поднял ли», а НА КАКОМ АДРЕСЕ. Порт на петле
//      виден только этой машине; порт на `0.0.0.0` — сетевая поверхность, которой у
//      продукта быть не должно.
//
// Прогонять при каждом подъёме пина: форма браузерной поверхности у ядра уже менялась
// дважды без объявления.
//
// Usage: AEC_HERMES_HOME=<temporary profile copy> node runtime/browser-probe.mjs

import { execFileSync } from "node:child_process";

import { PYTHON_ARGS, PYTHON_BIN, HERMES_SRC_DIR, HERMES_HOME_DIR } from "./hermes-env.mjs";

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

from tools.registry import discover_builtin_tools, registry
from tools import browser_use_cli as bu
from tools.browser_session_lifecycle import cleanup_all_browsers

# Every built-in tool module registers itself, the way the core starts a session: the
# list is what the core has, not what this probe happened to import.
discover_builtin_tools()
out = {"available": bool(bu.browser_exec_available())}

offered, hidden = [], []
tools = getattr(registry, "_tools", {}) or {}
for name in sorted(tools):
    spec = tools[name]
    toolset = getattr(spec, "toolset", None)
    if toolset not in {"browser", "browser-use"}:
        continue
    check = getattr(spec, "check_fn", None)
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


def run(code):
    got = json.loads(bu.browser_exec(code=code, task_id="aec_browser_probe", timeout_s=180))
    return got


server = socketserver.TCPServer(("127.0.0.1", 0), Handler)
port = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()

# Снимок портов делается ПОСЛЕ подъёма нашей же страницы: иначе её собственный
# порт попал бы в разницу и был бы приписан браузеру.
before = listeners()

try:
    net = run("# Opening a page from the internet\\nnew_tab(%r)\\nwait_for_load()\\nprint('TITLE=' + js('document.title'))" % os.environ["PROBE_PAGE"])
    out["net_ok"] = bool(net.get("success")) and "TITLE=" in str(net.get("output", ""))
    out["net_title"] = str(net.get("output", "")).split("TITLE=", 1)[-1].strip()[:80]
    if not out["net_ok"]:
        out["net_error"] = str(net.get("error") or net.get("stderr") or net)[:400]

    typed = os.environ["PROBE_TYPED"]
    form = run(
        "# Filling the local test form\\n"
        "goto_url('http://127.0.0.1:%d/')\\n" % port
        + "wait_for_load()\\n"
        + "fill_input('input[name=q]', %r)\\n" % typed
        + "js(\\"document.querySelector('button').click()\\")\\n"
        # После щелчка wait_for_load() может вернуться ещё до перехода — под нагрузкой
        # проба читала старую страницу (1 из 4 прогонов T51). Ждём сам ответ, до 15 с.
        + "import time\\n"
        + "for _ in range(75):\\n"
        + "    text = js('document.body.innerText') or ''\\n"
        + "    if 'ECHO ' in text:\\n"
        + "        break\\n"
        + "    time.sleep(0.2)\\n"
        + "print('ECHO_TEXT=' + text)"
    )
    out["form_ok"] = bool(form.get("success"))
    out["echo_ok"] = ("ECHO " + typed) in str(form.get("output", ""))
    if not out["echo_ok"]:
        out["form_error"] = str(form.get("error") or form.get("stderr") or form.get("output") or form)[:400]

    # Порты — пока браузер ЖИВ. После уборки демона мерить нечего.
    during = listeners()
    out["ports"] = None if before is None or during is None else sorted(during - before)
finally:
    for stop in (bu.stop_harness_daemons, cleanup_all_browsers):
        try:
            stop()
        except Exception as exc:
            out.setdefault("cleanup_error", repr(exc)[:200])
    server.shutdown()

print("PROBE_JSON " + json.dumps(out, ensure_ascii=False))
`;

let raw;
try {
  raw = execFileSync(PYTHON_BIN, [...PYTHON_ARGS, "-c", PY], {
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

console.log("── Что видит модель ───────────────────────────────────");
console.log(`  browser_exec доступен (browser-harness в venv ядра): ${r.available ? "да" : "НЕТ"}`);
console.log(`  предлагается (${r.offered.length}): ${r.offered.join(", ") || "—"}`);
console.log(`  скрыто (${r.hidden.length}): ${r.hidden.join(", ") || "—"}`);
if (!r.offered.includes("browser_exec")) {
  problems.push("модели не предлагается `browser_exec` — браузера у агента нет");
}
for (const gone of ["browser_navigate", "browser_click", "browser_type", "browser_snapshot"]) {
  if (r.offered.includes(gone) || r.hidden.includes(gone)) {
    problems.push(`\`${gone}\` снова зарегистрирован: ядро вернуло узкий набор — пересмотреть 3E.17`);
  }
}

console.log("\n── Живой прогон browser_exec ──────────────────────────");
console.log(`  страница из сети: ${r.net_ok ? "да" : "НЕТ"} — «${r.net_title ?? ""}»`);
if (r.net_error) console.log(`    ${r.net_error}`);
console.log(`  страница с формой открылась: ${r.form_ok ? "да" : "НЕТ"}`);
console.log(`  введённое вернулось со страницы: ${r.echo_ok ? "да" : "НЕТ"}`);
if (r.form_error) console.log(`    ${r.form_error}`);
for (const [ok, what] of [
  [r.net_ok, "открыть страницу из сети"],
  [r.form_ok, "открыть страницу с формой"],
  [r.echo_ok, "ввести текст, нажать и увидеть введённое в ответе страницы"],
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
    "✅ Браузер агента: модели предлагается `browser_exec`, узких инструментов нет, " +
      "живой прогон с формой прошёл, сетевого порта не появилось.",
  );
  process.exit(0);
}
for (const p of problems) console.log(`❌ ${p}`);
process.exit(1);
