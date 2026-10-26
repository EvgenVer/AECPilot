// Отчёт прогона приёмки для владельца (задача 3F.11, SPEC AC15).
//
// Собирает `docs/acceptance/<дата>/report.md` из того, что оставил прогон:
//   - `test-results/acceptance/evidence.jsonl` — по записи на позицию (evidence.ts);
//   - `test-results/acceptance/usage.jsonl` — расход токенов по ходам модели (turn.ts);
//   - `test-results/acceptance/results.json` — JSON-репортер Playwright (время прогона);
//   - `docs/manual-checklist.md` — метки позиций и шаги остатка `[человек]`.
// Снимки копируются в `docs/acceptance/<дата>/shots/` — в git они не идут.
//
// Playwright чистит `test-results/` при каждом запуске, поэтому отчёт отражает
// ПОСЛЕДНИЙ запуск: собирать его надо после одного общего прогона, а не после
// нескольких по файлам.
//
// Usage: node e2e/lib/report.mjs [--date YYYY-MM-DD]

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  CHECKLIST,
  parseChecklist,
  testedPositions
} from '../../../../runtime/checklist-coverage.mjs'

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ROOT = path.resolve(DESKTOP, '..', '..')
const EVIDENCE_DIR = path.join(DESKTOP, 'test-results', 'acceptance')

/** Тяжесть вердикта: у позиции с несколькими записями побеждает худшая. */
const WEIGHT = { pass: 0, note: 1, fail: 2 }
const VERDICT_LABEL = { pass: '✅ пройдена', note: '🟡 владельцу', fail: '❌ красная' }

/** Строки JSONL; битая строка пропускается, а не роняет отчёт. */
export function readJsonl(file) {
  if (!fs.existsSync(file)) return []
  const rows = []
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      // Недописанная последняя строка прерванного прогона — не повод терять остальное.
    }
  }
  return rows
}

/** Свести записи по позиции: худший вердикт, все снимки, все заметки и
 *  стенограммы без повторов. Одна позиция пишется дважды — из тела теста
 *  (со стенограммой) и из `afterEach` (со статусом). */
export function mergeEvidence(entries) {
  const byPosition = new Map()
  for (const entry of entries) {
    if (!entry.position) continue
    const merged = byPosition.get(entry.position) ?? {
      position: entry.position,
      verdict: 'pass',
      titles: [],
      specs: [],
      notes: [],
      shots: [],
      transcripts: []
    }
    if (WEIGHT[entry.verdict] > WEIGHT[merged.verdict]) merged.verdict = entry.verdict
    const add = (list, value) => {
      if (value && !list.includes(value)) list.push(value)
    }
    add(merged.titles, entry.title)
    add(merged.specs, entry.spec)
    add(merged.notes, entry.note)
    add(merged.shots, entry.shot)
    add(merged.transcripts, entry.transcript)
    byPosition.set(entry.position, merged)
  }
  return byPosition
}

/** Сумма числовых полей `usage` по всем ходам: имена полей у провайдеров
 *  разные, поэтому складывается всё, что число. */
export function sumUsage(rows) {
  const total = {}
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.usage ?? {})) {
      if (typeof value === 'number') total[key] = (total[key] ?? 0) + value
    }
  }
  return { turns: rows.length, total }
}

/** Текст шага чек-листа, к которому относится позиция: строка «N. …» выше
 *  отметки «✓» и её продолжение до первой пустой строки или отметки. */
export function stepText(lines, positionLine) {
  for (let index = positionLine - 2; index >= 0; index--) {
    const line = lines[index]
    if (/^## /.test(line)) return ''
    if (/^\s{0,4}\d+\.\s/.test(line)) {
      const parts = [line.trim()]
      for (let next = index + 1; next < lines.length; next++) {
        const more = lines[next]
        if (!more.trim() || /^\s*[✓✗]/.test(more)) break
        parts.push(more.trim())
      }
      return parts.join(' ')
    }
  }
  return ''
}

/** Номера позиций, у которых в спеках стоит `test.fixme`: такие не прогоняются,
 *  и в отчёте это надо назвать, а не показать пропуском без причины. */
export function fixmePositions(specDir) {
  const found = new Set()
  if (!fs.existsSync(specDir)) return found
  for (const name of fs.readdirSync(specDir)) {
    if (!name.endsWith('.spec.ts')) continue
    const body = fs.readFileSync(path.join(specDir, name), 'utf8')
    for (const match of body.matchAll(/^\s*test\.fixme\(\s*(['"`])(\d+(?:\.\d+)*)\b/gm))
      found.add(match[2])
  }
  return found
}

function escapeCell(text) {
  return String(text ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function pinnedCore() {
  const file = path.join(ROOT, 'runtime', 'hermes-env.mjs')
  if (!fs.existsSync(file)) return ''
  const match = fs.readFileSync(file, 'utf8').match(/HERMES_VERSION\s*=\s*['"]([^'"]+)['"]/)
  return match ? match[1] : ''
}

/** Собрать текст отчёта. Чистая часть — без файловой системы, ради теста. */
/** Ограда блока кода для стенограммы: длиннее самой длинной серии обратных кавычек
 *  в тексте, иначе блок кода из ответа агента закрывает её раньше времени. */
export function fenceFor(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  return '`'.repeat(Math.max(3, longest + 1))
}

export function buildReport({ date, positions, merged, tested, fixme, usage, run, lines, build }) {
  const out = []
  const byLabel = new Map()
  for (const position of positions) {
    const label = position.label || '—'
    const row = byLabel.get(label) ?? { total: 0, pass: 0, note: 0, fail: 0, notRun: 0, fixme: 0 }
    row.total += 1
    const evidence = merged.get(position.id)
    if (evidence) row[evidence.verdict] += 1
    else if (fixme.has(position.id)) row.fixme += 1
    else if (tested.has(position.id)) row.notRun += 1
    byLabel.set(label, row)
  }

  out.push(`# Отчёт приёмки ${date}`, '')
  out.push(`Сборка: \`${build.commit || '—'}\`, ядро: \`${build.core || '—'}\`.`)
  if (run)
    out.push(
      `Прогон: ${run.startTime ?? '—'}, длительность ${Math.round((run.duration ?? 0) / 60000)} мин.`
    )
  out.push(
    '',
    'Вердикты: ✅ пройдена · ❌ красная · 🟡 владельцу (позиция качества или пропуск с причиной) · ⏸ fixme (ждёт решения) · ⬜ не прогнана.',
    ''
  )

  out.push('## Итоги по меткам', '')
  out.push(
    '| Метка | Позиций | ✅ | ❌ | 🟡 | ⏸ fixme | ⬜ не прогнано |',
    '|---|---|---|---|---|---|---|'
  )
  for (const [label, row] of byLabel) {
    out.push(
      `| ${label} | ${row.total} | ${row.pass} | ${row.fail} | ${row.note} | ${row.fixme} | ${row.notRun} |`
    )
  }
  out.push('')
  const totals = Object.entries(usage.total)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')
  out.push(`Ходов модели: ${usage.turns}${totals ? `; токены — ${totals}` : ''}.`, '')

  const section = (title, filter) => {
    const rows = positions.filter(filter)
    out.push(`## ${title} (${rows.length})`, '')
    if (!rows.length) {
      out.push('Нет.', '')
      return
    }
    out.push(
      '| Позиция | Метка | Вердикт | Что проверено | Заметка | Снимок |',
      '|---|---|---|---|---|---|'
    )
    for (const position of rows) {
      const evidence = merged.get(position.id)
      const verdict = evidence
        ? VERDICT_LABEL[evidence.verdict]
        : fixme.has(position.id)
          ? '⏸ fixme'
          : tested.has(position.id)
            ? '⬜ не прогнана'
            : '—'
      const shot = evidence?.shots.length
        ? evidence.shots.map((name) => `[${name}](shots/${name})`).join(' ')
        : ''
      const transcript = evidence?.transcripts.length
        ? ` · [стенограмма](#t-${position.id.replace(/\./g, '-')})`
        : ''
      out.push(
        `| ${position.id} | ${position.label || '—'} | ${verdict} | ${escapeCell(position.text)} | ${escapeCell(evidence?.notes.join('; ') ?? '')} | ${shot}${transcript} |`
      )
    }
    out.push('')
  }

  // R21 и R22 — доказательство, а не декларация (3E.15): строки 48.3 и 45.2.
  section('R21 / R22 — доказательства (48.3, 45.2)', (position) =>
    /^(48\.3|45\.2)\./.test(position.id)
  )
  section('Красные позиции', (position) => merged.get(position.id)?.verdict === 'fail')
  section(
    'Владельцу — позиции качества и пропуски',
    (position) => merged.get(position.id)?.verdict === 'note'
  )
  section(
    'Не прогнаны или ждут решения',
    (position) => ['[e2e]', '[live]'].includes(position.label) && !merged.has(position.id)
  )
  section('Все позиции с тестом', (position) => merged.has(position.id))

  out.push('## Остаток владельцу — `[человек]`', '')
  let lastStep = ''
  for (const position of positions.filter((candidate) => candidate.label === '[человек]')) {
    const step = stepText(lines, position.line)
    const key = `${position.block}.${position.step}`
    if (key !== lastStep) {
      out.push('', `**Блок ${position.block}, шаг ${position.step}.** ${step}`)
      lastStep = key
    }
    out.push(`- [ ] ${position.id} — ${position.text}`)
  }
  out.push('')

  const withTranscripts = positions.filter(
    (position) => merged.get(position.id)?.transcripts.length
  )
  if (withTranscripts.length) {
    out.push('## Стенограммы', '')
    for (const position of withTranscripts) {
      out.push(`<a id="t-${position.id.replace(/\./g, '-')}"></a>`, `### ${position.id}`, '')
      for (const transcript of merged.get(position.id).transcripts)
        out.push(`${fenceFor(transcript)}text`, transcript, fenceFor(transcript), '')
    }
  }
  return out.join('\n')
}

function main() {
  const argDate = process.argv.indexOf('--date')
  const date = argDate > 0 ? process.argv[argDate + 1] : new Date().toISOString().slice(0, 10)
  const text = fs.readFileSync(CHECKLIST, 'utf8')
  const lines = text.split(/\r?\n/)
  const positions = parseChecklist(text)
  const merged = mergeEvidence(readJsonl(path.join(EVIDENCE_DIR, 'evidence.jsonl')))
  const usage = sumUsage(readJsonl(path.join(EVIDENCE_DIR, 'usage.jsonl')))
  const resultsFile = path.join(EVIDENCE_DIR, 'results.json')
  const run = fs.existsSync(resultsFile)
    ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')).stats
    : null
  const specDir = path.join(DESKTOP, 'e2e', 'acceptance')
  const report = buildReport({
    date,
    positions,
    merged,
    tested: testedPositions(),
    fixme: fixmePositions(specDir),
    usage,
    run,
    lines,
    build: { commit: git(['rev-parse', '--short', 'HEAD']), core: pinnedCore() }
  })

  const target = path.join(ROOT, 'docs', 'acceptance', date)
  fs.mkdirSync(path.join(target, 'shots'), { recursive: true })
  const shotsFrom = path.join(EVIDENCE_DIR, 'shots')
  let copied = 0
  if (fs.existsSync(shotsFrom)) {
    for (const name of fs.readdirSync(shotsFrom)) {
      fs.copyFileSync(path.join(shotsFrom, name), path.join(target, 'shots', name))
      copied += 1
    }
  }
  fs.writeFileSync(path.join(target, 'report.md'), report, 'utf8')
  process.stdout
    .write(`Отчёт: ${path.relative(ROOT, path.join(target, 'report.md'))}; позиций со свидетельством: ${merged.size}; снимков: ${copied}
`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main()
