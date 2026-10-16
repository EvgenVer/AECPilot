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

// A file whose socket is UNREACHABLE, with the line that makes it so. The
// exemption holds only while that line is there: a re-copy that drops the edit
// puts the file back among the offenders.
//
// `screen-pane.tsx` (0.21.5, Bot Desktop): it loads noVNC BEFORE dialing
// `/api/display/ws`, and our edit [4] makes that load refuse (the package is
// not installed — SPEC C3, owner question D-145), so `new WebSocket` is never
// reached. If D-145 takes the screen, the socket must move to main first.
const UNREACHABLE_SOCKETS: Record<string, string> = {
  [path.join('donor', 'plugins', 'hermes-bots', 'screen-pane.tsx')]:
    "throw new Error('The bot screen viewer (noVNC) is not installed in this build')"
}

// A file whose socket is unreachable because NOTHING CALLS IT: every caller of
// each link's entry point is another link of the same chain, so no call from
// outside the chain can reach the socket. Checked below by CALLS, not imports —
// an import that is never called (their composer keeps one) opens nothing —
// and a re-copy that calls any link from outside fails here.
//
// `voice-stream.ts` (0.22.2, task T20.7): live dictation streams the mic to
// `/api/audio/transcribe-stream`. Voice is SPEC HX19 — composer/index.tsx calls
// neither `useComposerVoice` nor `useVoiceRecorder` (edit [3]). If voice ever
// comes back, this socket must move to main first (SPEC C9).
interface DeadLink {
  file: string
  /** The export whose call would bring the link to life. */
  entry: string
}

const UNREACHABLE_BY_CALLS: Record<string, readonly DeadLink[]> = {
  [path.join('donor', 'lib', 'voice-stream.ts')]: [
    { file: path.join('donor', 'lib', 'voice-stream.ts'), entry: 'openDictationStream' },
    {
      file: path.join('donor', 'app', 'chat', 'composer', 'hooks', 'use-voice-recorder.ts'),
      entry: 'useVoiceRecorder'
    },
    {
      file: path.join('donor', 'app', 'chat', 'composer', 'hooks', 'use-composer-voice.ts'),
      entry: 'useComposerVoice'
    }
  ]
}

/** Source without comments: a sentence about a hook is not a call of it. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Non-test renderer files that call `entry(` — the definition counts too. */
function callersOf(entry: string, files: readonly string[]): string[] {
  const call = new RegExp(`\\b${entry}\\s*\\(`)

  return files
    .filter((file) => !/\.test\.tsx?$/.test(file) && call.test(code(readFileSync(file, 'utf8'))))
    .map((file) => path.relative(RENDERER_DIR, file))
}

describe('renderer socket guard (SPEC C9)', () => {
  const files = [...walk(RENDERER_DIR)].filter((file) => file !== fileURLToPath(import.meta.url))

  it('opens no WebSocket anywhere in the renderer', () => {
    const offenders = files
      .filter((file) => {
        const text = readFileSync(file, 'utf8')
        const rel = path.relative(RENDERER_DIR, file)
        const unreachableBy = UNREACHABLE_SOCKETS[rel]
        return (
          /new\s+WebSocket\s*\(/.test(text) &&
          !(unreachableBy && text.includes(unreachableBy)) &&
          !(rel in UNREACHABLE_BY_CALLS)
        )
      })
      .map((file) => path.relative(RENDERER_DIR, file))

    expect(offenders).toEqual([])
  })

  it('a socket exempted by its call chain is still unreachable', () => {
    for (const [socketFile, chain] of Object.entries(UNREACHABLE_BY_CALLS)) {
      const inChain = new Set(chain.map((link) => link.file))

      for (const link of chain) {
        const outside = callersOf(link.entry, files).filter((caller) => !inChain.has(caller))
        expect(outside, `${link.entry} is called from outside the chain of ${socketFile}`).toEqual(
          []
        )
      }
    }
  })
})
