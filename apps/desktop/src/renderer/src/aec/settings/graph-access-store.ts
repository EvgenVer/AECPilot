// Состояние окна «Доступы Microsoft Graph» (задача 3E.9а).
//
// Читается ПРИ ОТКРЫТИИ, а не при запуске: три из четырёх мест живут в профиле
// ядра, и их меняют не только отсюда — плагины включают на их странице плагинов,
// каналы на их странице каналов. Показать состояние, снятое при старте, значило
// бы врать про то, что человек только что переключил сам.

import { atom } from 'nanostores'

import type { GraphAccessState } from '../../../../shared/ipc'
import { aecT } from '../../shared/i18n/aec-translate'

export const EMPTY: GraphAccessState = {
  encryptionAvailable: true,
  keys: [],
  profileRead: false,
  readiness: {
    channels: { notifications: false, teams: false },
    plugins: { channel: false, pipeline: false }
  }
}

export const $graphAccess = atom<GraphAccessState>(EMPTY)
export const $graphAccessOpen = atom<boolean>(false)

export async function refreshGraphAccess(): Promise<GraphAccessState> {
  const state = await window.aecpilot.getGraphAccess()
  $graphAccess.set(state)
  return state
}

/** Возвращает текст отказа или пустую строку. Отказ виден словами: «ключ не
 *  сохранён» — это решение, которое человек должен увидеть, а не догадаться по
 *  тому, что ничего не изменилось. */
export async function saveGraphKey(envVar: string, key: null | string): Promise<string> {
  const answer = await window.aecpilot.saveProviderKey({ envVar, key })
  if (!answer.ok) return answer.error ?? aecT('dataProviders.errKeyNotSaved')
  await refreshGraphAccess()
  return ''
}
