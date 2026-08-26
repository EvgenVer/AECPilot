// Задача 5.14. У окна два обязательства, и оба — про честность перед записью.
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

import ProjectLanguagesDialog from './ProjectLanguagesDialog'

const getProjectSettings = vi.fn()
const updateProjectSettings = vi.fn()
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
  window.aecpilot = {
    getProjectSettings,
    updateProjectSettings
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
        <ProjectLanguagesDialog onClose={onClose} />
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

function choose(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

const WARNING = /полную переиндексацию/

describe('ProjectLanguagesDialog', () => {
  it('shows both project language levels with what is set now', async () => {
    await renderDialog()
    expect((screen.getByLabelText('Язык вики') as HTMLSelectElement).value).toBe('auto')
    expect((screen.getByLabelText('Язык имён в графе знаний') as HTMLSelectElement).value).toBe(
      'Russian'
    )
  })

  it('names where the other two levels live, so nobody looks for them here', async () => {
    await renderDialog()
    // Ровно та ошибка, которой это мешает: настройку, которую не нашли,
    // заводят второй раз — так и появилась D-38.
    expect(screen.getByText(/характере специалиста/)).toBeTruthy()
    expect(screen.getByText(/Оформление/)).toBeTruthy()
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
})
