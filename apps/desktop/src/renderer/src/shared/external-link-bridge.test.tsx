import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { createHermesDesktopBridge } from './hermes-desktop-shim'

/**
 * Task 3.19. Their code opens browsers from several places — the OAuth sign-in
 * URL, a provider's docs link, a link clicked in the terminal pane — and every
 * one of those URLs comes from OUTSIDE: the core, or a model's answer.
 *
 * What this pins is not "it opens" but WHERE it is decided: the renderer hands
 * the URL to main and nothing else. Before this bridge existed the call landed
 * on the unbridged stand-in, which rejects a promise nobody awaits — so links
 * silently did nothing, which is how a sign-in button becomes a support ticket.
 */

const openExternalLink = vi.fn()

beforeEach(() => {
  openExternalLink.mockReset().mockResolvedValue({ ok: true })
  window.aecpilot = { openExternalLink } as unknown as typeof window.aecpilot
})

afterEach(() => {
  delete (window as { aecpilot?: unknown }).aecpilot
})

describe('openExternal через мост', () => {
  test('ссылка уходит в main как есть — решает он, а не рендерер', async () => {
    const bridge = createHermesDesktopBridge()

    await bridge.openExternal('https://hermes-agent.nousresearch.com/docs/messaging/ntfy')

    expect(openExternalLink).toHaveBeenCalledWith(
      'https://hermes-agent.nousresearch.com/docs/messaging/ntfy'
    )
  })

  test('опасная схема тоже уходит в main — там же и отбивается', async () => {
    // Проверка схемы живёт в `main/external-link-policy.ts` и покрыта своими
    // тестами. Дублировать её здесь значило бы завести второе место правды:
    // важно, что рендерер НИЧЕГО не решает сам и никуда не переходит.
    const bridge = createHermesDesktopBridge()

    await bridge.openExternal('file:///C:/Windows/System32/calc.exe')

    expect(openExternalLink).toHaveBeenCalledTimes(1)
  })

  test('рендерер не открывает окно сам', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const bridge = createHermesDesktopBridge()

    await bridge.openExternal('https://example.com')

    expect(open).not.toHaveBeenCalled()
  })
})
