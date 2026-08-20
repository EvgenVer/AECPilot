// Сохранение наружу — решения без Electron (задача 3.27).
//
// ЧТО УХОДИТ НАРУЖУ. Три вещи: картинка, которую человек видит в ленте или в
// скрепке; картинка из буфера обмена; файл, который сделал агент. Общее у них
// одно — КУДА писать, решает человек в нативном диалоге, и этот путь рендерер
// не называет никогда. Поэтому проверка пути здесь не про назначение, а про
// ИСТОЧНИК: адрес картинки в ленте пишет модель, и он не должен превращаться в
// право прочитать любой файл на диске.
//
// ГРАНИЦА ПО СХЕМЕ.
//   data:   — байты уже в окне; записать их на диск не открывает ничего нового.
//   путь    — файл; проходит ту же двухслойную проверку принадлежности проекту,
//             что и предпросмотр артефактов (`resolveArtifactPath` + `realpath`
//             у вызывающего), потому что это ровно та же строка от модели.
//   http(s) — ОТКАЗ. Это ссылка, а ссылки уходят в браузер через
//             `decideExternalLink`. Скачивание в главном процессе дало бы окну
//             сетевой канал в обход собственного CSP приложения — того самого,
//             который удалённые картинки в ленте и не показывает (замер: при
//             `default-src 'self'` и `<img src="https://…">` браузер отвечает
//             `error`, картинка не грузится).
//   прочее  — отказ с именем схемы, чтобы это читалось как отказ, а не как сбой.

import { cleanFilters } from './select-paths-pure'

/** Их форма запроса к нативному диалогу сохранения (`selectSavePath`,
 * `donor/global.d.ts`). */
export interface SaveDialogRequest {
  title?: unknown
  defaultPath?: unknown
  filters?: unknown
}

export interface SaveDialogPlan {
  title?: string
  /** Только ИМЯ файла, без папки — см. `planSaveDialog`. */
  defaultPath: string
  filters?: Array<{ name: string; extensions: string[] }>
}

export type SaveSource =
  | { kind: 'bytes'; base64: string; suggestedName: string }
  | { kind: 'path'; value: string; suggestedName: string }
  | { kind: 'refused'; error: string }

export const SAVE_REMOTE_REFUSED =
  'Эта картинка лежит в интернете. Откройте её ссылку в браузере и сохраните ' +
  'оттуда — приложение не скачивает файлы по сети вместо окна.'

/** Сколько символов имени файла показывать в диалоге. Не ограничение файловой
 * системы, а защита от строки на 4000 символов из ответа модели. */
const MAX_NAME_LENGTH = 120

const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/tiff': 'tiff',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico'
}

/** Расширение по типу содержимого. Неизвестный тип не превращается в `.png`:
 * подпись расширения должна соответствовать байтам, иначе двойной щелчок
 * откроет файл не тем, чем надо. */
export function extensionForMediaType(mediaType: string): string {
  const type = mediaType.trim().toLowerCase()
  const known = EXTENSION_BY_MEDIA_TYPE[type]
  if (known) return known

  const subtype = (type.split('/')[1] ?? '')
    .replace(/^x-/, '')
    .replace(/\+.*$/, '')
    .replace(/[^a-z0-9]/g, '')

  return subtype === '' ? 'bin' : subtype
}

/** Имя файла для подстановки в диалог. Приходит из рендерера, поэтому от него
 * остаётся ровно имя: последний сегмент пути (папку выбирает человек, а не
 * окно), без управляющих символов и без знаков, которые Windows в имени не
 * принимает. */
export function safeFileName(raw: unknown, fallback: string): string {
  const segments = (typeof raw === 'string' ? raw : '')
    .split(/[\\/]+/)
    .filter((part) => part !== '')

  const cleaned = (segments.pop() ?? '')
    // eslint-disable-next-line no-control-regex -- намеренно: управляющий символ в имени файла не бывает законным
    .replace(/[\x00-\x1f]/g, '')
    .replace(/[<>:"|?*]/g, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    // Точка и пробел в конце имени: Windows молча их отбрасывает, и файл
    // оказывается не там, где его назвали.
    .replace(/[. ]+$/, '')

  return cleaned === '' ? fallback : cleaned
}

const DATA_URL_RE = /^data:([^,;]*)((?:;[^,;]*)*),([\s\S]*)$/i

/** Разбирает `data:`-адрес. Только base64: текстовый (percent-encoded) вариант
 * картинкой не бывает, и принимать его значило бы писать на диск то, чем в
 * ленте показали что-то другое. */
export function readDataUrl(raw: string): { mediaType: string; base64: string } | null {
  const match = DATA_URL_RE.exec(raw)
  if (!match) return null
  if (!/;base64/i.test(match[2] ?? '')) return null

  const base64 = (match[3] ?? '').trim()
  if (base64 === '' || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) return null

  return { mediaType: (match[1] || 'application/octet-stream').toLowerCase(), base64 }
}

function decodedName(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Куда ведёт адрес картинки из ленты — см. «ГРАНИЦА ПО СХЕМЕ» в шапке. */
export function classifySaveSource(raw: unknown): SaveSource {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { kind: 'refused', error: 'Адрес картинки не указан.' }
  }

  const value = raw.trim()
  // eslint-disable-next-line no-control-regex -- намеренно: то же правило, что в resolveArtifactPath
  if (/[\x00-\x1f]/.test(value)) {
    return { kind: 'refused', error: 'Адрес содержит управляющие символы.' }
  }

  if (/^data:/i.test(value)) {
    const parsed = readDataUrl(value)
    if (!parsed) {
      return { kind: 'refused', error: 'Картинку не удалось прочитать: адрес data: испорчен.' }
    }
    return {
      kind: 'bytes',
      base64: parsed.base64,
      suggestedName: `image.${extensionForMediaType(parsed.mediaType)}`
    }
  }

  if (/^https?:/i.test(value)) return { kind: 'refused', error: SAVE_REMOTE_REFUSED }

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase()
  if (scheme !== undefined && scheme !== 'file') {
    return { kind: 'refused', error: `Приложение не сохраняет адреса вида «${scheme}:».` }
  }

  return { kind: 'path', value, suggestedName: safeFileName(decodedName(value), 'image') }
}

/** План диалога сохранения. `defaultPath` намеренно урезан до ИМЕНИ: папку
 * выбирает человек в диалоге, и рендерер не должен уметь подставить туда
 * `C:\Windows\System32\…`, даже если человек потом подтвердит. */
export function planSaveDialog(
  request: SaveDialogRequest | undefined,
  fallbackName: string
): SaveDialogPlan {
  const plan: SaveDialogPlan = { defaultPath: safeFileName(request?.defaultPath, fallbackName) }

  if (typeof request?.title === 'string' && request.title !== '') plan.title = request.title

  const filters = cleanFilters(request?.filters)
  if (filters) plan.filters = filters

  return plan
}
