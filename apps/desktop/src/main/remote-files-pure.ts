// Файлы на машине ядра — решения без обращений (задача 3.13b, SPEC UR20).
//
// ЗАЧЕМ ЭТО ЕСТЬ. Когда ядро работает на другой машине, «файл» — это файл ТАМ.
// Прочитать его локально нельзя, и хуже всего вариант, в котором мы читаем
// местный файл с тем же именем: получится уверенный неверный ответ вместо
// отказа. Ядро отдаёт файлы по сети само (`/api/fs/read-data-url`), поэтому
// правильный ответ — спросить у него.
//
// Здесь только разбор и слова; сами обращения — в `remote-files.ts`.

/** Что человек читает, когда файла нет на ЭТОЙ машине по существу задачи, а не
 * по ошибке. Один текст на все поверхности: одинаковая причина не должна
 * объясняться шестью разными способами. */
export const FILES_LIVE_ON_CORE_MACHINE =
  'Ядро работает на другой машине — у этого файла нет пути на вашем компьютере.'

export interface DataUrlParts {
  mime: string
  bytes: Buffer
}

/**
 * Разбирает `data:`-адрес, которым ядро отдаёт файл.
 *
 * Принимается только base64: ядро отдаёт именно так, а поддерживать вторую
 * форму «на всякий случай» значит держать код, который никогда не выполнялся и
 * потому никем не проверен.
 */
export function parseDataUrl(value: unknown): DataUrlParts | null {
  if (typeof value !== 'string') return null

  const marker = ';base64,'
  const at = value.indexOf(marker)
  if (!value.startsWith('data:') || at < 0) return null

  const mime = value.slice('data:'.length, at)
  const encoded = value.slice(at + marker.length)

  try {
    const bytes = Buffer.from(encoded, 'base64')
    // Пустой ответ на непустую строку — признак мусора, а не пустого файла:
    // пустой файл дал бы пустую строку после запятой.
    if (bytes.length === 0 && encoded.length > 0) return null
    return { mime, bytes }
  } catch {
    return null
  }
}

/**
 * Ошибка ядра — человеческими словами.
 *
 * Их REST отвечает кодом и английской подробностью (`File too large`); показать
 * это как есть значит переложить перевод на человека. Разбирается по СМЫСЛУ, а
 * не по коду: код у «слишком велик» и «нет доступа» разный, а вот текст ядра
 * стабилен и говорит ровно то, что случилось.
 */
export function describeRemoteFileError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  const lower = text.toLowerCase()

  if (lower.includes('too large')) return 'Файл слишком велик для просмотра'
  if (lower.includes('not readable') || lower.includes('403')) return 'Нет доступа к файлу'
  if (lower.includes('not a regular file') || lower.includes('directory')) {
    return 'Это папка, а не документ'
  }
  if (lower.includes('404') || lower.includes('not found') || lower.includes('enoent')) {
    return 'Файл не найден на машине ядра'
  }

  return `Не удалось прочитать файл на машине ядра: ${text}`
}

/** Имя файла из пути, каким его видит ядро. Разделитель может быть чужим: ядро
 * на Linux пришлёт `/`, на Windows — `\`, и знать заранее мы этого не можем. */
export function remoteBaseName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}
