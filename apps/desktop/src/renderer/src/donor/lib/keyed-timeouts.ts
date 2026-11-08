/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/keyed-timeouts.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Per-key setTimeout registry for "let this linger, then drop it" UI state.
 *  Scheduling a key replaces its pending timer, and an entry removes itself
 *  when it fires, so the map never accumulates dead keys. */
export function keyedTimeouts() {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const cancel = (key: string) => {
    const timer = timers.get(key)

    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(key)
    }
  }

  return {
    cancel,
    schedule(key: string, delayMs: number, run: () => void) {
      cancel(key)
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key)
          run()
        }, delayMs)
      )
    }
  }
}
