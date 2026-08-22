// Задача 3C.1 (SPEC UR27). Экран роестра: то, что человек делает руками, должно
// доходить до главного процесса ровно тем, чем он это сделал, а отказ — быть
// видимым. Контракт — specs/agent-roster.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { RosterPanel } from './RosterPanel'
import { AecI18nProvider } from '../../shared/i18n'
import type { SpecialistView } from '../../../../shared/ipc'

function specialist(overrides: Partial<SpecialistView> = {}): SpecialistView {
  return {
    name: 'smeta',
    title: 'Смета',
    role: 'сметчик',
    description: '',
    isDefault: false,
    model: '',
    provider: '',
    face: null,
    hasAvatar: false,
    hidden: false,
    chatSessionId: '',
    preview: '',
    previewAt: '',
    ...overrides
  }
}

const listRoster = vi.fn()
const createSpecialist = vi.fn()
const saveSpecialist = vi.fn()
const duplicateSpecialist = vi.fn()
const deleteSpecialist = vi.fn()
const useProfile = vi.fn()
const selectPaths = vi.fn()
const setSpecialistAvatar = vi.fn()
const getSpecialistAvatar = vi.fn()
const getModelOptions = vi.fn()
const listSkills = vi.fn()
const listToolsets = vi.fn()
const openSpecialistChat = vi.fn()
const hideSpecialist = vi.fn()

beforeEach(() => {
  listRoster.mockResolvedValue([
    specialist(),
    specialist({ name: 'default', title: 'Агент', role: 'общий', isDefault: true }),
    specialist({ name: 'gip', title: 'ГИП', role: 'главный инженер', hidden: true })
  ])
  createSpecialist.mockResolvedValue({ ok: true, outcome: 'server' })
  saveSpecialist.mockResolvedValue({ ok: true, outcome: 'server' })
  duplicateSpecialist.mockResolvedValue({ ok: true, name: 'smeta-2' })
  deleteSpecialist.mockResolvedValue({ ok: true })
  selectPaths.mockResolvedValue(['C:/картинки/лицо.png'])
  setSpecialistAvatar.mockResolvedValue({ ok: true, outcome: 'server' })
  getSpecialistAvatar.mockResolvedValue('data:image/png;base64,AAA')
  getModelOptions.mockResolvedValue({
    providers: [
      { slug: 'openai', name: 'OpenAI', models: ['gpt-5'], authenticated: true },
      { slug: 'nokey', name: 'Без ключа', models: ['x'], authenticated: false }
    ]
  })
  listSkills.mockResolvedValue([{ name: 'aec-qa' }, { name: 'aec-docgen' }])
  openSpecialistChat.mockResolvedValue({ ok: true, sessionId: 'с-1', created: false })
  hideSpecialist.mockResolvedValue({ ok: true, outcome: 'server' })
  listToolsets.mockResolvedValue({
    toolsets: [
      { name: 'files', description: '', tool_count: 3, enabled: true, tools: [] },
      { name: 'shell', description: '', tool_count: 2, enabled: true, tools: [] }
    ]
  })

  window.aecpilot = {
    listRoster,
    createSpecialist,
    saveSpecialist,
    duplicateSpecialist,
    deleteSpecialist,
    useProfile,
    selectPaths,
    setSpecialistAvatar,
    getSpecialistAvatar,
    getModelOptions,
    listSkills,
    listToolsets,
    openSpecialistChat,
    hideSpecialist
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const renderPanel = (): ReturnType<typeof render> =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AecI18nProvider>
        <RosterPanel />
      </AecI18nProvider>
    </QueryClientProvider>
  )

describe('список', () => {
  it('показывает специалистов подписью, а не именем профиля', async () => {
    renderPanel()

    expect(await screen.findByText('Смета')).toBeTruthy()
    expect(screen.getByText('Агент')).toBeTruthy()
  })

  it('скрытые не показываются, пока не попросят', async () => {
    renderPanel()

    await screen.findByText('Смета')
    expect(screen.queryByText('ГИП')).toBeNull()

    fireEvent.click(screen.getByLabelText('Показать скрытых'))

    expect(await screen.findByText('ГИП')).toBeTruthy()
  })

  it('поиск идёт по роли тоже', async () => {
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.change(screen.getByLabelText('Поиск по имени или роли'), {
      target: { value: 'сметчик' }
    })

    expect(screen.getByText('Смета')).toBeTruthy()
    expect(screen.queryByText('Агент')).toBeNull()
  })

  it('щелчок по специалисту переводит на него новые сессии и открывает его чат', async () => {
    renderPanel()

    fireEvent.click(await screen.findByText('Смета'))

    expect(useProfile).toHaveBeenCalledWith('smeta')
    await waitFor(() => expect(openSpecialistChat).toHaveBeenCalledWith({ name: 'smeta', pin: '' }))
  })

  it('известная привязка уходит вместе с просьбой — ядру меньше работы', async () => {
    listRoster.mockResolvedValue([specialist({ chatSessionId: 'с-7' })])
    renderPanel()

    fireEvent.click(await screen.findByText('Смета'))

    await waitFor(() =>
      expect(openSpecialistChat).toHaveBeenCalledWith({ name: 'smeta', pin: 'с-7' })
    )
  })
})

describe('создание и правка', () => {
  it('новый специалист уходит в главный процесс полями формы', async () => {
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getByLabelText('Новый специалист'))
    fireEvent.change(screen.getByLabelText(/Имя профиля/), { target: { value: 'norm' } })
    fireEvent.change(screen.getByLabelText('Имя на экране'), {
      target: { value: 'Нормоконтроль' }
    })
    fireEvent.change(screen.getByLabelText('Роль'), { target: { value: 'проверка' } })
    fireEvent.click(screen.getByText('Сохранить'))

    await waitFor(() =>
      expect(createSpecialist).toHaveBeenCalledWith({
        name: 'norm',
        title: 'Нормоконтроль',
        role: 'проверка',
        description: ''
      })
    )
  })

  it('негодное имя не даёт сохранить — и говорит правило', async () => {
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getByLabelText('Новый специалист'))
    fireEvent.change(screen.getByLabelText(/Имя профиля/), { target: { value: '../побег' } })

    expect(screen.getByText(/Латинские буквы/)).toBeTruthy()
    expect((screen.getByText('Сохранить') as HTMLButtonElement).disabled).toBe(true)
  })

  it('правка существующего имени профиля не предлагает', async () => {
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getAllByLabelText('Изменить')[0])

    expect(screen.getByText(/имя остаётся как есть/)).toBeTruthy()
    expect(screen.queryByLabelText(/Имя профиля/)).toBeNull()
  })

  it('старое ядро — «сохранено только здесь», а не молчание', async () => {
    saveSpecialist.mockResolvedValue({ ok: true, outcome: 'local-only' })
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getAllByLabelText('Изменить')[0])
    fireEvent.click(screen.getByText('Сохранить'))

    expect(await screen.findByText(/только на этой машине/)).toBeTruthy()
  })

  it('отказ виден человеку', async () => {
    saveSpecialist.mockResolvedValue({ ok: false, error: 'ядро отказало' })
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getAllByLabelText('Изменить')[0])
    fireEvent.click(screen.getByText('Сохранить'))

    expect(await screen.findByText('ядро отказало')).toBeTruthy()
  })
})

describe('дубль и удаление', () => {
  it('дубль просит главный процесс, а имя копии придумывает он', async () => {
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getAllByLabelText('Дублировать')[0])

    await waitFor(() => expect(duplicateSpecialist).toHaveBeenCalledWith('smeta'))
  })

  it('у специалиста по умолчанию кнопки удаления нет вовсе', async () => {
    renderPanel()
    await screen.findByText('Агент')

    // Две строки, кнопка удаления одна — у той, которую удалять можно.
    expect(screen.getAllByLabelText('Удалить')).toHaveLength(1)
  })

  it('удаление спрашивает ИМЕНЕМ и без подтверждения не идёт', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getByLabelText('Удалить'))

    expect(confirm.mock.calls[0][0]).toContain('Смета')
    expect(deleteSpecialist).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByLabelText('Удалить'))

    await waitFor(() =>
      expect(deleteSpecialist).toHaveBeenCalledWith({ name: 'smeta', confirmed: true })
    )
    confirm.mockRestore()
  })
})

// Задача 3C.3. Лицо: форма и цвет либо картинка. Питомца и генерации портрета
// в выборе нет — это отдельным тестом (`no-portrait-generation`), потому что
// проверяется ОТСУТСТВИЕ, а его на экране не видно.
describe('лицо специалиста', () => {
  it('форма и цвет уходят в те же поля, что и остальная правка', async () => {
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getAllByLabelText('Изменить')[0])
    fireEvent.click(screen.getByLabelText('hex'))
    fireEvent.click(screen.getByLabelText('#22A06B'))
    fireEvent.click(screen.getByText('Сохранить'))

    await waitFor(() =>
      expect(saveSpecialist).toHaveBeenCalledWith(
        expect.objectContaining({ face: { shape: 'hex', color: '#22A06B' } })
      )
    )
  })

  it('лицо можно убрать', async () => {
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getAllByLabelText('Изменить')[0])
    fireEvent.click(screen.getByLabelText('circle'))
    fireEvent.click(screen.getByLabelText('Без лица'))
    fireEvent.click(screen.getByText('Сохранить'))

    await waitFor(() =>
      expect(saveSpecialist).toHaveBeenCalledWith(expect.objectContaining({ face: null }))
    )
  })

  it('картинка выбирается диалогом главного процесса и уходит отдельно', async () => {
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getAllByLabelText('Изменить')[0])
    fireEvent.click(screen.getByText('Картинкой'))

    await waitFor(() =>
      expect(setSpecialistAvatar).toHaveBeenCalledWith({
        name: 'smeta',
        filePath: 'C:/картинки/лицо.png'
      })
    )
    expect(saveSpecialist, 'картинка не едет через форму — она тяжёлая').not.toHaveBeenCalled()
  })

  it('отменённый диалог ничего не меняет', async () => {
    selectPaths.mockResolvedValue([])
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getAllByLabelText('Изменить')[0])
    fireEvent.click(screen.getByText('Картинкой'))

    await waitFor(() => expect(selectPaths).toHaveBeenCalled())
    expect(setSpecialistAvatar).not.toHaveBeenCalled()
  })

  it('у нового специалиста картинки не предлагают — профиля ещё нет', async () => {
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getByLabelText('Новый специалист'))

    expect(screen.queryByText('Картинкой')).toBeNull()
  })
})

// Задача 3C.2. Расширенные возможности живут за одной кнопкой: человеку с одним
// специалистом они не нужны, а тому, кто их ищет, — нужны все сразу.
describe('расширенные возможности', () => {
  async function openAdvanced(): Promise<void> {
    renderPanel()
    await screen.findByText('Смета')
    fireEvent.click(screen.getAllByLabelText('Изменить')[0])
    fireEvent.click(screen.getByText('Возможности'))
  }

  it('модель выбирается парой провайдер+модель', async () => {
    await openAdvanced()

    // Ждём именно ВАРИАНТ, а не поле: список моделей приходит запросом, а
    // выбор значения, которого в списке ещё нет, jsdom молча проглатывает.
    await screen.findByText(/OpenAI/)
    fireEvent.change(screen.getByLabelText('Модель'), { target: { value: 'openai gpt-5' } })
    fireEvent.click(screen.getByText('Сохранить'))

    await waitFor(() =>
      expect(saveSpecialist).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'openai', model: 'gpt-5' })
      )
    )
  })

  it('провайдер без доступов не предлагается — иначе специалист не ответит ни разу', async () => {
    await openAdvanced()

    await screen.findByLabelText('Модель')
    expect(screen.queryByText(/Без ключа/)).toBeNull()
  })

  it('выключенный скил уходит замещающим списком', async () => {
    await openAdvanced()

    fireEvent.click(await screen.findByLabelText('aec-qa'))
    fireEvent.click(screen.getByText('Сохранить'))

    await waitFor(() =>
      expect(saveSpecialist).toHaveBeenCalledWith(
        expect.objectContaining({ disabledSkills: ['aec-qa'] })
      )
    )
  })

  it('первый снятый набор инструментов превращает «все» в явный список', async () => {
    await openAdvanced()

    fireEvent.click(await screen.findByLabelText('shell'))
    fireEvent.click(screen.getByText('Сохранить'))

    await waitFor(() =>
      expect(saveSpecialist).toHaveBeenCalledWith(
        expect.objectContaining({ enabledToolsets: ['files'] })
      )
    )
  })

  it('неприменённый раздел назван по имени, а не спрятан за «не удалось»', async () => {
    saveSpecialist.mockResolvedValue({ ok: false, failed: ['model'] })
    await openAdvanced()

    fireEvent.click(screen.getByText('Сохранить'))

    expect(await screen.findByText(/Не применилось: model/)).toBeTruthy()
  })

  it('клонировать можно только при создании', async () => {
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getAllByLabelText('Изменить')[0])
    expect(screen.queryByLabelText('Клонировать с')).toBeNull()

    fireEvent.click(screen.getByText('Отмена'))
    fireEvent.click(screen.getByLabelText('Новый специалист'))

    expect(screen.getByLabelText('Клонировать с')).toBeTruthy()
  })
})

// Задача 3C.8. Скрытый специалист продолжает работать: скрытие — это только про
// место в списке, а не про то, отвечает ли он.
describe('скрытие', () => {
  it('скрывает по кнопке и говорит ядру именно это', async () => {
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getAllByLabelText('Скрыть из списка')[0])

    await waitFor(() =>
      expect(hideSpecialist).toHaveBeenCalledWith({ name: 'smeta', hidden: true })
    )
  })

  it('скрытого возвращает та же кнопка с другой подписью', async () => {
    renderPanel()
    await screen.findByText('Смета')

    fireEvent.click(screen.getByLabelText('Показать скрытых'))
    fireEvent.click(await screen.findByLabelText('Вернуть в список'))

    await waitFor(() => expect(hideSpecialist).toHaveBeenCalledWith({ name: 'gip', hidden: false }))
  })

  it('кнопка «показать скрытых» появляется только когда скрытые есть', async () => {
    listRoster.mockResolvedValue([specialist()])
    renderPanel()
    await screen.findByText('Смета')

    expect(screen.queryByLabelText('Показать скрытых')).toBeNull()
  })
})
