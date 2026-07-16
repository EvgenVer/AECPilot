// Pure scheduling logic for task 1.14 (scan interval + "scan now"). No
// electron import — the actual scan (spawning the aec-rag CLI, see
// scan-runner.ts) and IPC wiring live in main/index.ts; this module only
// owns the timer/re-arm/overlap-guard state so it can be unit-tested
// directly with vitest fake timers, the same way llm-settings-pure.ts is.

/** Runs one scan and resolves with its result (or rejects). Errors are
 * reported via the `onError` callback, not thrown back at the caller — see
 * `runOnce` below. */
export type ScanRunner<TReport> = () => Promise<TReport>

export interface ScanSchedulerCallbacks<TReport> {
  /** Fired right before a scan starts (timer tick or `triggerNow`) — never
   * fired for a `triggerNow` call that's ignored because a scan is already
   * in flight. */
  onScanStart?: () => void
  /** Fired when a scan completes successfully. */
  onReport?: (report: TReport) => void
  /** Fired when a scan's runner rejects. */
  onError?: (error: unknown) => void
}

/** Re-arming timeout (not a raw `setInterval`): the next tick is only
 * scheduled once the current scan has finished, so a scan that outlives the
 * configured interval never causes overlapping runs. `triggerNow` ("scan
 * now") goes through the same overlap guard and re-arms the same way, so a
 * manual scan and the periodic one can never run concurrently either. */
export class ScanScheduler<TReport> {
  private readonly runScan: ScanRunner<TReport>
  private readonly callbacks: ScanSchedulerCallbacks<TReport>

  private intervalMs: number | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private scanning = false

  constructor(runScan: ScanRunner<TReport>, callbacks: ScanSchedulerCallbacks<TReport> = {}) {
    this.runScan = runScan
    this.callbacks = callbacks
  }

  /** (Re)starts the periodic schedule at `intervalMs` — the next scan fires
   * `intervalMs` from now. Replaces any previously-armed timer (e.g. a
   * project switch swapping in a different `settings.scan_interval_s`). */
  start(intervalMs: number): void {
    this.stop()
    this.intervalMs = intervalMs
    this.armTimer()
  }

  /** Clears the periodic schedule (e.g. the project was closed). A scan
   * already in flight is left to finish — it just won't re-arm afterwards. */
  stop(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.intervalMs = undefined
  }

  /** True while a scan (periodic or manual) is in flight. */
  isScanning(): boolean {
    return this.scanning
  }

  /** "Сканировать сейчас" — runs a scan immediately, ignored (a no-op,
   * resolves right away) if one is already in flight. */
  triggerNow(): Promise<void> {
    return this.runOnce()
  }

  private armTimer(): void {
    // Fix (review major 2): always clear any timer already standing before
    // arming a new one. Without this, `start()` called while a scan is in
    // flight (e.g. a project switch mid-scan) creates a timer here, and the
    // in-flight scan's own `finally` later calls `armTimer` again — which
    // used to overwrite `this.timer` with a *second* timer without
    // cancelling the first, leaving two independent tick chains racing each
    // other (scans at double the configured frequency, compounding with
    // every subsequent project switch). Clearing first collapses that back
    // to a single chain no matter how many times `armTimer` is called before
    // one of its timers actually fires.
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    if (this.intervalMs === undefined) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.runOnce()
    }, this.intervalMs)
  }

  private async runOnce(): Promise<void> {
    if (this.scanning) return
    this.scanning = true
    // A scan is starting: kill any still-pending timer so a tick can never
    // land while this run is in progress (only relevant for the
    // `triggerNow` path — a timer-driven tick has already consumed its own
    // timer by the time it gets here).
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.callbacks.onScanStart?.()
    try {
      const report = await this.runScan()
      this.callbacks.onReport?.(report)
    } catch (error) {
      this.callbacks.onError?.(error)
    } finally {
      this.scanning = false
      this.armTimer()
    }
  }
}
