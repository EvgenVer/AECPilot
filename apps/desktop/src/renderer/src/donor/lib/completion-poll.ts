/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/completion-poll.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
