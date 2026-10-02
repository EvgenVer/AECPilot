// Состояние окна «Индекс и память» (задачи 3G.46–3G.47, D-172).
//
// Читается ПРИ ОТКРЫТИИ: провайдера агента меняют на их экране провайдеров, и
// состояние, снятое при старте, врало бы про то, что человек только что выбрал сам.

import { atom } from 'nanostores'

import type { DataProvidersFile, DataProvidersState } from '../../../../shared/ipc'

export const EMPTY_STATE: DataProvidersState = {
  encryptionAvailable: true,
  profileRead: false,
  agentProvider: null,
  choice: { rag: { provider: 'agent' }, memory: { provider: 'rag' } },
  presets: [],
  keys: [],
  rag: { ok: false },
  memory: { ok: false }
}

export const $dataProviders = atom<DataProvidersState>(EMPTY_STATE)
export const $dataProvidersOpen = atom<boolean>(false)

export async function refreshDataProviders(): Promise<DataProvidersState> {
  const state = await window.aecpilot.getDataProviders()
  $dataProviders.set(state)
  return state
}

/** Вход для всех, кто отправляет человека выбрать провайдера: палитра, индикатор
 *  индекса, уведомление памяти, мастер. */
export function openDataProviders(): void {
  void refreshDataProviders()
  $dataProvidersOpen.set(true)
}

/** Текст отказа или пустая строка — отказ виден словами. */
export async function saveDataChoice(choice: DataProvidersFile): Promise<string> {
  const answer = await window.aecpilot.saveDataProviders(choice)
  if (!answer.ok) return answer.error ?? 'выбор не сохранён'
  await refreshDataProviders()
  return ''
}

export async function saveDataKey(envVar: string, key: null | string): Promise<string> {
  const answer = await window.aecpilot.saveProviderKey({ envVar, key })
  if (!answer.ok) return answer.error ?? 'ключ не сохранён'
  await refreshDataProviders()
  return ''
}
