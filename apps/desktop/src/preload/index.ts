import { contextBridge, ipcRenderer } from 'electron'
import type { AecpilotApi } from '../shared/ipc'

const api: AecpilotApi = {
  submitPrompt: (text) => ipcRenderer.invoke('chat:submit', text),
  getGatewayState: () => ipcRenderer.invoke('gateway:get-state'),
  onChatEvent: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]): void =>
      cb(payload)
    ipcRenderer.on('chat:event', listener)
    return () => ipcRenderer.removeListener('chat:event', listener)
  },
  onGatewayState: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]): void =>
      cb(payload)
    ipcRenderer.on('gateway:state', listener)
    return () => ipcRenderer.removeListener('gateway:state', listener)
  }
}

contextBridge.exposeInMainWorld('aecpilot', api)
