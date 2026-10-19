import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { Dialog, DialogContent, DialogTitle } from '../../donor/components/ui/dialog'
import { createHermesDesktopBridge, installDeclined } from '../../shared/hermes-desktop-shim'
import { AecI18nProvider } from '../../shared/i18n'

import InstallConsentDialog from './InstallConsentDialog'
import { $installConsent } from './store'

/**
 * Задача 3.8 (SPEC UR23). Проверяется не разметка, а ПОРЯДОК: до ответа
 * человека к ядру не уходит ничего, а то, что он видит перед ответом, взято у
 * ядра, а не у страницы хаба. Поэтому тест гоняет настоящий мост с подменённым
 * транспортом и смотрит, что случилось с запросом в каждом случае.
 */

const rest = vi.fn()

vi.mock('../../shared/gateway-bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/gateway-bridge')>()),
  gatewayBridge: () => ({ rest })
}))

const loadSkillDetails = vi.fn()

vi.mock('./details', () => ({
  loadSkillDetails: (identifier: string) => loadSkillDetails(identifier)
}))

const INSTALL = {
  path: '/api/skills/hub/install',
  method: 'POST',
  body: { identifier: 'nous/pdf-tools' }
}

beforeEach(() => {
  rest.mockReset().mockResolvedValue({ ok: true })
  loadSkillDetails.mockReset().mockResolvedValue({
    name: 'PDF tools',
    description: 'Читает и режет PDF',
    source: 'hub',
    trustLevel: 'community',
    tools: ['read_file', 'bash'],
    fileCount: 4
  })
  $installConsent.set(null)
})

afterEach(() => {
  // Без этого предыдущий диалог остаётся в документе, и `getByText` следующего
  // теста находит два совпадения вместо одного (или не то, что искал).
  cleanup()
  $installConsent.set(null)
})

function renderDialog() {
  return render(
    <AecI18nProvider>
      <InstallConsentDialog />
    </AecI18nProvider>
  )
}

describe('гейт доверия на установку', () => {
  test('пока человек не ответил, установка не начинается', async () => {
    const bridge = createHermesDesktopBridge()
    void bridge.api(INSTALL)

    await vi.waitFor(() => expect($installConsent.get()).not.toBeNull())
    expect(rest).not.toHaveBeenCalled()
  })

  test('до подтверждения видно, что ставится и какие инструменты просит', async () => {
    const bridge = createHermesDesktopBridge()
    void bridge.api(INSTALL)
    await vi.waitFor(() => expect($installConsent.get()).not.toBeNull())

    renderDialog()

    expect(screen.getByRole('dialog')).toBeTruthy()
    await vi.waitFor(() => expect(screen.getByText(/Читает и режет PDF/)).toBeTruthy())
    expect(screen.getByText(/read_file, bash/)).toBeTruthy()
    expect(screen.getByText(/community/)).toBeTruthy()
    // Описание берётся у ядра, а не у страницы хаба.
    expect(loadSkillDetails).toHaveBeenCalledWith('nous/pdf-tools')
  })

  test('скил без ограничения инструментов говорит об этом прямо', async () => {
    loadSkillDetails.mockResolvedValue({
      name: 'x',
      description: '',
      source: 'hub',
      trustLevel: 'community',
      tools: [],
      fileCount: 1
    })

    const bridge = createHermesDesktopBridge()
    void bridge.api(INSTALL)
    await vi.waitFor(() => expect($installConsent.get()).not.toBeNull())

    renderDialog()

    await vi.waitFor(() => expect(screen.getByText(/не ограничены/i)).toBeTruthy())
  })

  test('ядро не описало пакет — это сказано, и подтверждение всё равно нужно', async () => {
    loadSkillDetails.mockRejectedValue(new Error('нет связи'))

    const bridge = createHermesDesktopBridge()
    const call = bridge.api(INSTALL)
    await vi.waitFor(() => expect($installConsent.get()).not.toBeNull())

    renderDialog()

    await vi.waitFor(() => expect(screen.getByText(/не описало этот пакет/i)).toBeTruthy(), {
      timeout: 5000
    })
    expect(rest).not.toHaveBeenCalled()

    $installConsent.get()!.answer(false)
    await expect(call).rejects.toThrow(installDeclined())
  })

  test('согласие пропускает тот же самый запрос дальше', async () => {
    const bridge = createHermesDesktopBridge()
    const call = bridge.api(INSTALL)

    await vi.waitFor(() => expect($installConsent.get()).not.toBeNull())
    $installConsent.get()!.answer(true)

    await expect(call).resolves.toEqual({ ok: true })
    expect(rest).toHaveBeenCalledWith('/api/skills/hub/install', {
      method: 'POST',
      body: { identifier: 'nous/pdf-tools' }
    })
  })

  test('отказ — ошибка с человеческим текстом, и ничего не ставится', async () => {
    const bridge = createHermesDesktopBridge()
    const call = bridge.api(INSTALL)

    await vi.waitFor(() => expect($installConsent.get()).not.toBeNull())
    $installConsent.get()!.answer(false)

    await expect(call).rejects.toThrow(installDeclined())
    expect(rest).not.toHaveBeenCalled()
  })

  test('сервер показывает команду запуска и ИМЕНА переменных, но не значения', async () => {
    const bridge = createHermesDesktopBridge()
    void bridge.api({
      path: '/api/mcp/servers',
      method: 'POST',
      body: { name: 'local', command: 'node', args: ['server.js'], env: { API_KEY: 'sk-secret' } }
    })
    await vi.waitFor(() => expect($installConsent.get()).not.toBeNull())

    renderDialog()

    expect(screen.getByText('node server.js')).toBeTruthy()
    expect(screen.getByText(/API_KEY/)).toBeTruthy()
    expect(screen.queryByText(/sk-secret/)).toBeNull()
  })

  test('удаление скила вопросов не задаёт', async () => {
    const bridge = createHermesDesktopBridge()

    await bridge.api({ path: '/api/skills/hub/uninstall', method: 'POST', body: { name: 'x' } })

    expect($installConsent.get()).toBeNull()
    expect(rest).toHaveBeenCalledTimes(1)
  })

  test('вторая установка поверх открытого вопроса не подменяет видимый', async () => {
    const bridge = createHermesDesktopBridge()
    void bridge.api(INSTALL)
    await vi.waitFor(() => expect($installConsent.get()).not.toBeNull())

    const second = bridge.api({
      path: '/api/mcp/catalog/install',
      method: 'POST',
      body: { name: 'filesystem' }
    })

    await expect(second).rejects.toThrow(installDeclined())
    expect($installConsent.get()?.label).toBe('nous/pdf-tools')
    expect(rest).not.toHaveBeenCalled()
  })

  test('вопрос поверх их открытого модального окна виден и отвечается', async () => {
    // Замер 25.09.2026 (29.4.1): «Connect to a custom MCP» ждёт ответа со
    // спиннером, а вопрос лежал ПОД ним — их слой прячет от доступности и
    // щелчков всё вне себя. Спрятанный диалог по роли не находится.
    render(
      <AecI18nProvider>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Connect to a custom MCP</DialogTitle>
          </DialogContent>
        </Dialog>
        <InstallConsentDialog />
      </AecI18nProvider>
    )
    const bridge = createHermesDesktopBridge()
    const call = bridge.api({
      path: '/api/mcp/catalog/install',
      method: 'POST',
      body: { name: 'filesystem' }
    })
    await vi.waitFor(() => expect($installConsent.get()).not.toBeNull())

    const consent = await screen.findByRole('dialog', { name: /Добавить MCP-сервер/ })
    fireEvent.click(within(consent).getByRole('button', { name: 'Отмена' }))

    await expect(call).rejects.toThrow(installDeclined())
    expect(rest).not.toHaveBeenCalled()
  })
})
