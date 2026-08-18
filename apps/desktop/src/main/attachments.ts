// Task 4D-15: files dropped into the chat composer.
//
// The record this came from asked to wire the core's `input.detect_drop`. That
// turned out to be the wrong mechanism, and the reason is worth writing down:
// `input.detect_drop` exists for a TERMINAL, where a dropped file arrives as
// pasted text that somebody has to parse back into a path. A window receives a
// real `DataTransfer` with the bytes in hand, and the donor's composer already
// carries a full drop engine for exactly that (`use-composer-drop.ts`) — it
// even splits in-app drags (inline `@file:` refs) from OS drops (uploads).
//
// What was actually missing is two bridge members that engine calls and our
// shim never served: `saveImageBuffer` and `readFileDataUrl`. Both live here.
//
// `readFileDataUrl` is the interesting one. Served naively it is an
// arbitrary-file read primitive handed to the window — the same thing task
// 4D-11 had just taken away on the write side, given back on the read side. So
// it is scoped: it reads only files inside the attachments directory, i.e.
// only what the renderer itself just saved through `saveImageBuffer`. That
// covers the whole drop flow by construction, because an OS drop always
// carries its bytes (`partitionDroppedFiles`: a candidate with no `file` is an
// in-app drag, and those become inline refs, never attachments).

import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/** Extensions we will write. Anything else becomes `.bin`: the extension ends
 * up in a filename on the user's disk, and a renderer choosing it freely could
 * choose `.exe` — harmless where it lands, but not a decision the window gets
 * to make. */
const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])

/** Data-URL media types, by the extension we wrote. */
const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  bin: 'application/octet-stream'
}

/** Refuse a file large enough that turning it into a base64 data URL would
 * cost more memory than a chat attachment is worth (base64 is 4/3 of the
 * bytes, and the string is built whole). */
export const MAX_ATTACHMENT_BYTES = 32 * 1024 * 1024

export function normalizeExtension(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/^\./, '') : ''
  return ALLOWED_EXTENSIONS.has(value) ? value : 'bin'
}

/** Whether `candidate` is a file directly inside `dir`. Compared on resolved
 * paths, and only one level deep — `..` cannot climb out of a directory it is
 * not allowed to nest under either. */
export function isInsideAttachmentsDir(dir: string, candidate: string): boolean {
  const root = path.resolve(dir)
  const target = path.resolve(candidate)
  return path.dirname(target) === root && target !== root
}

export function mediaTypeFor(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return MEDIA_TYPES[ext] ?? MEDIA_TYPES.bin
}

/** Writes dropped/pasted bytes into `dir` and returns the file's path. */
export async function saveAttachment(
  dir: string,
  bytes: Uint8Array,
  extension: unknown
): Promise<string> {
  if (bytes.byteLength === 0) throw new Error('пустой файл')
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error('файл слишком велик')
  await fs.mkdir(dir, { recursive: true })
  const target = path.join(dir, `${randomUUID()}.${normalizeExtension(extension)}`)
  await fs.writeFile(target, bytes)
  return target
}

/** Reads back a file this process wrote, as a data URL. Anything outside the
 * attachments directory is refused — see this module's header. */
export async function readAttachmentDataUrl(dir: string, filePath: string): Promise<string> {
  if (!isInsideAttachmentsDir(dir, filePath)) {
    throw new Error('читать можно только вложения этого сеанса')
  }
  const bytes = await fs.readFile(filePath)
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error('файл слишком велик')
  return `data:${mediaTypeFor(filePath)};base64,${bytes.toString('base64')}`
}
