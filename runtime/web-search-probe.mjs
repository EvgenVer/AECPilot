// Веб-поиск агента — против ЖИВОГО ядра (задача 3E.2, UR32).
//
// ЗАЧЕМ ПРОБА, А НЕ ЧТЕНИЕ КОНФИГУРАЦИИ. Именно чтение и подвело: по
// `config.yaml` было видно, что провайдер не выбран, и из этого следовал вывод
// «поиска нет». На деле ядро шло по лестнице автоопределения и заканчивало
// БЕСКЛЮЧЕВЫМ ярусом — запрос уходил на публичную точку Exa
// (`plugins/web/keyless_mcp.py`), то есть покидал машину через третью сторону,
// которую никто не выбирал. Ни один файл в репозитории этого не говорил.
//
// ЧТО ПРОВЕРЯЕТСЯ (всё — на настоящем ядре с настоящей сетью):
//   1. Какие провайдеры ЗАРЕГИСТРИРОВАНЫ после загрузки плагинов. Считать
//      папки в `plugins/web/` нельзя: на 0.21.0 их девять, а регистрируется
//      восемь — `tavily/` осталась пустым каталогом от прежнего пина.
//   2. Какой провайдер выбран для нашего профиля. Должен быть `ddgs`
//      (решение владельца 2026-09-05), а не бесключевой ярус.
//   3. Живой запрос возвращает результаты.
//   4. Ненастроенный провайдер отвечает ВНЯТНОЙ строкой, а не молчит и не
//      уходит тихо на запасной путь. Молчаливый отказ здесь — дефект.
//
// Прогонять при каждом подъёме пина: провайдеры у донора появляются и исчезают
// (tavily уже исчез), а лестница автоопределения меняется без объявления.
//
// Usage: node runtime/web-search-probe.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { PYTHON_BIN, HERMES_SRC_DIR, HERMES_HOME_DIR } from './hermes-env.mjs'

/** Запрос нарочно из предметной области продукта: русский, про нормы. Ответ на
 * нём показывает не только «сеть жива», но и что провайдер годится для того,
 * ради чего он взят. */
const QUERY = 'СП 20.13330 нагрузки и воздействия'

const PY = `
import json, os, sys
from hermes_cli.plugins import discover_plugins
discover_plugins()
from tools import web_tools

out = {}
out["registered"] = sorted(getattr(p, "name", str(p)) for p in web_tools._list_registered_web_providers())
out["backend"] = web_tools._get_backend()

answer = json.loads(web_tools.web_search_tool(query=os.environ["PROBE_QUERY"], limit=3))
out["ok"] = bool(answer.get("success"))
out["results"] = len((answer.get("data") or {}).get("web") or [])
out["first"] = ((answer.get("data") or {}).get("web") or [{}])[0].get("url", "")

# Ненастроенный провайдер: второй дом с одним ключом в конфиге.
os.environ["HERMES_HOME"] = os.environ["PROBE_BROKEN_HOME"]
for mod in [m for m in list(sys.modules) if m.startswith(("tools.", "hermes_cli.config"))]:
    del sys.modules[mod]
from tools import web_tools as broken
out["broken_backend"] = broken._get_backend()
refusal = json.loads(broken.web_search_tool(query="test", limit=1))
out["broken_ok"] = bool(refusal.get("success"))
out["broken_error"] = refusal.get("error", "")

print("PROBE_JSON " + json.dumps(out, ensure_ascii=False))
`

const brokenHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-web-probe-'))
fs.writeFileSync(path.join(brokenHome, 'config.yaml'), 'web:\n  backend: no-such-provider\n', 'utf-8')

let raw
try {
  raw = execFileSync(PYTHON_BIN, ['-c', PY], {
    cwd: HERMES_SRC_DIR,
    encoding: 'utf-8',
    env: {
      ...process.env,
      HERMES_HOME: HERMES_HOME_DIR,
      PROBE_QUERY: QUERY,
      PROBE_BROKEN_HOME: brokenHome
    }
  })
} finally {
  fs.rmSync(brokenHome, { recursive: true, force: true })
}

const line = raw.split(/\r?\n/).find((one) => one.startsWith('PROBE_JSON '))
if (!line) {
  console.error(raw)
  throw new Error('проба не вернула результат')
}
const probe = JSON.parse(line.slice('PROBE_JSON '.length))

const problems = []
if (probe.backend !== 'ddgs') problems.push(`провайдер по умолчанию не ddgs, а «${probe.backend}»`)
if (!probe.ok || probe.results === 0) problems.push('живой запрос не вернул результатов')
if (probe.broken_ok) problems.push('ненастроенный провайдер ответил успехом — отказа нет')
if (!probe.broken_error) problems.push('ненастроенный провайдер промолчал: отказ без объяснения')

console.log(`== провайдеры зарегистрированы (${probe.registered.length}): ${probe.registered.join(', ')}`)
console.log(`== выбран: ${probe.backend}`)
console.log(`== живой запрос «${QUERY}»: результатов ${probe.results}, первый — ${probe.first}`)
console.log(`== ненастроенный провайдер («${probe.broken_backend}»): success=${probe.broken_ok}`)
console.log(`   ${probe.broken_error}`)

if (problems.length > 0) {
  console.log('\n== ПРОБЛЕМЫ')
  for (const one of problems) console.log(`  ${one}`)
}
process.exitCode = problems.length > 0 ? 1 : 0
