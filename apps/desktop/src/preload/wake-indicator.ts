// Preload окна-индикатора слова-активатора (задача 3.7b).
//
// Собственный и намеренно крошечный, по той же причине, что у быстрого ввода:
// табличке нечего делать с полным мостом главного окна. Один глагол — «скажи
// мне, что показывать», и ничего, что можно было бы сделать наружу.

import { contextBridge, ipcRenderer } from 'electron'

export type WakeIndicatorState = 'capturing' | 'detected' | 'hidden'

export interface WakeIndicatorApi {
  onState(callback: (state: WakeIndicatorState) => void): () => void
}

const api: WakeIndicatorApi = {
  onState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: WakeIndicatorState): void =>
      callback(state)
    ipcRenderer.on('wake-indicator:state', listener)
    return () => ipcRenderer.removeListener('wake-indicator:state', listener)
  }
}

contextBridge.exposeInMainWorld('wakeIndicator', api)
