// Масштаб интерфейса — решения без Electron (задача 3.26, SPEC HX14).
//
// ЗАЧЕМ ЗУМ ВООБЩЕ. По HX14 оформление окна сверх темы ОС и зума исключено, а
// зум — входит: «инженер смотрит чертежи часами», и это доступность, а не
// украшение.
//
// ПОЧЕМУ ГЛАВНЫЙ ПРОЦЕСС. Масштаб живёт на `webContents`, а не в CSS: он должен
// одинаково действовать на ленту, просмотрщик и любое второе окно, переживать
// перезапуск и слушаться Ctrl +/-/0. Окно им и владеет; рендерер только
// показывает текущий процент (их `store/zoom.ts`).
//
// ШКАЛА — ИХ, ЧТОБЫ ИХ ЖЕ ЭКРАН НАСТРОЕК НЕ ВРАЛ. У Electron масштаб задаётся
// «уровнем»: `factor = 1.2 ** level`. Их пресеты — 90/100/110/125/150/175
// процентов, и `store/zoom.ts` показывает 90 до того, как ответит главный
// процесс, поэтому 90 и есть умолчание: другое значение дало бы моргание цифры
// на экране настроек при каждом открытии.

/** Их набор пресетов (`UI_SCALE_PRESETS`, appearance-settings.tsx). */
export const ZOOM_PRESETS = [90, 100, 110, 125, 150, 175] as const

/** Их значение по умолчанию — см. шапку. */
export const ZOOM_DEFAULT_PERCENT = 90

/** Границы шире пресетов: Ctrl +/- ходит шагами и должен куда-то приходить. */
export const ZOOM_MIN_PERCENT = 50
export const ZOOM_MAX_PERCENT = 200

const STEP = 1.2

/** Процент → уровень Electron. */
export function levelForPercent(percent: number): number {
  return Math.log(clampPercent(percent) / 100) / Math.log(STEP)
}

/** Уровень Electron → процент, округлённый до целого. */
export function percentForLevel(level: number): number {
  return Math.round(STEP ** level * 100)
}

export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return ZOOM_DEFAULT_PERCENT
  return Math.min(Math.max(Math.round(percent), ZOOM_MIN_PERCENT), ZOOM_MAX_PERCENT)
}

/** Следующий процент на шаг вверх или вниз. По пресетам, а не умножением: шаг
 * должен попадать в те же значения, что предлагает экран настроек, иначе
 * Ctrl+«плюс» уводит в 108%, которых в списке нет. За краями списка — границы. */
export function steppedPercent(current: number, direction: 'in' | 'out'): number {
  const presets = [ZOOM_MIN_PERCENT, ...ZOOM_PRESETS, ZOOM_MAX_PERCENT]
  const now = clampPercent(current)

  if (direction === 'in') {
    return presets.find((preset) => preset > now) ?? ZOOM_MAX_PERCENT
  }

  return [...presets].reverse().find((preset) => preset < now) ?? ZOOM_MIN_PERCENT
}

/** Разбор сохранённого файла. Испорченный файл — это возврат к умолчанию, а не
 * падение окна на старте. */
export function parseZoomJson(raw: string): number {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return ZOOM_DEFAULT_PERCENT
    const percent = (parsed as { percent?: unknown }).percent
    return typeof percent === 'number' ? clampPercent(percent) : ZOOM_DEFAULT_PERCENT
  } catch {
    return ZOOM_DEFAULT_PERCENT
  }
}

export function serializeZoom(percent: number): string {
  return `${JSON.stringify({ percent: clampPercent(percent) }, null, 2)}\n`
}
