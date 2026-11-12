// Journal of "uncertain" sends (task T52, donor 0.23.0): their composer records a
// prepared submission before sending and clears it on the gateway's answer, so a
// send cut off by a crash can be retried without a duplicate; room sends use the
// atomic compare-and-set. One JSON file per renderer origin in `userData`; the
// renderer never names a path.
//
// Adapted from Hermes Desktop (MIT) `apps/desktop/electron/prepared-submissions.ts`
// at 2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19. Changes: their `writeSecretFileAtomic`
// (`hardening.ts`) is replaced by `writePrivateFileAtomic` below, whose rename retries a
// moment's lock by an antivirus (`renameWithRetry`); IPC registration lives in `index.ts`
// under our `prepared-submissions:*` channels.

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { randomBytes } from 'node:crypto'

// Match localStorage's origin isolation; destination keys additionally carry
// connection/profile/session authority. No renderer-provided filesystem paths.
export function preparedJournal(userData: string, origin: string) {
  const file = path.join(
    userData,
    `prepared-submissions-${createHash('sha256').update(origin).digest('hex')}.json`
  )

  const read = (): Record<string, unknown> => {
    let raw: string

    try {
      raw = fs.readFileSync(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {}
      }
      throw error
    }

    try {
      const parsed: unknown = JSON.parse(raw)

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      /* quarantined below */
    }

    // A torn/garbled journal (crash mid-write on a filesystem without atomic rename, disk
    // corruption) is unrecoverable as JSON. Throwing here blocked every later send of the origin,
    // since each send must journal first. Move it aside with its bytes intact for diagnosis; its
    // uncertain entries are lost to automatic retry, which only ever was an explicit user action.
    fs.renameSync(file, `${file}.corrupt-${Date.now()}`)
    console.warn(`[prepared-submissions] quarantined unreadable journal ${path.basename(file)}`)

    return {}
  }

  const write = (journal: Record<string, unknown>, key: string, entry: unknown | null) => {
    if (entry === null) {
      delete journal[key]
    } else {
      Object.defineProperty(journal, key, { value: entry, enumerable: true, configurable: true })
    }

    fs.mkdirSync(userData, { recursive: true })
    // Same private atomic replacement used for native connection settings.
    // Return only after write+rename: process termination cannot lose an ACKed
    // entry to Chromium's deferred localStorage commit. Not a power-loss promise.
    writePrivateFileAtomic(file, JSON.stringify(journal))
  }

  return {
    read,
    update(key: string, entry: unknown | null) {
      write(read(), key, entry)
    },
    /** Replace `key` only while it still holds exactly `expected` (null = absent): create-if-absent
     *  and compare-and-delete in one synchronous main-process step, so windows sharing the origin's
     *  journal cannot interleave between the check and the write. Returns the record now stored. */
    compareAndSet(
      key: string,
      expected: unknown | null,
      entry: unknown | null
    ): { applied: boolean; current: unknown | null } {
      const journal = read()
      const current = Object.hasOwn(journal, key) ? journal[key] : null

      if (JSON.stringify(current) !== JSON.stringify(expected)) {
        return { applied: false, current }
      }
      write(journal, key, entry)

      return { applied: true, current: entry }
    }
  }
}

/** Write next to the target and rename over it: a reader sees the old journal or
 * the new one, never half of either. Owner-only mode where the OS honours it. */
function writePrivateFileAtomic(file: string, text: string): void {
  const temp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    fs.writeFileSync(temp, text, { encoding: 'utf8', mode: 0o600 })
    renameWithRetry(temp, file)
  } catch (error) {
    fs.rmSync(temp, { force: true })
    throw error
  }
}

/** Codes Windows gives a rename over a file an antivirus or the search indexer holds open
 *  for a moment. The journal write is synchronous, so the pause is synchronous too. */
const TRANSIENT_RENAME = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RENAME_DELAYS_MS = [20, 50, 100, 200]

export function renameWithRetry(
  from: string,
  to: string,
  rename: (from: string, to: string) => void = fs.renameSync
): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? ''
      if (!TRANSIENT_RENAME.has(code) || attempt >= RENAME_DELAYS_MS.length) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_DELAYS_MS[attempt])
    }
  }
}
