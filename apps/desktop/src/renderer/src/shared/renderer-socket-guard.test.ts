import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// SPEC C9: the renderer talks to the gateway only through main. The donor's
// code does the opposite in two places — their gateway client opens a
// WebSocket, and `pluginSocket` opens a raw one with the session token in the
// query string — so this is the guard that fails loudly when such a file is
// vendored in without edit kind 1 being applied to it.
//
// It reads sources rather than the built bundle: the bundle is derived from
// exactly these files, the check needs no build step, and the failure it
// produces names the file to fix instead of an offset in a minified chunk.

const RENDERER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (/\.tsx?$/.test(entry.name)) yield full
  }
}

describe('renderer socket guard (SPEC C9)', () => {
  it('opens no WebSocket anywhere in the renderer', () => {
    const offenders = [...walk(RENDERER_DIR)]
      .filter((file) => file !== fileURLToPath(import.meta.url))
      .filter((file) => /new\s+WebSocket\s*\(/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(RENDERER_DIR, file))

    expect(offenders).toEqual([])
  })
})
