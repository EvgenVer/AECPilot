// Preload окна «Ключи моделей» на сервере (задача T35.2).
//
// Три глагола: что показать (имена и признаки, без значений), сохранить или удалить
// ключ, закрыть окно. Ничего, что читает значение обратно.

import { contextBridge, ipcRenderer } from 'electron'

export interface ServerKeyRowView {
  envVar: string
  hasKey: boolean
  envOverrides: boolean
}

export interface ServerKeysApi {
  view(): Promise<{
    encryptionAvailable: boolean
    rows: ServerKeyRowView[]
    strings: Record<string, string>
  }>
  save(envVar: string, key: string | null): Promise<{ ok: boolean; message: string }>
  close(): void
}

const api: ServerKeysApi = {
  view: () => ipcRenderer.invoke('server-keys:view'),
  save: (envVar, key) => ipcRenderer.invoke('server-keys:save', { envVar, key }),
  close: () => ipcRenderer.send('server-keys:close')
}

contextBridge.exposeInMainWorld('serverKeys', api)
