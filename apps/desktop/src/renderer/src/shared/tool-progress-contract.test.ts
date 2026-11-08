// @vitest-environment jsdom
// Task T55: live MCP progress reaches the tool row.
//
// The core 0.23 sends `tool.progress` with the payload of
// `agent/tool_progress_relay.py::tool_progress_payload` — measured by
// `runtime/mcp-features-probe.mjs` on our test server (`step 2 of 3`, 67 %). Our main
// process forwards every gateway frame to the window unfiltered (`chat:event`), so the
// remaining joint is the donor's handler reading that payload. Their repository has no
// test for it; this one pins the shape the core actually sends.

import { afterEach, describe, expect, it } from 'vitest'

import { handleToolProgressEvent } from '../donor/app/session/hooks/use-message-stream/gateway-event/tools'
import {
  $toolProgressFor,
  clearSessionToolProgress,
  formatToolProgress
} from '../donor/store/tool-progress'

type Context = Parameters<typeof handleToolProgressEvent>[0]

const SESSION = 'session-1'

function frame(type: string, payload: Record<string, unknown>, interrupted = false): Context {
  return {
    deps: { sessionInterrupted: () => interrupted },
    event: { type, payload },
    payload,
    sessionId: SESSION
  } as unknown as Context
}

// The payload as the core builds it (`tool_progress_payload`), values from the probe run.
const CORE_PAYLOAD = {
  tool_id: 'call-1',
  name: 'mcp__probe_stdio__run_check',
  progress: 2,
  total: 3,
  percent: 67,
  message: 'step 2 of 3'
}

afterEach(() => clearSessionToolProgress(SESSION))

describe('tool.progress from core 0.23 (T55)', () => {
  it('annotates the running tool row with the percent and the server message', () => {
    expect(handleToolProgressEvent(frame('tool.progress', CORE_PAYLOAD))).toBe(true)
    const progress = $toolProgressFor(SESSION, 'call-1').get()
    expect(progress).toEqual({ message: 'step 2 of 3', percent: 67 })
    expect(formatToolProgress(progress)).toContain('67')
  })

  it('a progress without a total still shows the message', () => {
    handleToolProgressEvent(frame('tool.progress', { ...CORE_PAYLOAD, total: null, percent: null }))
    expect($toolProgressFor(SESSION, 'call-1').get()).toEqual({
      message: 'step 2 of 3',
      percent: null
    })
  })

  it('tool.complete retires the annotation', () => {
    handleToolProgressEvent(frame('tool.progress', CORE_PAYLOAD))
    expect(handleToolProgressEvent(frame('tool.complete', { tool_id: 'call-1' }))).toBe(false)
    expect($toolProgressFor(SESSION, 'call-1').get()).toBeUndefined()
  })
})
