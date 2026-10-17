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

import { HERMES_HOME_DIR, HERMES_SRC_DIR, PYTHON_ARGS, PYTHON_BIN } from './hermes-env.mjs'

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

# ── ЧТЕНИЕ СТРАНИЦЫ (задача 3E.18) ────────────────────────────────────────
# Меряется на СВОЁМ доме, вернув переменную назад: выше её подменили сломанным.
import asyncio

os.environ["HERMES_HOME"] = os.environ["PROBE_HOME"]
for mod in [m for m in list(sys.modules) if m.startswith(("tools.", "hermes_cli.config"))]:
    del sys.modules[mod]
from tools import web_tools as ours

out["extract_backend"] = ours._get_extract_backend()
extract = json.loads(asyncio.run(ours.web_extract_tool(urls=["https://example.com"])))
out["extract_ok"] = bool(extract.get("success"))
out["extract_error"] = extract.get("error", "") or extract.get("message", "")

# СТРОГИЙ ВЫБОР: назначенный провайдер возвращается как есть, без пробы
# доступности. Живого вызова здесь нет намеренно — проверяется ВЫБОР.
os.environ["HERMES_HOME"] = os.environ["PROBE_PICKED_HOME"]
for mod in [m for m in list(sys.modules) if m.startswith(("tools.", "hermes_cli.config"))]:
    del sys.modules[mod]
from tools import web_tools as picked
out["picked_extract_backend"] = picked._get_extract_backend()

# БЕСКЛЮЧЕВОЙ ЯРУС — ПОСЛЕДНИЙ И ОТКЛЮЧАЕМЫЙ. Дом без выбора: что выберет
# лестница. Потом тот же дом с keyless_fallback: false. Только выбор, без
# вызова: живой запрос отсюда ушёл бы на публичную точку третьей стороны.
os.environ["HERMES_HOME"] = os.environ["PROBE_EMPTY_HOME"]
for mod in [m for m in list(sys.modules) if m.startswith(("tools.", "hermes_cli.config"))]:
    del sys.modules[mod]
from tools import web_tools as empty
out["ladder_backend"] = empty._get_extract_backend()

os.environ["HERMES_HOME"] = os.environ["PROBE_NOKEYLESS_HOME"]
for mod in [m for m in list(sys.modules) if m.startswith(("tools.", "hermes_cli.config"))]:
    del sys.modules[mod]
from tools import web_tools as nokeyless
out["nokeyless_backend"] = nokeyless._get_extract_backend()

print("PROBE_JSON " + json.dumps(out, ensure_ascii=False))
`

/** Временный дом ядра с заданным `config.yaml`. */
function homeWith(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-web-probe-'))
  fs.writeFileSync(path.join(dir, 'config.yaml'), config, 'utf-8')
  return dir
}

const brokenHome = homeWith('web:\n  backend: no-such-provider\n')
// Задача 3E.18: провайдер НАЗНАЧЕН человеком и без ключа. Их правило — «strict
// selection, no availability probe»: выбор возвращается как есть, а не
// подменяется тем, что нашлось.
const pickedHome = homeWith('web:\n  extract_backend: firecrawl\n')
// Ничего не выбрано: работает лестница учётных данных.
const emptyHome = homeWith('web: {}\n')
// То же, но бесключевой ярус отключён — он обязан быть отключаемым.
const noKeylessHome = homeWith('web:\n  keyless_fallback: false\n')

let raw
try {
  raw = execFileSync(PYTHON_BIN, [...PYTHON_ARGS, '-c', PY], {
    cwd: HERMES_SRC_DIR,
    encoding: 'utf-8',
    env: {
      ...process.env,
      HERMES_HOME: HERMES_HOME_DIR,
      PROBE_QUERY: QUERY,
      PROBE_BROKEN_HOME: brokenHome,
      PROBE_HOME: HERMES_HOME_DIR,
      PROBE_PICKED_HOME: pickedHome,
      PROBE_EMPTY_HOME: emptyHome,
      PROBE_NOKEYLESS_HOME: noKeylessHome
    }
  })
} finally {
  for (const dir of [brokenHome, pickedHome, emptyHome, noKeylessHome]) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
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

// ── Чтение страницы (задача 3E.18, решение владельца 2026-09-08) ──────────
// Мы НЕ назначаем провайдера извлечения: его выбирает человек в их же панели
// наборов (`donor/app/settings/toolset-config-panel.tsx`, экран «Навыки»).
// Проверяется не «работает ли чтение», а что состояние ЧЕСТНОЕ: пока выбора
// нет, инструмент отказывает словами, а не уходит тихо на публичную точку
// третьей стороны — тот самый дефект, из-за которого 3E.2 записала выбор поиска.
if (probe.extract_ok) {
  problems.push('чтение страницы ответило успехом без выбранного провайдера — куда ушёл запрос?')
}
if (!probe.extract_error) problems.push('чтение страницы промолчало: отказ без объяснения')
if (probe.picked_extract_backend !== 'firecrawl') {
  problems.push(
    `назначенный провайдер извлечения подменён на «${probe.picked_extract_backend}» — ` +
      'сломанный выбор обязан отвечать своей ошибкой, а не тихо уезжать на другой'
  )
}
// БЕСКЛЮЧЕВОЙ РЕТРАНСЛЯТОР — вот чего здесь быть не должно. Проверяется не
// «отключился ли ярус», а куда приводит лестница: адреса страниц человека не
// должны уходить через чужую публичную точку, которую никто не выбирал
// (`plugins/web/keyless_mcp.py`). ЗАМЕРЕНО 2026-09-08: на машине с нашим `ddgs`
// лестница останавливается на нём — он ставится пакетом и ключа не требует, то
// есть до бесключевого яруса дело не доходит вовсе. Поэтому оба ответа ниже
// одинаковы, и это не «ярус не отключился», а «ярус недостижим».
const KEYLESS_RELAYS = ['exa', 'parallel']
if (KEYLESS_RELAYS.includes(probe.ladder_backend)) {
  problems.push(
    `без выбора лестница привела на бесключевой ретранслятор «${probe.ladder_backend}»: ` +
      'адреса страниц человека уходили бы через третью сторону'
  )
}
if (KEYLESS_RELAYS.includes(probe.nokeyless_backend)) {
  problems.push(
    `с keyless_fallback: false выбор всё равно бесключевой — «${probe.nokeyless_backend}»`
  )
}

console.log(`== извлечение на нашем профиле: «${probe.extract_backend}», success=${probe.extract_ok}`)
console.log(`   ${probe.extract_error}`)
console.log(`== назначенный человеком провайдер извлечения: «${probe.picked_extract_backend}»`)
console.log(`== лестница без выбора: «${probe.ladder_backend}»`)
console.log(`== она же с keyless_fallback: false: «${probe.nokeyless_backend}»`)

if (problems.length > 0) {
  console.log('\n== ПРОБЛЕМЫ')
  for (const one of problems) console.log(`  ${one}`)
}
process.exitCode = problems.length > 0 ? 1 : 0
