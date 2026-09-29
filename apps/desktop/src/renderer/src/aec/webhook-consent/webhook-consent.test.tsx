import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'
import {
  createHermesDesktopBridge,
  WEBHOOKS_ENABLE_DECLINED
} from '../../shared/hermes-desktop-shim'

import WebhookConsentDialog from './WebhookConsentDialog'
import { $webhookConsent } from './store'

/**
 * Задача 3F.D4 (D-105). Проверяется порядок: POST включения вебхуков не уходит
 * к ядру, пока человек не согласился на перезапуск.
 */

const rest = vi.fn()

vi.mock('../../shared/gateway-bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/gateway-bridge')>()),
  gatewayBridge: () => ({ rest })
}))

const ENABLE = { path: '/api/webhooks/enable', method: 'POST' }

beforeEach(() => {
  rest.mockReset().mockResolvedValue({ restart_started: true })
  $webhookConsent.set(null)
})

afterEach(() => {
  cleanup()
  $webhookConsent.set(null)
})

function renderDialog() {
  return render(
    <AecI18nProvider>
      <WebhookConsentDialog />
    </AecI18nProvider>
  )
}

describe('согласие на перезапуск ядра при включении вебхуков', () => {
  test('пока человек не ответил, запрос не уходит', async () => {
    void createHermesDesktopBridge().api(ENABLE)

    await vi.waitFor(() => expect($webhookConsent.get()).not.toBeNull())
    expect(rest).not.toHaveBeenCalled()
  })

  test('в вопросе названа цена — перезапуск и обрыв работы', async () => {
    void createHermesDesktopBridge().api(ENABLE)
    await vi.waitFor(() => expect($webhookConsent.get()).not.toBeNull())

    renderDialog()

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/перезапустится/i)).toBeTruthy()
    expect(screen.getByText(/прервётся/i)).toBeTruthy()
  })

  test('отказ: запрос не уходит, их экран получает понятную ошибку', async () => {
    const call = createHermesDesktopBridge().api(ENABLE)
    await vi.waitFor(() => expect($webhookConsent.get()).not.toBeNull())

    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /отмена/i }))

    await expect(call).rejects.toThrow(WEBHOOKS_ENABLE_DECLINED)
    expect(rest).not.toHaveBeenCalled()
  })

  test('согласие пропускает тот же запрос, и с профилем в адресе', async () => {
    const path = '/api/webhooks/enable?profile=work'
    const call = createHermesDesktopBridge().api({ ...ENABLE, path })
    await vi.waitFor(() => expect($webhookConsent.get()).not.toBeNull())

    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /включить/i }))

    await expect(call).resolves.toEqual({ restart_started: true })
    expect(rest).toHaveBeenCalledWith(path, { method: 'POST' })
  })

  test('чтение состояния вебхуков не спрашивает', async () => {
    await createHermesDesktopBridge().api({ path: '/api/webhooks' })

    expect($webhookConsent.get()).toBeNull()
    expect(rest).toHaveBeenCalledTimes(1)
  })
})
