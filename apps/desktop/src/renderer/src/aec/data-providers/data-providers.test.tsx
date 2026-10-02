// Задача 3G.47 (D-172) — что окно «Индекс и память» делает руками человека.
//
// Проверяется не вид, а договор: по умолчанию одна строка на RAG и память; память
// разводится отдельным флажком; сохраняется выбор в форме файла профиля; ключ
// выбранного провайдера уходит в наше шифрованное хранилище, а не в выбор; агент
// по подписке назван словами. Задача 3G.52: модели — из списка провайдера по
// кнопке, смена эмбеддингов спрашивается до записи.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'
import type { DataProvidersState } from '../../../../shared/ipc'

import DataProvidersDialog from './DataProvidersDialog'
import { $dataProviders, $dataProvidersOpen, EMPTY_STATE } from './store'

const saveDataProviders = vi.fn()
const getDataProviders = vi.fn()
const saveProviderKey = vi.fn()
const listDataModels = vi.fn()

function state(patch: Partial<DataProvidersState> = {}): DataProvidersState {
  return {
    encryptionAvailable: true,
    profileRead: true,
    agentProvider: 'gemini',
    choice: { rag: { provider: 'agent' }, memory: { provider: 'rag' } },
    presets: [
      {
        id: 'gemini',
        keyEnvVar: 'GEMINI_API_KEY',
        embedding: 'gemini-embedding-2',
        extraction: 'gemini-3.8-flash',
        memoryLlm: 'gemini-3.5-flash-lite',
        memoryEmbedding: 'gemini-embedding-2'
      },
      {
        id: 'openai-api',
        keyEnvVar: 'OPENAI_API_KEY',
        embedding: 'text-embedding-3-large',
        extraction: 'gpt-5-mini',
        memoryLlm: 'gpt-5-mini',
        memoryEmbedding: 'text-embedding-3-small'
      }
    ],
    keys: [
      { envOverrides: false, envVar: 'GEMINI_API_KEY', hasKey: false },
      { envOverrides: false, envVar: 'OPENAI_API_KEY', hasKey: true }
    ],
    rag: { ok: true },
    memory: { ok: true },
    ...patch
  }
}

function show(): void {
  render(
    <AecI18nProvider>
      <DataProvidersDialog />
    </AecI18nProvider>
  )
}

beforeEach(() => {
  saveDataProviders.mockResolvedValue({ ok: true })
  saveProviderKey.mockResolvedValue({ ok: true, restarted: true })
  getDataProviders.mockResolvedValue(state())
  $dataProviders.set(state())
  $dataProvidersOpen.set(true)
  window.aecpilot = {
    getDataProviders,
    listDataModels,
    saveDataProviders,
    saveProviderKey
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  $dataProvidersOpen.set(false)
  $dataProviders.set(EMPTY_STATE)
})

describe('окно «Индекс и память»', () => {
  it('по умолчанию одна строка на RAG и память — «как у агента»', () => {
    show()
    const rag = screen.getByLabelText('Поиск по документам (RAG)') as HTMLSelectElement
    expect(rag.value).toBe('agent')
    expect(screen.queryByLabelText('Долговременная память')).toBeNull()
    expect(
      (screen.getByLabelText('Отдельный провайдер для памяти') as HTMLInputElement).checked
    ).toBe(false)
  })

  it('флажок разводит память в свою строку, и сохраняется выбор в форме файла', async () => {
    show()
    fireEvent.click(screen.getByLabelText('Отдельный провайдер для памяти'))
    fireEvent.change(screen.getByLabelText('Долговременная память'), {
      target: { value: 'openai-api' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить выбор' }))
    await waitFor(() =>
      expect(saveDataProviders).toHaveBeenCalledWith(
        {
          rag: { provider: 'agent' },
          memory: { provider: 'openai-api' }
        },
        false
      )
    )
    await screen.findByText(/Сохранено/)
  })

  it('у выбранного провайдера без ключа есть поле ключа, и ключ уходит в хранилище, а не в выбор', async () => {
    show()
    fireEvent.change(screen.getByLabelText('Поиск по документам (RAG)'), {
      target: { value: 'gemini' }
    })
    expect(screen.getByLabelText('Модель эмбеддингов').getAttribute('placeholder')).toBe(
      'gemini-embedding-2'
    )
    expect(screen.getByLabelText('Модель разбора документов').getAttribute('placeholder')).toBe(
      'gemini-3.8-flash'
    )
    const field = screen.getByLabelText('GEMINI_API_KEY')
    fireEvent.change(field, { target: { value: 'k-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить ключ' }))
    await waitFor(() =>
      expect(saveProviderKey).toHaveBeenCalledWith({ envVar: 'GEMINI_API_KEY', key: 'k-123' })
    )
    expect(saveDataProviders).not.toHaveBeenCalled()
  })

  it('свой адрес просит адрес, имя переменной и модели', async () => {
    show()
    fireEvent.change(screen.getByLabelText('Поиск по документам (RAG)'), {
      target: { value: 'custom' }
    })
    fireEvent.change(screen.getByLabelText('Адрес (base_url)'), {
      target: { value: 'http://lab/v1' }
    })
    fireEvent.change(screen.getByLabelText('Имя переменной ключа'), {
      target: { value: 'LAB_KEY' }
    })
    fireEvent.change(screen.getByLabelText('Модель эмбеддингов'), { target: { value: 'e5' } })
    fireEvent.change(screen.getByLabelText('Модель разбора документов'), {
      target: { value: 'qwen' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить выбор' }))
    await waitFor(() =>
      expect(saveDataProviders).toHaveBeenCalledWith(
        {
          rag: {
            provider: 'custom',
            base_url: 'http://lab/v1',
            key_env: 'LAB_KEY',
            embedding: 'e5',
            extraction: 'qwen'
          },
          memory: { provider: 'rag' }
        },
        false
      )
    )
  })

  it('агент по подписке назван словами, и причина отказа видна', () => {
    $dataProviders.set(
      state({
        agentProvider: 'openai-codex',
        rag: { ok: false, reason: 'агент работает через «openai-codex» — …' },
        memory: { ok: false, reason: 'агент работает через «openai-codex» — …' }
      })
    )
    show()
    expect(screen.getByText(/Агент работает по подписке/)).toBeTruthy()
    expect(screen.getAllByText(/агент работает через «openai-codex»/)).toHaveLength(2)
  })

  it('отказ сохранения виден словами', async () => {
    saveDataProviders.mockResolvedValue({ ok: false, error: 'файл выбора не записался' })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить выбор' }))
    await screen.findByText('файл выбора не записался')
  })

  it('список моделей провайдера приходит подсказками к полям модели', async () => {
    listDataModels.mockResolvedValue({
      ok: true,
      models: ['gemini-embedding-2', 'gemini-3.8-flash']
    })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Список моделей' }))
    await screen.findByText('Моделей в списке: 2')
    expect(listDataModels).toHaveBeenCalledWith(
      { rag: { provider: 'agent' }, memory: { provider: 'rag' } },
      'rag'
    )
    const list = document.getElementById('data-models-rag')
    expect([...(list?.querySelectorAll('option') ?? [])].map((o) => o.value)).toEqual([
      'gemini-embedding-2',
      'gemini-3.8-flash'
    ])
    expect(screen.getByLabelText('Модель эмбеддингов').getAttribute('list')).toBe('data-models-rag')
  })

  it('провайдер не дал списка — отказ словами, поле остаётся для ввода руками', async () => {
    listDataModels.mockResolvedValue({ ok: false, error: 'провайдер ответил 401' })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Список моделей' }))
    await screen.findByText('Списка нет: провайдер ответил 401. Впишите модель сами.')
    fireEvent.change(screen.getByLabelText('Модель эмбеддингов'), { target: { value: 'my-embed' } })
    expect((screen.getByLabelText('Модель эмбеддингов') as HTMLInputElement).value).toBe('my-embed')
  })

  it('смена эмбеддингов — вопрос до записи, запись только после «Сохранить всё равно»', async () => {
    saveDataProviders
      .mockResolvedValueOnce({ ok: false, warnings: ['Индекс проекта построен моделью «a»'] })
      .mockResolvedValueOnce({ ok: true })
    show()
    fireEvent.change(screen.getByLabelText('Поиск по документам (RAG)'), {
      target: { value: 'openai-api' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить выбор' }))
    await screen.findByText('Индекс проекта построен моделью «a»')
    expect(screen.queryByText(/Сохранено/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить всё равно' }))
    await screen.findByText(/Сохранено/)
    expect(saveDataProviders).toHaveBeenLastCalledWith(
      { rag: { provider: 'openai-api' }, memory: { provider: 'rag' } },
      true
    )
  })

  it('у памяти свой адрес — адрес, переменная и модели памяти едут в выбор', async () => {
    show()
    fireEvent.click(screen.getByLabelText('Отдельный провайдер для памяти'))
    fireEvent.change(screen.getByLabelText('Долговременная память'), {
      target: { value: 'custom' }
    })
    fireEvent.change(screen.getByLabelText('Адрес (base_url)'), {
      target: { value: 'http://lab/v1' }
    })
    fireEvent.change(screen.getByLabelText('Имя переменной ключа'), {
      target: { value: 'lab_key' }
    })
    fireEvent.change(screen.getByLabelText('Модель памяти'), { target: { value: 'qwen' } })
    fireEvent.change(screen.getByLabelText('Эмбеддинги памяти'), { target: { value: 'e5' } })
    expect(screen.getByLabelText('LAB_KEY')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить выбор' }))
    await waitFor(() =>
      expect(saveDataProviders).toHaveBeenCalledWith(
        {
          rag: { provider: 'agent' },
          memory: {
            provider: 'custom',
            base_url: 'http://lab/v1',
            key_env: 'LAB_KEY',
            llm: 'qwen',
            embedding: 'e5'
          }
        },
        false
      )
    )
  })
})
