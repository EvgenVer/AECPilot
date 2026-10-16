import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'
import {
  createHermesDesktopBridge,
  CHANNEL_ENABLE_DECLINED
} from '../../shared/hermes-desktop-shim'

import ChannelDisclosureDialog from './ChannelDisclosureDialog'
import { $channelConsent } from './store'

/**
 * Task 3.10 (AC10/R10). What is worth testing is not the markup but the ORDER:
 * nothing may reach the gateway before the person has read the list and said
 * yes. So the test drives the real bridge, with the transport stubbed, and
 * checks what happened to the request in each case.
 */

const rest = vi.fn()

// Only the singleton accessor is swapped. Replacing the whole module would
// take `GatewayBridge` with it — the donor's client class extends it through
// the `@hermes/shared` alias, and the file then fails to load at all.
vi.mock('../../shared/gateway-bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/gateway-bridge')>()),
  gatewayBridge: () => ({ rest })
}))

const ENABLE = {
  path: '/api/messaging/platforms/telegram',
  method: 'PUT',
  body: { enabled: true }
}

beforeEach(() => {
  rest.mockReset().mockResolvedValue({ ok: true })
  $channelConsent.set(null)
})

afterEach(() => {
  $channelConsent.set(null)
})

function renderDialog() {
  return render(
    <AecI18nProvider>
      <ChannelDisclosureDialog />
    </AecI18nProvider>
  )
}

describe('раскрытие перед включением канала', () => {
  test('пока человек не ответил, наружу не уходит ничего', async () => {
    const bridge = createHermesDesktopBridge()
    void bridge.api(ENABLE)

    await vi.waitFor(() => expect($channelConsent.get()).not.toBeNull())
    expect(rest).not.toHaveBeenCalled()
  })

  test('в списке названы все три последствия и сам канал', async () => {
    const bridge = createHermesDesktopBridge()
    void bridge.api(ENABLE)
    await vi.waitFor(() => expect($channelConsent.get()).not.toBeNull())

    renderDialog()

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/telegram/i)).toBeTruthy()
    // Диалог, файлы проекта, запуск снаружи — по одному пункту на каждое.
    expect(screen.getByText(/ответы агента/i)).toBeTruthy()
    expect(screen.getByText(/файлы vault/i)).toBeTruthy()
    expect(screen.getByText(/запустить его снаружи/i)).toBeTruthy()
  })

  test('согласие пропускает запрос дальше — тот же самый', async () => {
    const bridge = createHermesDesktopBridge()
    const call = bridge.api(ENABLE)

    await vi.waitFor(() => expect($channelConsent.get()).not.toBeNull())
    $channelConsent.get()!.answer(true)

    await expect(call).resolves.toEqual({ ok: true })
    expect(rest).toHaveBeenCalledWith('/api/messaging/platforms/telegram', {
      method: 'PUT',
      body: { enabled: true }
    })
  })

  test('отказ — это ошибка с человеческим текстом, и канал не включается', async () => {
    const bridge = createHermesDesktopBridge()
    const call = bridge.api(ENABLE)

    await vi.waitFor(() => expect($channelConsent.get()).not.toBeNull())
    $channelConsent.get()!.answer(false)

    await expect(call).rejects.toThrow(CHANNEL_ENABLE_DECLINED)
    expect(rest).not.toHaveBeenCalled()
  })

  test('выключение канала вопросов не задаёт', async () => {
    const bridge = createHermesDesktopBridge()

    await bridge.api({ ...ENABLE, body: { enabled: false } })

    expect($channelConsent.get()).toBeNull()
    expect(rest).toHaveBeenCalledTimes(1)
  })

  test('второй вопрос поверх открытого не подменяет видимый', async () => {
    const bridge = createHermesDesktopBridge()
    void bridge.api(ENABLE)
    await vi.waitFor(() => expect($channelConsent.get()).not.toBeNull())

    const second = bridge.api({ ...ENABLE, path: '/api/messaging/platforms/discord' })

    await expect(second).rejects.toThrow(CHANNEL_ENABLE_DECLINED)
    expect($channelConsent.get()?.platformId).toBe('telegram')
    expect(rest).not.toHaveBeenCalled()
  })
})

// D-107 (решение владельца 2026-10-01): человек отвечает «да» на вопрос,
// который должен понимать, — канал назван так же, как на его карточке.
describe('имя канала в вопросе', () => {
  test('берётся из списка каналов, который экран уже прочитал', async () => {
    const bridge = createHermesDesktopBridge()
    rest.mockResolvedValueOnce({
      platforms: [{ id: 'msgraph_webhook', name: 'Microsoft Graph', enabled: false }]
    })
    await bridge.api({ path: '/api/messaging/platforms' })
    void bridge.api({ ...ENABLE, path: '/api/messaging/platforms/msgraph_webhook' })
    await vi.waitFor(() => expect($channelConsent.get()).not.toBeNull())

    renderDialog()

    expect(screen.getAllByRole('dialog').at(-1)?.getAttribute('aria-label')).toBe(
      'Открыть канал Microsoft Graph?'
    )
  })

  test('без списка — идентификатор, как раньше', async () => {
    const bridge = createHermesDesktopBridge()
    void bridge.api({ ...ENABLE, path: '/api/messaging/platforms/unknown_channel' })
    await vi.waitFor(() => expect($channelConsent.get()).not.toBeNull())

    renderDialog()

    expect(screen.getAllByRole('dialog').at(-1)?.getAttribute('aria-label')).toBe(
      'Открыть канал unknown_channel?'
    )
  })
})
