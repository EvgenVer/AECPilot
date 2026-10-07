// D-182: наши окна не закрывались по Escape, а окна донора закрываются. Escape
// раздаётся их порядком `lib/escape-layers`: наше окно лежит над их оверлеем
// («Настройки»), и Escape закрывает сначала его, а раскрытый список Radix внутри
// окна (он сам гасит событие) — раньше окна.
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ESCAPE_PRIORITY, isTopEscapeLayer, pushEscapeLayer } from '../donor/lib/escape-layers'

import { CloseOnEscape } from './CloseOnEscape'

describe('Escape у наших окон', () => {
  afterEach(() => cleanup())

  it('закрывает окно', () => {
    const onClose = vi.fn()
    render(<CloseOnEscape onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('не трогает другие клавиши', () => {
    const onClose = vi.fn()
    render(<CloseOnEscape onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('уступает тому, кто уже погасил Escape (раскрытый список Radix)', () => {
    const onClose = vi.fn()
    render(<CloseOnEscape onClose={onClose} />)
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    event.preventDefault()
    window.dispatchEvent(event)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('пока окно открыто, их оверлей под ним Escape не берёт; после закрытия — снова берёт', () => {
    const releaseOverlay = pushEscapeLayer(ESCAPE_PRIORITY.overlay)
    const view = render(<CloseOnEscape onClose={() => undefined} />)
    expect(isTopEscapeLayer(ESCAPE_PRIORITY.overlay)).toBe(false)
    view.unmount()
    expect(isTopEscapeLayer(ESCAPE_PRIORITY.overlay)).toBe(true)
    releaseOverlay()
  })
})
