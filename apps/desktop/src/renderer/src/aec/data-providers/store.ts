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

/** Агент по подписке (их OAuth-провайдеры, например `openai-codex`): у входа нет
 *  адреса с ключом, которым могли бы пользоваться индекс и память. Таблица
 *  пресетов и свои адреса (`custom:*`) — не подписка. */
export function isSubscriptionProvider(agentProvider: string | null): boolean {
  return (
    !!agentProvider &&
    agentProvider !== 'gemini' &&
    agentProvider !== 'openai-api' &&
    !agentProvider.startsWith('custom')
  )
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

/** Отказ словами (`error`) или вопрос до записи (`warnings`, задача 3G.52): смена
 *  модели эмбеддингов записывается только с `confirmed`. */
export async function saveDataChoice(
  choice: DataProvidersFile,
  confirmed = false
): Promise<{ error: string; warnings: string[] }> {
  const answer = await window.aecpilot.saveDataProviders(choice, confirmed)
  if (answer.warnings?.length) return { error: '', warnings: answer.warnings }
  if (!answer.ok) return { error: answer.error ?? 'выбор не сохранён', warnings: [] }
  await refreshDataProviders()
  return { error: '', warnings: [] }
}

/** Модели провайдера раздела (задача 3G.52) или отказ словами. */
export async function listModels(
  choice: DataProvidersFile,
  section: 'rag' | 'memory'
): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const answer = await window.aecpilot.listDataModels(choice, section)
  return answer.ok && answer.models
    ? { ok: true, models: answer.models }
    : { ok: false, error: answer.error ?? 'список не получен' }
}

export async function saveDataKey(envVar: string, key: null | string): Promise<string> {
  const answer = await window.aecpilot.saveProviderKey({ envVar, key })
  if (!answer.ok) return answer.error ?? 'ключ не сохранён'
  await refreshDataProviders()
  return ''
}
