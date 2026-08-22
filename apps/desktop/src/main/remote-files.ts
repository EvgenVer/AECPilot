// Файлы на машине ядра — обращения (задача 3.13b, SPEC UR20).
//
// Решения и слова — в `remote-files-pure.ts`. Здесь один вопрос: «читаем мы
// сейчас файлы отсюда или оттуда», и три способа прочитать оттуда.
//
// Цель берётся у вызывающего (`RestTarget`), а не вычисляется здесь: где живёт
// подключение, знает `index.ts`, и второе место, знающее то же самое, рано или
// поздно узнает это иначе.

import { hermesRest, type RestTarget } from './hermes-rest'
import { describeRemoteFileError, parseDataUrl, remoteBaseName } from './remote-files-pure'

/** Читать документ можно долго: файл идёт по сети целиком, base64 к тому же
 * добавляет треть. Умолчание REST (10 с) для этого мало. */
const READ_TIMEOUT_MS = 60_000

export interface RemoteReadResult {
  ok: boolean
  bytes?: ArrayBuffer
  name?: string
  path?: string
  size?: number
  error?: string
}

/**
 * Читает файл на машине ядра как байты.
 *
 * Отдаёт ту же форму, что и локальное чтение документа, — чтобы окно не знало,
 * откуда пришёл файл: это не «удобство», а условие того, что вьюеры остаются
 * одни и те же и не расходятся поведением между режимами.
 */
export async function readRemoteDocument(
  target: RestTarget | undefined,
  path: string
): Promise<RemoteReadResult> {
  try {
    const answer = await hermesRest<{ dataUrl?: string }>(target, '/api/fs/read-data-url', {
      query: { path },
      timeoutMs: READ_TIMEOUT_MS
    })

    const parsed = parseDataUrl(answer?.dataUrl)
    if (!parsed) return { ok: false, error: 'Ядро вернуло файл в непонятном виде' }

    // Копия, а не срез чужого буфера: `Buffer` в Node может лежать в общем
    // пуле, и отдать наружу его нижележащий буфер значит отдать заодно чужие
    // байты, оказавшиеся рядом.
    const bytes = new Uint8Array(parsed.bytes)
    return {
      ok: true,
      bytes: bytes.buffer as ArrayBuffer,
      name: remoteBaseName(path),
      path,
      size: bytes.byteLength
    }
  } catch (error: unknown) {
    return { ok: false, error: describeRemoteFileError(error) }
  }
}

export async function readRemoteDataUrl(
  target: RestTarget | undefined,
  path: string
): Promise<{ ok: boolean; dataUrl?: string; error?: string }> {
  try {
    const answer = await hermesRest<{ dataUrl?: string }>(target, '/api/fs/read-data-url', {
      query: { path },
      timeoutMs: READ_TIMEOUT_MS
    })

    if (!parseDataUrl(answer?.dataUrl)) {
      return { ok: false, error: 'Ядро вернуло картинку в непонятном виде' }
    }

    return { ok: true, dataUrl: answer.dataUrl }
  } catch (error: unknown) {
    return { ok: false, error: describeRemoteFileError(error) }
  }
}

/** Есть ли файл на машине ядра и какой он. Ответ намеренно беден: «есть, файл,
 * столько-то байт» — всё, что нужно вкладке артефактов, и ничего сверх. */
export async function statRemoteFile(
  target: RestTarget | undefined,
  path: string
): Promise<{ exists: boolean; isFile: boolean; size: number }> {
  try {
    const answer = await hermesRest<{ byteSize?: number; binary?: boolean }>(
      target,
      '/api/fs/read-text',
      { query: { path }, timeoutMs: READ_TIMEOUT_MS }
    )

    return { exists: true, isFile: true, size: answer?.byteSize ?? 0 }
  } catch (error: unknown) {
    const text = error instanceof Error ? error.message : String(error)

    // «Слишком велик» — это ЕСТЬ и это файл; для вкладки артефактов именно так,
    // а не «нет файла». Отличать по тексту приходится потому, что дешёвого
    // `stat` их REST не предлагает вовсе.
    if (text.toLowerCase().includes('too large')) return { exists: true, isFile: true, size: 0 }
    if (text.toLowerCase().includes('directory')) return { exists: true, isFile: false, size: 0 }

    return { exists: false, isFile: false, size: 0 }
  }
}
