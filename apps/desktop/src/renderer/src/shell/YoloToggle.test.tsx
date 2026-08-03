// Tasks 1.6.B5.21–B5.22 — the YOLO zap. Everything worth testing here is a
// refusal: no local "on" state, no global scope, no press without a session.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import YoloToggle from './YoloToggle'
import StatusBar from './StatusBar'
import { emptyNotificationState } from './notifications-pure'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const setYolo = vi.fn()
const getApprovalsMode = vi.fn()

beforeEach(() => {
  setYolo.mockResolvedValue({ key: 'yolo', value: '1' })
  getApprovalsMode.mockResolvedValue({ mode: 'manual' })
  window.aecpilot = { setYolo, getApprovalsMode } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('YoloToggle', () => {
  it('shows what session.info reported, not what was clicked', async () => {
    const { rerender } = render(<YoloToggle yolo={false} hasSession={true} onError={() => {}} />)
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-pressed')).toBe('false')

    await act(async () => {
      fireEvent.click(button)
    })
    // Still off: the zap has no local state — it lights up only when the
    // gateway says the session actually bypasses approvals.
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false')

    rerender(<YoloToggle yolo={true} hasSession={true} onError={() => {}} />)
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true')
  })

  it('asks for the opposite of the reported state', async () => {
    render(<YoloToggle yolo={true} hasSession={true} onError={() => {}} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(setYolo).toHaveBeenCalledWith(false)
  })

  it('is not pressable without a live session', () => {
    render(<YoloToggle yolo={false} hasSession={false} onError={() => {}} />)
    const button = screen.getByRole('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    // With no session their handler would flip HERMES_YOLO_MODE for the whole
    // gateway process, i.e. for every session it serves.
    expect(setYolo).not.toHaveBeenCalled()
  })

  it('reports a refusal instead of pretending it took', async () => {
    setYolo.mockRejectedValue(new Error('нет живой сессии'))
    const onError = vi.fn()
    render(<YoloToggle yolo={false} hasSession={true} onError={onError} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    await waitFor(() => expect(onError).toHaveBeenCalledWith('нет живой сессии'))
  })

  // --- task 1.6.B5.22: the global scope is unreachable --------------------
  it('offers no way to reach the global scope from the interface', () => {
    // Structural, not behavioural, and deliberately so: `setYolo` takes a
    // boolean and nothing else, so there is no argument through which a caller
    // could ask for `scope: "global"` — the scope that would rewrite
    // approvals.mode in config.yaml behind the approvals selector.
    render(<YoloToggle yolo={false} hasSession={true} onError={() => {}} />)
    fireEvent.click(screen.getByRole('button'))
    for (const call of setYolo.mock.calls) {
      expect(call).toHaveLength(1)
      expect(typeof call[0]).toBe('boolean')
    }
    // And the same guarantee at the source level: no caller anywhere in the
    // renderer or main mentions the global scope for this key.
    const root = join(__dirname, '..', '..', '..')
    for (const file of ['main/index.ts', 'shared/gateway/types.ts']) {
      const text = readFileSync(join(root, file), 'utf-8')
      expect(text).not.toContain("scope: 'global'")
      expect(text).not.toContain('scope: "global"')
    }
  })

  it('leaves the approvals selector alone — they own different settings', async () => {
    render(
      <StatusBar
        connectionState="ready"
        approvalsDisabled={false}
        onApprovalsError={() => {}}
        compacting={false}
        yolo={false}
        hasSession={true}
        notifications={emptyNotificationState}
        notificationsDispatch={() => {}}
      />
    )
    await waitFor(() => expect(getApprovalsMode).toHaveBeenCalled())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /YOLO/ }))
    })
    // The zap wrote a session flag; the persistent mode was neither read again
    // nor written. Their global scope would have rewritten it to off/manual
    // and destroyed the "умный" mode this selector has and their zap does not.
    expect(setYolo).toHaveBeenCalledTimes(1)
    expect(getApprovalsMode).toHaveBeenCalledTimes(1)
  })
})
