// Every project this installation has opened, for the uninstaller (task T30): it offers
// to remove each project's index `<vault>\.aecpilot` and never anything else of the
// project. The recents list cannot serve — it is capped at ten.
//
// The file is UTF-16LE without a BOM, one vault path per line (CRLF): the NSIS
// uninstaller reads it with `FileReadUTF16LE`, and project paths are often Cyrillic.

import { normalize } from 'node:path'

function key(vaultPath: string): string {
  return normalize(vaultPath)
    .replace(/[\\/]+$/, '')
    .toLowerCase()
}

const BOM = String.fromCharCode(0xfeff)

export function parseIndexLocations(buffer: Buffer): string[] {
  return buffer
    .toString('utf16le')
    .split(/\r?\n/)
    .map((line) => line.replace(BOM, '').trim())
    .filter(Boolean)
}

/** `list` with `vaultPath` added once (paths compared case-insensitively). */
export function addIndexLocation(list: string[], vaultPath: string): string[] {
  const wanted = key(vaultPath)
  return list.some((entry) => key(entry) === wanted) ? list : [...list, normalize(vaultPath)]
}

export function serializeIndexLocations(list: string[]): Buffer {
  return Buffer.from(list.map((entry) => `${entry}\r\n`).join(''), 'utf16le')
}
