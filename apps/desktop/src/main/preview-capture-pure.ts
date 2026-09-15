// Задача 3.B4 (SPEC UR4, пакет 9.7 донора: аннотации на предпросмотре).
// Снимок гостя предпросмотра для их режима «обвести и спросить»: панель
// называет прямоугольник в CSS-пикселях своего окна, главный процесс отдаёт
// PNG как data-URL. Здесь — только геометрия, без electron: правила прибиты
// тестом, а не прочитаны в обработчике.
//
// ПОЧЕМУ НЕ `capturePage(rect)` НАПРЯМУЮ. У гостя `<webview>` прямоугольник в
// `capturePage` ненадёжен: на Windows отдаёт пустую картинку, при масштабе
// экрана сдвигает вырез. Поэтому снимается ВИДИМАЯ область целиком, а вырез
// делается в пространстве битмапа по масштабу «битмап / viewport» — так же,
// как у донора (`electron/preview-capture.ts`, тот же вывод из тех же
// падений).
//
// ОТКАЗ — ОШИБКОЙ, а не пустой картинкой: пустой PNG выглядел бы как удачный
// снимок ничего, и агент отвечал бы про него.

export interface CaptureRect {
  height: number
  width: number
  x: number
  y: number
}

export interface CaptureSize {
  height: number
  width: number
}

/** Ровно то, что нужно от `NativeImage`: обработчик подставляет настоящий. */
export interface CaptureImage {
  crop(rect: CaptureRect): CaptureImage
  getSize(): CaptureSize
  isEmpty(): boolean
  toPNG(): Buffer
}

/** Прямоугольник из окна: дроби к целым, отрицательное — к нулю, не меньше
 * одного пикселя. Мусор вместо прямоугольника — «без выреза». */
export function normalizeCaptureRect(raw: unknown): CaptureRect | undefined {
  const rect = raw as Partial<Record<keyof CaptureRect, unknown>> | null
  if (!rect || typeof rect !== 'object') return undefined

  const numbers = [rect.x, rect.y, rect.width, rect.height]
  if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return undefined
  }

  return {
    height: Math.max(1, Math.ceil(rect.height as number)),
    width: Math.max(1, Math.ceil(rect.width as number)),
    x: Math.max(0, Math.floor(rect.x as number)),
    y: Math.max(0, Math.floor(rect.y as number))
  }
}

/** Перенос CSS-прямоугольника viewport'а на битмап (возможно, крупнее в DPR
 * раз). `null` — вырез целиком за краем картинки. */
export function mapViewportRectToImage(
  rect: CaptureRect,
  viewport: CaptureSize,
  image: CaptureSize
): CaptureRect | null {
  const scaleX = image.width / Math.max(1, viewport.width)
  const scaleY = image.height / Math.max(1, viewport.height)
  const x = Math.max(0, Math.floor(rect.x * scaleX))
  const y = Math.max(0, Math.floor(rect.y * scaleY))
  const width = Math.min(image.width, Math.ceil((rect.x + rect.width) * scaleX)) - x
  const height = Math.min(image.height, Math.ceil((rect.y + rect.height) * scaleY)) - y

  if (width < 1 || height < 1) return null

  return { height, width, x, y }
}

function toDataUrl(image: CaptureImage): string {
  if (image.isEmpty()) throw new Error('Снимок предпросмотра пуст')

  return `data:image/png;base64,${image.toPNG().toString('base64')}`
}

/** Вырез из снимка видимой области. Без прямоугольника — снимок целиком;
 * вырез за краем или пустой — тоже целиком: видимая страница лучше, чем
 * неверный ломоть или отказ, когда человек уже обвёл (вывод донора из тех
 * же случаев — прокрутка, несовпадение DPI). */
export function cropCapture(image: CaptureImage, rect: unknown, viewport: unknown): string {
  const crop = normalizeCaptureRect(rect)
  if (!crop) return toDataUrl(image)

  const size = image.getSize()
  const view = viewport as Partial<CaptureSize> | null
  const viewSize: CaptureSize =
    view &&
    typeof view.width === 'number' &&
    typeof view.height === 'number' &&
    view.width > 0 &&
    view.height > 0
      ? { height: view.height, width: view.width }
      : size

  const mapped = mapViewportRectToImage(crop, viewSize, size)
  if (!mapped) return toDataUrl(image)

  const cropped = image.crop(mapped)
  return cropped.isEmpty() ? toDataUrl(image) : toDataUrl(cropped)
}
