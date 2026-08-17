// Чем прочитан текстовый файл (задача 4.2).
//
// В нашей предметной области это не мелочь: пояснительные записки, выгрузки из
// расчётных программ и списки кабелей десятилетиями пишутся в windows-1251, и
// такой файл, прочитанный как UTF-8, превращается в кракозябры. Показать
// кракозябры хуже, чем не открыть: инженер решит, что испорчен файл.
//
// Порядок проверки — от точного к вероятному: BOM говорит прямо, строгий UTF-8
// либо разбирается целиком, либо не разбирается вовсе (в UTF-8 нельзя случайно
// попасть — у него жёсткая структура продолжающих байтов), и только потом
// остаётся кодовая страница.

export type DecodedText = {
  /** Метка кодировки, которой прочитано; показывается человеку. */
  encoding: string
  text: string
}

const UTF8_BOM = [0xef, 0xbb, 0xbf]
const UTF16LE_BOM = [0xff, 0xfe]
const UTF16BE_BOM = [0xfe, 0xff]

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, at) => bytes[at] === byte)
}

/** Кодовая страница на случай, когда файл не UTF-8. Именно 1251, а не 866 или
 *  KOI8-R: сегодняшние файлы в Windows приходят в ней. */
const FALLBACK = 'windows-1251'

export function decodeText(buffer: ArrayBuffer): DecodedText {
  const bytes = new Uint8Array(buffer)

  if (startsWith(bytes, UTF8_BOM)) {
    return { encoding: 'UTF-8', text: new TextDecoder('utf-8').decode(bytes.subarray(3)) }
  }
  if (startsWith(bytes, UTF16LE_BOM)) {
    return { encoding: 'UTF-16LE', text: new TextDecoder('utf-16le').decode(bytes.subarray(2)) }
  }
  if (startsWith(bytes, UTF16BE_BOM)) {
    return { encoding: 'UTF-16BE', text: new TextDecoder('utf-16be').decode(bytes.subarray(2)) }
  }

  try {
    return { encoding: 'UTF-8', text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    // Не UTF-8 — значит однобайтовая кодировка. Она разберётся всегда и никогда
    // не бросит, поэтому проверять тут нечего: либо получится осмысленный
    // текст, либо файл вообще не текстовый.
    return { encoding: FALLBACK, text: new TextDecoder(FALLBACK).decode(bytes) }
  }
}
