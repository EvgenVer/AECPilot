// Плавающая лента: где она стоит и куда её можно двигать (задача 3.24).
//
// ЧТО ЭТО ЗА ОКНО. HUD — узкая полоса поверх других окон: лента и композер, без
// дерева панелей. Человек работает в чужой программе, а разговор держит перед
// глазами. Отсюда три её свойства и три здешних правила.
//
// 1. ОНА ВСЕГДА СВЕРХУ — значит обязана быть маленькой и стоять с краю, а не
//    посреди экрана. Умолчание считается от рабочей области дисплея, а не от
//    его размера: панель задач — часть экрана, но не место для окна.
// 2. ЕЁ ТАСКАЮТ ЗА КОМПОЗЕР — значит каждый сдвиг проверяется на границы. Окно,
//    уехавшее за край, не возвращается: у него нет заголовка, за который можно
//    поймать.
// 3. РАЗМЕР ЗАДАЁТ РЕНДЕРЕР по высоте содержимого — значит и он прижимается к
//    краям, иначе лента с длинным ответом вырастет за пределы экрана.

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Рабочая область дисплея — то, что Electron отдаёт как `workArea`. */
export type WorkArea = Bounds

export const HUD_MIN_WIDTH = 320
export const HUD_MIN_HEIGHT = 120
export const HUD_DEFAULT_WIDTH = 760
export const HUD_DEFAULT_HEIGHT = 260

/** Отступ от края при первом появлении: окно вплотную к границе выглядит
 * обрезанным и мешает попасть в край мышью. */
const MARGIN = 24

function round(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0)
}

/** Где HUD появляется в первый раз: по центру по горизонтали, внизу рабочей
 * области — там, где обычно нет содержимого чужого окна. */
export function defaultHudBounds(work: WorkArea): Bounds {
  const width = Math.min(HUD_DEFAULT_WIDTH, Math.max(HUD_MIN_WIDTH, work.width - MARGIN * 2))
  const height = Math.min(HUD_DEFAULT_HEIGHT, Math.max(HUD_MIN_HEIGHT, work.height - MARGIN * 2))

  return {
    width: round(width),
    height: round(height),
    x: round(work.x + (work.width - width) / 2),
    y: round(work.y + work.height - height - MARGIN)
  }
}

/** Прижимает окно к рабочей области. Размер сначала (иначе окно шире экрана
 * прижать некуда), потом положение. */
export function clampBounds(bounds: Bounds, work: WorkArea): Bounds {
  const width = Math.min(Math.max(round(bounds.width), HUD_MIN_WIDTH), work.width)
  const height = Math.min(Math.max(round(bounds.height), HUD_MIN_HEIGHT), work.height)

  return {
    width,
    height,
    x: Math.min(Math.max(round(bounds.x), work.x), work.x + work.width - width),
    y: Math.min(Math.max(round(bounds.y), work.y), work.y + work.height - height)
  }
}

/** Точка экрана — курсор или угол окна. */
export interface Point {
  x: number
  y: number
}

/** Где курсор относительно угла окна в момент захвата (D-100, задача 3F.7).
 *
 * ПОЧЕМУ НЕ СДВИГ. Их окно тянут за композер, и рендерер во время перетаскивания
 * НЕ присылает, куда сдвинуться: пока окно успевает за курсором, `clientX` у
 * него каждый кадр один и тот же — сдвиг всегда ноль. Присылает он только
 * размер, снятый в момент нажатия. Значит положение считает главный процесс: он
 * один видит настоящий курсор. Разница «курсор минус угол», снятая один раз,
 * держит окно ровно под той точкой, за которую его взяли, — в том числе на
 * втором мониторе с другим масштабом, потому что и курсор, и границы окна
 * Electron меряет в одних единицах (DIP). */
export function hudGrabOffset(cursor: Point, origin: Point): Point {
  return { x: round(cursor.x - origin.x), y: round(cursor.y - origin.y) }
}

/** Куда поставить окно, чтобы точка захвата осталась под курсором. */
export function hudDragOrigin(cursor: Point, offset: Point | null): Point | null {
  if (!offset) return null
  return { x: round(cursor.x - offset.x), y: round(cursor.y - offset.y) }
}

/** Проверка запроса на точные границы: значения приходят из окна, и объект без
 * чисел не должен превращаться в окно нулевого размера. */
export function readBounds(raw: unknown): Bounds | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>

  const numbers = ['x', 'y', 'width', 'height'].map((key) =>
    typeof value[key] === 'number' && Number.isFinite(value[key]) ? (value[key] as number) : null
  )

  if (numbers.some((n) => n === null)) return null

  const [x, y, width, height] = numbers as number[]
  return { x, y, width, height }
}
