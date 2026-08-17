// Preload for the quick-entry window (task 3.15).
//
// Its own, deliberately tiny: the capture window has no business holding the
// ~150-member API the main window gets. Two verbs — send this text, hide me —
// and nothing that reads anything back.

import { contextBridge, ipcRenderer } from 'electron'

export interface QuickEntryApi {
  submit(text: string, target: 'current' | 'new'): Promise<{ ok: boolean; error?: string }>
  hide(): void
}

const api: QuickEntryApi = {
  submit: (text, target) => ipcRenderer.invoke('quick:submit', { text, target }),
  hide: () => ipcRenderer.send('quick:hide')
}

contextBridge.exposeInMainWorld('quickEntry', api)
