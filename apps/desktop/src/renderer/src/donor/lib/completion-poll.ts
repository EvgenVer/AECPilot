/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/completion-poll.ts
 * Commit:  939e45c91d751fadd94dcd1b873ac3cb44846213 (v2026.9.11)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
interface CompletionPollOptions<T> {
  delayMs: number
  poll: () => Promise<T>
  publish: (value: T) => void
}

/**
 * Poll immediately, then wait one full cadence AFTER each request settles.
 *
 * `setInterval` fires on the wall clock, so a request slower than the cadence
 * overlaps the next one and a stalled backend piles up concurrent requests.
 * Rescheduling from settlement keeps the poll single-flight. The returned stop
 * function drops the pending timer and suppresses a late publish.
 */
export function startCompletionPoll<T>({ delayMs, poll, publish }: CompletionPollOptions<T>): () => void {
  let stopped = false
  let timer: number | undefined

  const run = async () => {
    try {
      const value = await poll()

      if (!stopped) {
        publish(value)
      }
    } catch {
      // A transient producer failure keeps the previous value visible.
    }

    if (!stopped) {
      timer = window.setTimeout(() => void run(), delayMs)
    }
  }

  void run()

  return () => {
    stopped = true
    window.clearTimeout(timer)
  }
}
