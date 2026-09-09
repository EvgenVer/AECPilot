// Задача 3E.9а — что окно доступов Microsoft Graph делает руками человека.
//
// Проверяется не вид, а четыре вещи, без которых оно бесполезно или опасно:
// значение уезжает ТЕМ ЖЕ текстом и под тем именем, которое читает ядро; отказ
// виден словами; перебитая в `.env` переменная названа прямо; и список «чего не
// хватает» говорит про остальные три места, а не молчит.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'
import type { GraphAccessState } from '../../../../shared/ipc'

import GraphAccessDialog from './GraphAccessDialog'
import { $graphAccess, $graphAccessOpen, EMPTY } from './graph-access-store'

const saveProviderKey = vi.fn()
const getGraphAccess = vi.fn()

function state(patch: Partial<GraphAccessState> = {}): GraphAccessState {
  return {
    encryptionAvailable: true,
    keys: [
      { envOverrides: false, envVar: 'MSGRAPH_TENANT_ID', hasKey: true },
      { envOverrides: false, envVar: 'MSGRAPH_CLIENT_ID', hasKey: false },
      { envOverrides: false, envVar: 'MSGRAPH_CLIENT_SECRET', hasKey: false }
    ],
    profileRead: true,
    readiness: {
      channels: { notifications: true, teams: false },
      plugins: { channel: false, pipeline: true }
    },
    ...patch
  }
}

function show(): void {
  render(
    <AecI18nProvider>
      <GraphAccessDialog />
    </AecI18nProvider>
  )
}

beforeEach(() => {
  saveProviderKey.mockResolvedValue({ ok: true, restarted: true })
  getGraphAccess.mockResolvedValue(state())
  $graphAccessOpen.set(true)
  $graphAccess.set(state())
  window.aecpilot = { getGraphAccess, saveProviderKey } as unknown as typeof window.aecpilot
})

afterEach(() => {
  // Руками: у проекта `dom` не включён `globals`, автоочистки нет, и надпись
  // прошлого теста нашлась бы дважды.
  cleanup()
  vi.clearAllMocks()
  $graphAccessOpen.set(false)
  $graphAccess.set(EMPTY)
})

describe('окно доступов Microsoft Graph', () => {
  it('показывает три поля и состояние каждого', () => {
    show()

    expect(screen.getByText('MSGRAPH_TENANT_ID')).toBeTruthy()
    expect(screen.getByText('MSGRAPH_CLIENT_ID')).toBeTruthy()
    expect(screen.getByText('MSGRAPH_CLIENT_SECRET')).toBeTruthy()
    expect(screen.getAllByText('задан')).toHaveLength(1)
    expect(screen.getAllByText('не задан')).toHaveLength(2)
  })

  it('сохраняет значение под тем именем, которое читает ядро', async () => {
    show()
    const field = screen.getByLabelText('Секрет приложения')
    fireEvent.change(field, { target: { value: '  секрет-из-azure  ' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Сохранить' })[2])

    await waitFor(() => expect(saveProviderKey).toHaveBeenCalledTimes(1))
    // Опечатка в имени переменной означала бы «ключ введён, доступа нет», и
    // искать её человек будет не здесь. Пробелы по краям срезаны: значение из
    // портала Azure копируют мышью.
    expect(saveProviderKey).toHaveBeenCalledWith({
      envVar: 'MSGRAPH_CLIENT_SECRET',
      key: 'секрет-из-azure'
    })
  })

  it('отказ виден словами, а не проглочен', async () => {
    saveProviderKey.mockResolvedValue({
      ok: false,
      restarted: false,
      error: 'safeStorage недоступен на этой машине — ключ не сохранён'
    })
    show()
    fireEvent.change(screen.getByLabelText('Идентификатор приложения (client ID)'), {
      target: { value: 'client-id' }
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Сохранить' })[1])

    expect(await screen.findByText(/ключ не сохранён/)).toBeTruthy()
  })

  it('переменная из .env профиля названа прямо: сохранённое здесь не подействует', () => {
    $graphAccess.set(
      state({
        keys: [
          { envOverrides: true, envVar: 'MSGRAPH_TENANT_ID', hasKey: false },
          { envOverrides: false, envVar: 'MSGRAPH_CLIENT_ID', hasKey: false },
          { envOverrides: false, envVar: 'MSGRAPH_CLIENT_SECRET', hasKey: false }
        ]
      })
    )
    show()

    expect(screen.getByText(/ядро предпочитает её/)).toBeTruthy()
  })

  it('без шифрования не предлагает сохранять — в открытом виде не пишем', () => {
    $graphAccess.set(state({ encryptionAvailable: false }))
    show()

    expect(screen.getByText(/не умеет шифровать/)).toBeTruthy()
    const save = screen.getAllByRole('button', { name: 'Сохранить' })[0] as HTMLButtonElement
    expect(save.disabled).toBe(true)
  })

  it('список говорит про остальные три места, а не только про ключи', () => {
    // Настроить ключи и получить тишину — это то, из-за чего список здесь есть.
    show()

    expect(screen.getByText(/teams_pipeline/)).toBeTruthy()
    expect(screen.getByText(/канал уведомлений Microsoft Graph/)).toBeTruthy()
    expect(screen.getByText(/teams-platform/)).toBeTruthy()
  })

  it('профиль не прочитан — сказано это, а не «всё выключено»', () => {
    $graphAccess.set(state({ profileRead: false }))
    show()

    expect(screen.getByText(/оно на другой машине/)).toBeTruthy()
    expect(screen.queryByText(/teams_pipeline/)).toBeNull()
  })

  it('окно не обращается к Microsoft, и это сказано вслух', () => {
    show()

    expect(screen.getByText(/не обращается к Microsoft/)).toBeTruthy()
  })
})
