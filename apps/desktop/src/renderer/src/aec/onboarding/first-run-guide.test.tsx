import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'

import FirstRunGuide from './FirstRunGuide'
import { GUIDE_STORAGE_KEY, readGuideMemory } from './onboarding-pure'

/**
 * Task 3.20. Мастер ведёт человека без терминала до первого ответа, поэтому
 * проверяется не разметка, а три вещи, которые ломают сценарий:
 *   — какой шаг объявлен текущим при данных фактах,
 *   — что делает единственная кнопка этого шага,
 *   — что закрытый мастер больше не стоит ни одного запроса к ядру.
 *
 * Мост до их сторов замокан целиком: он тянет их клиент шлюза, и импорт ради
 * двух функций стоил бы минуту (D-31).
 */

const openProviderSetup = vi.fn()
const fillComposer = vi.fn()

vi.mock('./bridge', () => ({
  openProviderSetup: (): void => openProviderSetup(),
  fillComposer: (text: string): void => fillComposer(text),
  onProviderConfigured: (): (() => void) => () => {}
}))

const api = {
  getCurrentProject: vi.fn(),
  checkRuntime: vi.fn(),
  getModelOptions: vi.fn(),
  listSources: vi.fn(),
  getIndexStatus: vi.fn(),
  getIngestState: vi.fn(),
  onIngestState: vi.fn(),
  pickProjectDirectory: vi.fn(),
  addSource: vi.fn(),
  startIngest: vi.fn()
}

const VAULT = 'C:/projects/site-x'

beforeEach(() => {
  window.localStorage.clear()
  for (const fn of Object.values(api)) fn.mockReset()

  api.getCurrentProject.mockResolvedValue({ name: 'Объект-X', vaultPath: VAULT })
  api.checkRuntime.mockResolvedValue({ ok: false, error: 'нет ключа' })
  api.getModelOptions.mockResolvedValue({})
  api.listSources.mockResolvedValue([])
  api.getIndexStatus.mockResolvedValue({ ok: true, status: { files_indexed: 0 } })
  api.getIngestState.mockResolvedValue({
    error: null,
    lastReport: null,
    progress: null,
    running: false
  })
  api.onIngestState.mockReturnValue(() => {})

  window.aecpilot = api as unknown as typeof window.aecpilot
})

afterEach(() => {
  // Явно: автоочистка @testing-library здесь не включена, и оставленное
  // предыдущим тестом дерево ловится следующим `findByText` — на этом тест
  // «последний шаг» один раз уже соврал.
  cleanup()
  delete (window as { aecpilot?: unknown }).aecpilot
})

function mount(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AecI18nProvider>
        <FirstRunGuide />
      </AecI18nProvider>
    </QueryClientProvider>
  )
}

describe('мастер первого запуска', () => {
  // D-118: корень рендерера общий у всех окон — в полосе быстрого ввода панель
  // закрывала собой всё.
  test('в полосе быстрого ввода (?win=hud) мастера нет — и о проекте он не спрашивает', async () => {
    window.history.replaceState(null, '', '/?win=hud')
    try {
      mount()
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(screen.queryByRole('region')).toBeNull()
      expect(api.getCurrentProject).not.toHaveBeenCalled()
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

  test('без ключа текущий шаг — провайдер, и кнопка открывает их экран', async () => {
    mount()

    await screen.findByText('Подключить провайдера')
    fireEvent.click(screen.getByText('Подключить провайдера'))

    expect(openProviderSetup).toHaveBeenCalledTimes(1)
  })

  test('когда ключ и модель есть, мастер доходит до папки с документами', async () => {
    api.checkRuntime.mockResolvedValue({ ok: true })
    api.getModelOptions.mockResolvedValue({ model: 'gpt-5' })

    mount()

    await screen.findByText('Подключить папку')
    // Необязательный шаг — значит рядом стоит «Позже».
    expect(screen.getByText('Позже')).toBeTruthy()
  })

  test('отказ от папки уносит индексацию и приводит к вопросу', async () => {
    api.checkRuntime.mockResolvedValue({ ok: true })
    api.getModelOptions.mockResolvedValue({ model: 'gpt-5' })

    mount()

    fireEvent.click(await screen.findByText('Позже'))

    // Индексировать нечего — следующим стоит вопрос, а не кнопка, которая
    // ничего не сделает.
    await screen.findByText('Подставить вопрос')
    expect(readGuideMemory(window.localStorage.getItem(GUIDE_STORAGE_KEY), VAULT).skipped).toEqual([
      'sources'
    ])
  })

  test('последний шаг кладёт вопрос в поле ввода, а не отправляет его', async () => {
    api.checkRuntime.mockResolvedValue({ ok: true })
    api.getModelOptions.mockResolvedValue({ model: 'gpt-5' })
    api.listSources.mockResolvedValue([{ id: 's1', root_path: 'C:/docs', added_at: '' }])
    api.getIndexStatus.mockResolvedValue({ ok: true, status: { files_indexed: 12 } })

    mount()

    fireEvent.click(await screen.findByText('Подставить вопрос'))

    expect(fillComposer).toHaveBeenCalledWith(
      'Перечисли документы, которые ты видишь в подключённых источниках, и скажи, о чём каждый.'
    )
    // Отправка — за человеком: сессия принадлежит их экрану.
    expect(api.startIngest).not.toHaveBeenCalled()
  })

  test('без подключённых источников подставляется другой вопрос', async () => {
    api.checkRuntime.mockResolvedValue({ ok: true })
    api.getModelOptions.mockResolvedValue({ model: 'gpt-5' })
    window.localStorage.setItem(
      GUIDE_STORAGE_KEY,
      JSON.stringify({ [VAULT]: { asked: false, closed: false, skipped: ['sources'] } })
    )

    mount()

    fireEvent.click(await screen.findByText('Подставить вопрос'))

    expect(fillComposer).toHaveBeenCalledWith(
      'Что ты умеешь делать в этом проекте и что тебе нужно от меня, чтобы отвечать по документам?'
    )
  })

  test('пройденный мастер закрывается сам и на следующем запуске ничего не спрашивает', async () => {
    api.checkRuntime.mockResolvedValue({ ok: true })
    api.getModelOptions.mockResolvedValue({ model: 'gpt-5' })
    api.listSources.mockResolvedValue([{ id: 's1', root_path: 'C:/docs', added_at: '' }])
    api.getIndexStatus.mockResolvedValue({ ok: true, status: { files_indexed: 12 } })

    mount()
    fireEvent.click(await screen.findByText('Подставить вопрос'))

    await waitFor(() =>
      expect(readGuideMemory(window.localStorage.getItem(GUIDE_STORAGE_KEY), VAULT).closed).toBe(
        true
      )
    )

    // Второй запуск: панели нет — и ни один факт не перечитывается.
    cleanup()
    api.checkRuntime.mockClear()
    api.listSources.mockClear()
    mount()

    await waitFor(() => expect(api.getCurrentProject).toHaveBeenCalled())
    expect(screen.queryByText('С чего начать')).toBeNull()
    expect(api.checkRuntime).not.toHaveBeenCalled()
    expect(api.listSources).not.toHaveBeenCalled()
  })

  test('подключение папки идёт через системный диалог и предупреждение не проглатывается', async () => {
    api.checkRuntime.mockResolvedValue({ ok: true })
    api.getModelOptions.mockResolvedValue({ model: 'gpt-5' })
    api.pickProjectDirectory.mockResolvedValue('C:/docs')
    api.addSource.mockResolvedValue({ needsConfirm: ['папка пересекается с уже подключённой'] })

    mount()
    fireEvent.click(await screen.findByText('Подключить папку'))

    await screen.findByText('папка пересекается с уже подключённой')
    expect(api.addSource).toHaveBeenCalledWith('C:/docs', false)

    fireEvent.click(screen.getByText('Подключить всё равно'))
    expect(api.addSource).toHaveBeenCalledWith('C:/docs', true)
  })
})
