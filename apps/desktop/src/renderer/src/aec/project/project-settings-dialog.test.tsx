// Задача 5.14 (языки) и находка D-57 (интервал и модель эмбеддингов).
//
// У окна два обязательства, и оба — про честность перед записью.
//
// Первое: смена языка графа стоит полной переиндексации, и человек должен
// узнать об этом ДО записи, а не после (находка D-38). Значит предупреждение
// показывается на изменении поля, а не на ошибке при следующем открытии графа.
//
// Второе: у языка вики такой цены нет, и требовать за него подтверждение
// значило бы приучить нажимать «да» не глядя — тогда первое обязательство
// перестанет работать.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'
import type { ProjectSettingsPayload } from '../../../../shared/ipc'

import ProjectSettingsDialog from './ProjectSettingsDialog'

const getProjectSettings = vi.fn()
const updateProjectSettings = vi.fn()
const getAgentLanguage = vi.fn()
const setAgentLanguage = vi.fn()
const onClose = vi.fn()

const SETTINGS: ProjectSettingsPayload = {
  wiki_lang: 'auto',
  scan_interval_s: 300,
  embedding_model: '',
  extraction_language: 'Russian'
}

beforeEach(() => {
  window.localStorage.clear()
  getProjectSettings.mockResolvedValue(SETTINGS)
  updateProjectSettings.mockResolvedValue({ ok: true, settings: SETTINGS })
  getAgentLanguage.mockResolvedValue({ language: '' })
  setAgentLanguage.mockImplementation((language: string) => Promise.resolve({ language }))
  window.aecpilot = {
    getProjectSettings,
    updateProjectSettings,
    getAgentLanguage,
    setAgentLanguage
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function renderDialog(): Promise<void> {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AecI18nProvider>
        <ProjectSettingsDialog onClose={onClose} />
      </AecI18nProvider>
    </QueryClientProvider>
  )
  await waitFor(() => expect(screen.getByLabelText('Язык вики')).toBeTruthy())
}

/** Ищет кнопку по подписи — «Сохранить» есть и в общем каталоге, поэтому
 * нужна именно кнопка действия, а не любой узел с этим текстом. */
function button(label: string): HTMLElement {
  return screen
    .getAllByRole('button')
    .find((node) => node.textContent?.trim() === label) as HTMLElement
}

function choose(label: RegExp | string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

const WARNING = /полную переиндексацию/

describe('ProjectSettingsDialog', () => {
  it('shows both project language levels with what is set now', async () => {
    await renderDialog()
    expect((screen.getByLabelText('Язык вики') as HTMLSelectElement).value).toBe('auto')
    expect((screen.getByLabelText('Язык имён в графе знаний') as HTMLSelectElement).value).toBe(
      'Russian'
    )
  })

  it('names where the fourth level lives, so nobody looks for it here', async () => {
    await renderDialog()
    // Ровно та ошибка, которой это мешает: настройку, которую не нашли,
    // заводят второй раз — так и появилась D-38.
    expect(screen.getByText(/Оформление/)).toBeTruthy()
  })

  // --- Третий уровень G7: язык ответов агента (решение владельца 2026-09-08) -

  it('shows the agent reply language as a field of its own, not as a note', async () => {
    getAgentLanguage.mockResolvedValue({ language: 'ru' })
    await renderDialog()
    await waitFor(() =>
      expect((screen.getByLabelText('Язык ответов агента') as HTMLSelectElement).value).toBe('ru')
    )
  })

  it('says whose setting it is — the user’s, not the project’s', async () => {
    // Поле стоит рядом с проектными, и без этой подписи соседство читалось бы
    // как «настройка этого проекта».
    await renderDialog()
    expect(screen.getByText(/Ваш, а не проекта/)).toBeTruthy()
  })

  it('writes the agent language without touching project settings', async () => {
    await renderDialog()
    choose('Язык ответов агента', 'en')
    await act(async () => {
      button('Сохранить').click()
    })

    await waitFor(() => expect(setAgentLanguage).toHaveBeenCalledWith('en'))
    // Проектных правок не было — в project.json лезть незачем.
    expect(updateProjectSettings).not.toHaveBeenCalled()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('does not demand a second press for it — it costs nothing', async () => {
    await renderDialog()
    choose('Язык ответов агента', 'ru')
    await act(async () => {
      button('Сохранить').click()
    })

    await waitFor(() => expect(setAgentLanguage).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('lets «not set» be chosen back — the empty value is a legitimate answer', async () => {
    getAgentLanguage.mockResolvedValue({ language: 'ru' })
    await renderDialog()
    await waitFor(() =>
      expect((screen.getByLabelText('Язык ответов агента') as HTMLSelectElement).value).toBe('ru')
    )
    choose('Язык ответов агента', '')
    await act(async () => {
      button('Сохранить').click()
    })

    await waitFor(() => expect(setAgentLanguage).toHaveBeenCalledWith(''))
  })

  it('says nothing about re-indexing while nothing has changed', async () => {
    await renderDialog()
    expect(screen.queryByText(WARNING)).toBeNull()
    expect(button('Сохранить').hasAttribute('disabled')).toBe(true)
  })

  it('warns about the re-index the moment the graph language changes, before any write', async () => {
    await renderDialog()
    choose('Язык имён в графе знаний', 'English')

    await waitFor(() => expect(screen.getByText(WARNING)).toBeTruthy())
    expect(updateProjectSettings).not.toHaveBeenCalled()
  })

  it('does not write on the first press — the first press is the warning', async () => {
    await renderDialog()
    choose('Язык имён в графе знаний', 'English')
    await act(async () => {
      button('Сохранить').click()
    })

    expect(updateProjectSettings).not.toHaveBeenCalled()
    // Кнопка сменила подпись: согласие теперь называется своим последствием.
    await waitFor(() => expect(button('Сменить и переиндексировать')).toBeTruthy())
  })

  it('writes only the changed field once the consequence is accepted', async () => {
    await renderDialog()
    choose('Язык имён в графе знаний', 'English')
    await act(async () => {
      button('Сохранить').click()
    })
    await act(async () => {
      button('Сменить и переиндексировать').click()
    })

    expect(updateProjectSettings).toHaveBeenCalledTimes(1)
    // Язык вики не трогали — его в патче быть не должно, иначе запись
    // «подтвердит» значение, которого человек не выбирал.
    expect(updateProjectSettings).toHaveBeenCalledWith({ extractionLanguage: 'English' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('lets the wiki language through on the first press — it costs nothing', async () => {
    await renderDialog()
    choose('Язык вики', 'en')
    await act(async () => {
      button('Сохранить').click()
    })

    expect(updateProjectSettings).toHaveBeenCalledWith({ wikiLang: 'en' })
    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('keeps the dialog open and shows why when main refuses', async () => {
    updateProjectSettings.mockResolvedValue({ ok: false, error: 'project.json только для чтения' })
    await renderDialog()
    choose('Язык вики', 'ru')
    await act(async () => {
      button('Сохранить').click()
    })

    await waitFor(() => expect(screen.getByText('project.json только для чтения')).toBeTruthy())
    expect(onClose).not.toHaveBeenCalled()
  })

  // --- Находка D-57: два поля, у которых не было экрана вовсе ---------------

  it('shows the scan interval in minutes, not in the seconds it is stored in', async () => {
    // 300 секунд на диске — пять минут человеку. Поле в секундах приглашает
    // вписать туда 5, и обход папок пойдёт раз в пять секунд.
    await renderDialog()
    expect((screen.getByLabelText(/Как часто проверять источники/) as HTMLInputElement).value).toBe(
      '5'
    )
  })

  it('writes the interval back in seconds', async () => {
    await renderDialog()
    choose(/Как часто проверять источники/, '15')
    await act(async () => {
      button('Сохранить').click()
    })

    expect(updateProjectSettings).toHaveBeenCalledWith({ scanIntervalS: 900 })
  })

  it('does not demand a second press for the interval — it costs nothing', async () => {
    // Требовать подтверждение за безобидное изменение значит приучить нажимать
    // «да» не глядя, и тогда перестанут работать те два, где цена настоящая.
    await renderDialog()
    choose(/Как часто проверять источники/, '10')
    await act(async () => {
      button('Сохранить').click()
    })

    expect(updateProjectSettings).toHaveBeenCalledTimes(1)
  })

  it('refuses an interval below a minute instead of writing it', async () => {
    await renderDialog()
    choose(/Как часто проверять источники/, '0')
    await act(async () => {
      button('Сохранить').click()
    })

    await waitFor(() => expect(screen.getByText(/не может быть меньше минуты/)).toBeTruthy())
    expect(updateProjectSettings).not.toHaveBeenCalled()
  })

  it('warns about the re-index the moment the embedding model changes', async () => {
    // Та же цена, что у языка графа: `check_compatible` откажется открыть
    // индекс, построенный другой моделью, — векторы разных моделей несравнимы.
    await renderDialog()
    choose(/Модель эмбеддингов/, 'bge-m3')

    await waitFor(() => expect(screen.getByText(/полную переиндексацию/)).toBeTruthy())
    expect(updateProjectSettings).not.toHaveBeenCalled()
  })

  it('writes the embedding model only on the second press', async () => {
    await renderDialog()
    choose(/Модель эмбеддингов/, 'bge-m3')
    await act(async () => {
      button('Сохранить').click()
    })
    expect(updateProjectSettings).not.toHaveBeenCalled()

    await act(async () => {
      button('Сменить и переиндексировать').click()
    })
    expect(updateProjectSettings).toHaveBeenCalledWith({ embeddingModel: 'bge-m3' })
  })

  it('an empty embedding model is legal — it means «as the core has it»', async () => {
    getProjectSettings.mockResolvedValue({ ...SETTINGS, embedding_model: 'bge-m3' })
    await renderDialog()
    choose(/Модель эмбеддингов/, '')
    await act(async () => {
      button('Сохранить').click()
    })
    await act(async () => {
      button('Сменить и переиндексировать').click()
    })

    expect(updateProjectSettings).toHaveBeenCalledWith({ embeddingModel: '' })
  })
})
