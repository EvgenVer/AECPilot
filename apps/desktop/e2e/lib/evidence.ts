// Свидетельства прогона (задача 3F.1): одна запись на позицию чек-листа —
// вердикт, снимок окна, при ходах модели — стенограмма. Складываются в
// `test-results/acceptance/` (вне репозитория); отчёт `report.mjs` (3F.11)
// собирает из них таблицу для владельца. Номер позиции берётся из ИМЕНИ теста:
// `38.3.4 ответили минимум двое` → `38.3.4`, так чек-лист и отчёт сходятся по
// строке без второго реестра.

import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page, TestInfo } from '@playwright/test'

const desktopDir = join(__dirname, '..', '..')
export const evidenceDir = join(desktopDir, 'test-results', 'acceptance')
export const shotsDir = join(evidenceDir, 'shots')
export const evidencePath = join(evidenceDir, 'evidence.jsonl')

export type Verdict = 'pass' | 'fail' | 'note'

export interface EvidenceEntry {
  /** Номер позиции чек-листа: `<блок>.<подраздел>.<порядковый ✓>` или `<блок>.<✓>`. */
  position: string
  title: string
  verdict: Verdict
  spec: string
  at: string
  note?: string
  /** Имя файла снимка в `shots/`. */
  shot?: string
  /** Стенограмма хода: реплики агента и вызовы инструментов. */
  transcript?: string
}

/** Номер позиции из имени теста; пусто, если имя не начинается с номера. */
export function positionOf(title: string): string {
  const match = title.match(/^(\d+(?:\.\d+)*)\b/)
  return match ? match[1] : ''
}

const shotCounters = new Map<string, number>()

/** Уникальное имя снимка для позиции: `38.3.4.png`, второй — `38.3.4-2.png`. */
export function nextShotName(position: string): string {
  const count = (shotCounters.get(position) ?? 0) + 1
  shotCounters.set(position, count)
  return count === 1 ? `${position || 'x'}.png` : `${position || 'x'}-${count}.png`
}

/** Снять окно в `shots/` и вернуть имя файла; при отказе — пусто (снимок не
 *  цель проверки, падать из-за него нельзя). */
export async function shoot(page: Page | undefined, position: string): Promise<string> {
  if (!page || page.isClosed()) return ''
  mkdirSync(shotsDir, { recursive: true })
  const name = nextShotName(position)
  try {
    await page.screenshot({ path: join(shotsDir, name), timeout: 10000 })
    return name
  } catch {
    return ''
  }
}

export function appendEvidence(entry: EvidenceEntry): void {
  mkdirSync(evidenceDir, { recursive: true })
  appendFileSync(evidencePath, JSON.stringify(entry) + '\n', 'utf-8')
}

/** Записать свидетельство по позиции из имени теста — обычно из `afterEach`
 *  стенда (каждый тест) или из тела теста, когда позиций в одном тесте
 *  несколько либо нужна стенограмма. */
export async function record(
  testInfo: TestInfo,
  page: Page | undefined,
  extra: Partial<Pick<EvidenceEntry, 'position' | 'verdict' | 'note' | 'transcript'>> = {}
): Promise<void> {
  const position = extra.position ?? positionOf(testInfo.title)
  // Из тела теста статус ещё не выставлен — значит проверки до этой строки
  // прошли; из `afterEach` — статус известен.
  const finished = testInfo.status !== undefined
  // Ожидаемо красный тест (`test.fail()`, известный дефект) для Playwright
  // «прошёл» — ожидание совпало. Для владельца это всё равно красная позиция:
  // писать `pass` значило бы спрятать дефект в отчёте (замер 18.09.2026, 1.3.1).
  const knownDefect = testInfo.expectedStatus === 'failed'
  const verdict: Verdict =
    extra.verdict ??
    (knownDefect || (finished && testInfo.status !== testInfo.expectedStatus) ? 'fail' : 'pass')
  const note =
    extra.note ??
    (knownDefect
      ? `ожидаемое падение: ${
          testInfo.annotations.find((annotation) => annotation.type === 'fail')?.description ??
          'известный дефект'
        }`
      : undefined)
  const shot = await shoot(page, position)
  appendEvidence({
    position,
    title: testInfo.title,
    verdict,
    spec: testInfo.file.replace(/\\/g, '/').split('/e2e/').pop() ?? testInfo.file,
    at: new Date().toISOString(),
    ...(note ? { note } : {}),
    ...(shot ? { shot } : {}),
    ...(extra.transcript ? { transcript: extra.transcript } : {})
  })
}
