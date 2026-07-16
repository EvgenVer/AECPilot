// Pure unit tests for task 1.14's scan scheduler (no electron import — runs
// directly under vitest's node environment, using fake timers).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScanScheduler } from './scan-scheduler'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ScanScheduler', () => {
  it('does not scan before the interval elapses', async () => {
    const runScan = vi.fn().mockResolvedValue('report')
    const scheduler = new ScanScheduler(runScan)

    scheduler.start(1000)
    await vi.advanceTimersByTimeAsync(999)

    expect(runScan).not.toHaveBeenCalled()
  })

  it('scans once the interval elapses, then re-arms for the next interval', async () => {
    const runScan = vi.fn().mockResolvedValue('report')
    const scheduler = new ScanScheduler(runScan)

    scheduler.start(1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(runScan).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(999)
    expect(runScan).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(runScan).toHaveBeenCalledTimes(2)
  })

  it('reports the result via onReport and clears isScanning after completion', async () => {
    const onReport = vi.fn()
    const runScan = vi.fn().mockResolvedValue({ sources: {} })
    const scheduler = new ScanScheduler(runScan, { onReport })

    scheduler.start(1000)
    await vi.advanceTimersByTimeAsync(1000)

    expect(onReport).toHaveBeenCalledWith({ sources: {} })
    expect(scheduler.isScanning()).toBe(false)
  })

  it('reports a rejection via onError, not onReport', async () => {
    const onReport = vi.fn()
    const onError = vi.fn()
    const error = new Error('boom')
    const runScan = vi.fn().mockRejectedValue(error)
    const scheduler = new ScanScheduler(runScan, { onReport, onError })

    scheduler.start(1000)
    await vi.advanceTimersByTimeAsync(1000)

    expect(onError).toHaveBeenCalledWith(error)
    expect(onReport).not.toHaveBeenCalled()
  })

  it('stop() cancels the pending timer — no further scans', async () => {
    const runScan = vi.fn().mockResolvedValue('report')
    const scheduler = new ScanScheduler(runScan)

    scheduler.start(1000)
    scheduler.stop()
    await vi.advanceTimersByTimeAsync(5000)

    expect(runScan).not.toHaveBeenCalled()
  })

  it('start() while already running replaces the schedule with the new interval', async () => {
    const runScan = vi.fn().mockResolvedValue('report')
    const scheduler = new ScanScheduler(runScan)

    scheduler.start(1000)
    await vi.advanceTimersByTimeAsync(500)
    scheduler.start(2000) // switching project: new scan_interval_s

    await vi.advanceTimersByTimeAsync(1000) // 1500ms in — old 1000ms schedule would have fired
    expect(runScan).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000) // 2000ms since restart
    expect(runScan).toHaveBeenCalledTimes(1)
  })

  it('triggerNow() runs immediately, ignoring any standing schedule', async () => {
    const runScan = vi.fn().mockResolvedValue('report')
    const scheduler = new ScanScheduler(runScan)

    scheduler.start(10000)
    await scheduler.triggerNow()

    expect(runScan).toHaveBeenCalledTimes(1)
  })

  it('triggerNow() is a no-op while a scan is already in flight', async () => {
    let resolveFirst: (value: string) => void = () => {}
    const runScan = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValue('second report')
    const scheduler = new ScanScheduler(runScan)

    const first = scheduler.triggerNow()
    expect(scheduler.isScanning()).toBe(true)

    const second = scheduler.triggerNow() // should be ignored — a scan is in flight
    expect(runScan).toHaveBeenCalledTimes(1)

    resolveFirst('first report')
    await first
    await second

    expect(runScan).toHaveBeenCalledTimes(1)
    expect(scheduler.isScanning()).toBe(false)
  })

  it('calls onScanStart before the scan resolves', async () => {
    const order: string[] = []
    const runScan = vi.fn().mockImplementation(async () => {
      order.push('scanning')
      return 'report'
    })
    const scheduler = new ScanScheduler(runScan, {
      onScanStart: () => order.push('start'),
      onReport: () => order.push('report')
    })

    await scheduler.triggerNow()

    expect(order).toEqual(['start', 'scanning', 'report'])
  })

  // Review fix (major 2): start() called while a scan is already in flight
  // (e.g. a project switch mid-scan) used to leave the in-flight scan's own
  // `finally` re-arm overwrite `this.timer` with a *second*, uncancelled
  // timer — two independent tick chains racing each other, scans landing at
  // double the configured frequency. armTimer() now always clears any
  // standing timer before arming a new one, so only a single chain survives.
  it('start() during an in-flight scan leaves exactly one tick chain once it finishes', async () => {
    let resolveFirst: (value: string) => void = () => {}
    const runScan = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValue('later report')
    const scheduler = new ScanScheduler(runScan)

    scheduler.start(1000)
    await vi.advanceTimersByTimeAsync(1000) // first tick fires, scan begins (pending)
    expect(runScan).toHaveBeenCalledTimes(1)

    scheduler.start(500) // project switch mid-scan: re-arms while still scanning

    resolveFirst('first report')
    await vi.advanceTimersByTimeAsync(0) // let the in-flight scan's `finally` run

    // If armTimer had left two chains, two more calls would land within the
    // next 500ms (one from each chain) instead of exactly one.
    await vi.advanceTimersByTimeAsync(500)
    expect(runScan).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(500)
    expect(runScan).toHaveBeenCalledTimes(3) // one further tick, not two
  })

  // Review fix (c): stop() called while a scan is in flight must leave no
  // re-arm behind once that scan finishes.
  it('stop() during an in-flight scan means no re-arm once it finishes', async () => {
    let resolveFirst: (value: string) => void = () => {}
    const runScan = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve
        })
    )
    const scheduler = new ScanScheduler(runScan)

    scheduler.start(1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(runScan).toHaveBeenCalledTimes(1)

    scheduler.stop() // project closed mid-scan
    resolveFirst('first report')
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(10000)
    expect(runScan).toHaveBeenCalledTimes(1) // no re-arm after stop()
  })

  // Review fix (b): a rejected scan resolves triggerNow()'s own promise
  // (never rejects it), reports via onError, clears isScanning, and leaves
  // the periodic schedule alive.
  it('triggerNow() resolves (not rejects) on a failing scan, and the schedule survives it', async () => {
    const onError = vi.fn()
    const runScan = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('report')
    const scheduler = new ScanScheduler(runScan, { onError })

    scheduler.start(1000)
    await expect(scheduler.triggerNow()).resolves.toBeUndefined()

    expect(onError).toHaveBeenCalledWith(new Error('boom'))
    expect(scheduler.isScanning()).toBe(false)

    await vi.advanceTimersByTimeAsync(1000) // the interval schedule is still armed
    expect(runScan).toHaveBeenCalledTimes(2)
  })
})
