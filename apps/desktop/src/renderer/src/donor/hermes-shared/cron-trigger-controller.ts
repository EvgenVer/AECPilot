/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/shared/src/cron-trigger-controller.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export interface CronTriggerRunResult<T> {
  started: boolean
  value: T | null
}

export interface CronTriggerController {
  isRunning(key: string): boolean
  run<T>(key: string, action: () => Promise<T>, onStarted?: () => void): Promise<CronTriggerRunResult<T>>
}

// This is an interaction guard for one mounted UI surface. Cross-window and
// cross-process exclusion remains the backend's responsibility via its durable
// cron claim; a renderer-local Set must never be treated as the execution lock.
export function createCronTriggerController(
  onRunningChange: (key: string, running: boolean) => void = () => undefined
): CronTriggerController {
  const running = new Set<string>()

  return {
    isRunning: key => running.has(key),
    async run<T>(key: string, action: () => Promise<T>, onStarted?: () => void) {
      if (running.has(key)) {
        return { started: false, value: null }
      }

      running.add(key)

      try {
        onRunningChange(key, true)

        onStarted?.()

        return { started: true, value: await action() }
      } finally {
        running.delete(key)
        onRunningChange(key, false)
      }
    }
  }
}
