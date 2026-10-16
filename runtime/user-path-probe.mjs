// Сторож User PATH: старт ядра не трогает PATH человека (задача T20.9).
//
// ЧТО ЗАМЕРЯЕТСЯ. С 0.22 при первом старте на новой ревизии ядро прогоняет шаги
// обслуживания дома (`hermes_cli/boot_bootstrap.py` → `post_update.BOOT_HOME_STEPS`),
// и один из них — `expose_cli`: на Windows он кладёт команды в `<корень>\bin` и
// ПРОПИСЫВАЕТ этот каталог в User PATH (`_launchers.py::_expose_windows_user_bin`),
// настройку `cli.expose_on_path` на Windows не спрашивая. У нас шаг падает раньше
// записи — нет управляемого интерпретатора их `hermes pm` (замер T20.4), — но это
// побочное обстоятельство, а не наша защита. Проба держит его на виду: при
// следующем подъёме шаг может начать удаваться.
//
// КАК. Свежий временный профиль (иначе шаг не запустится: запись «уже сделано»
// лежит в `<дом>/installs/<ключ>/bootstrap/default.json`), тот же старт, что у
// приложения (`serve.mjs smoke`), снимок User PATH из реестра до и после, итог
// шага `expose_cli` из записи ядра.
//
// Usage: node runtime/user-path-probe.mjs

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

function userPath() {
  const run = spawnSync('reg', ['query', 'HKCU\\Environment', '/v', 'Path'], { encoding: 'utf-8' })
  if (run.status !== 0) return ''
  const line = run.stdout.split(/\r?\n/).find((l) => /^\s*Path\s+REG_/i.test(l))
  return line ? line.replace(/^\s*Path\s+REG_\w+\s+/i, '').trim() : ''
}

function bootstrapRecords(home) {
  const installs = path.join(home, 'installs')
  if (!fs.existsSync(installs)) return []
  return fs
    .readdirSync(installs)
    .map((key) => path.join(installs, key, 'bootstrap', 'default.json'))
    .filter((file) => fs.existsSync(file))
    .map((file) => JSON.parse(fs.readFileSync(file, 'utf-8')))
}

if (process.platform !== 'win32') {
  console.log('проба только для Windows: на других ОС `expose_cli` PATH не правит')
  process.exit(0)
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-user-path-'))
const before = userPath()

const smoke = spawnSync(process.execPath, [path.join(HERE, 'serve.mjs'), 'smoke'], {
  env: { ...process.env, AEC_HERMES_HOME: home },
  encoding: 'utf-8',
  timeout: 240000
})
const after = userPath()
const records = bootstrapRecords(home)
const expose = records.map((r) => r?.results?.expose_cli ?? r?.expose_cli).find(Boolean)

console.log('== старт ядра на свежем профиле ==')
console.log(`профиль: ${home}`)
console.log(`serve smoke: код ${smoke.status}`)
console.log(`записей шагов первого запуска: ${records.length}`)
console.log(`итог expose_cli: ${expose ? JSON.stringify(expose) : 'не найден'}`)
console.log('')
console.log('== User PATH ==')
console.log(`не изменился: ${before === after}`)
if (before !== after) {
  const was = new Set(before.split(';'))
  console.log(`добавлено: ${after.split(';').filter((p) => !was.has(p)).join('; ')}`)
}

fs.rmSync(home, { recursive: true, force: true })

const ok = smoke.status === 0 && before === after && records.length > 0
if (smoke.status !== 0) console.error(smoke.stderr || smoke.stdout)
if (records.length === 0) console.error('шаги первого запуска не записаны — проба ничего не проверила')
process.exitCode = ok ? 0 : 1
