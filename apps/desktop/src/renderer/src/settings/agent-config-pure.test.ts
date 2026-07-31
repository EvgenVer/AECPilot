import { describe, expect, it } from 'vitest'
import {
  BUSY_MODE_LABELS,
  BUSY_MODES,
  describeConfigError,
  readBusyMode,
  readFast,
  readPrompt,
  readReasoning,
  readToolProgress,
  TOOL_PROGRESS_LABELS,
  TOOL_PROGRESS_MODES
} from './agent-config-pure'

describe('readReasoning', () => {
  it('reads the effort and the display flag as two separate settings', () => {
    expect(readReasoning({ value: 'high', display: 'show' })).toEqual({
      effort: 'high',
      shown: true
    })
    expect(readReasoning({ value: 'high', display: 'hide' })).toEqual({
      effort: 'high',
      shown: false
    })
  })

  // 'none' is an explicit "thinking off", not the absence of a setting.
  it('keeps "none" as a real value', () => {
    expect(readReasoning({ value: 'none', display: 'hide' }).effort).toBe('none')
  })

  it('does not turn an empty answer into an explicit level', () => {
    expect(readReasoning({}).effort).toBe('')
    expect(readReasoning(undefined).effort).toBe('')
  })
})

describe('readFast', () => {
  it('is true only for their literal "fast"', () => {
    expect(readFast({ value: 'fast' })).toBe(true)
    expect(readFast({ value: 'normal' })).toBe(false)
    expect(readFast(undefined)).toBe(false)
  })
})

describe('readToolProgress', () => {
  it('reads their four modes', () => {
    for (const mode of TOOL_PROGRESS_MODES) {
      expect(readToolProgress({ value: mode })).toBe(mode)
    }
  })

  it('falls back to "all" for an unknown value rather than to "off"', () => {
    // "off" suppresses tool cards entirely; defaulting to it on a value we do
    // not recognise would silently blank the transcript.
    expect(readToolProgress({ value: 'whatever' })).toBe('all')
    expect(readToolProgress(undefined)).toBe('all')
  })

  it('spells out what "off" costs', () => {
    expect(TOOL_PROGRESS_LABELS.off).toMatch(/карточек инструментов/)
  })
})

describe('readBusyMode', () => {
  it('reads their three modes', () => {
    for (const mode of BUSY_MODES) expect(readBusyMode({ value: mode })).toBe(mode)
  })

  // Guessing "queue" costs a delayed message; guessing "interrupt" kills a
  // turn nobody asked to stop.
  it('reads an unknown value as queue, never as interrupt', () => {
    expect(readBusyMode({ value: 'sideways' })).toBe('queue')
    expect(readBusyMode({})).toBe('queue')
    expect(readBusyMode(undefined)).toBe('queue')
  })

  it('labels every mode', () => {
    for (const mode of BUSY_MODES) expect(BUSY_MODE_LABELS[mode]).toBeTruthy()
  })
})

describe('readPrompt', () => {
  it('reads the custom prompt, empty when unset', () => {
    expect(readPrompt({ prompt: 'be terse' })).toBe('be terse')
    expect(readPrompt({ prompt: '' })).toBe('')
    expect(readPrompt(undefined)).toBe('')
  })
})

describe('describeConfigError', () => {
  it('explains the fast-mode refusal as a model limitation', () => {
    expect(describeConfigError('fast', 'fast mode is not available for this model')).toMatch(
      /недоступен для выбранной модели/
    )
  })

  it('explains "no model selected" separately', () => {
    expect(
      describeConfigError('fast', 'fast mode is not available without a selected model')
    ).toMatch(/Модель не выбрана/)
  })

  it('passes anything else through with its text', () => {
    expect(describeConfigError('prompt', 'boom')).toContain('boom')
    expect(describeConfigError('prompt', '')).not.toBe('')
  })
})
