import { contextBridge, ipcRenderer } from 'electron'
import type { AecpilotApi } from '../shared/ipc'

const api: AecpilotApi = {
  showWelcome: process.env.AEC_SHOW_WELCOME === '1',
  submitPrompt: (text) => ipcRenderer.invoke('chat:submit', text),
  getGatewayState: () => ipcRenderer.invoke('gateway:get-state'),
  respondApproval: (choice, all) => ipcRenderer.invoke('chat:respond-approval', choice, all),
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  newSession: () => ipcRenderer.invoke('sessions:new'),
  switchSession: (id) => ipcRenderer.invoke('sessions:switch', id),
  getLlmSettings: () => ipcRenderer.invoke('settings:get'),
  saveLlmSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  getApprovalsMode: () => ipcRenderer.invoke('approvals:get-mode'),
  setApprovalsMode: (mode) => ipcRenderer.invoke('approvals:set-mode', mode),
  pickProjectDirectory: () => ipcRenderer.invoke('project:pick-directory'),
  createProject: (dirPath, name) => ipcRenderer.invoke('project:create', { dirPath, name }),
  getCurrentProject: () => ipcRenderer.invoke('project:get-current'),
  listRecentProjects: () => ipcRenderer.invoke('project:list-recents'),
  onProjectOpened: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof cb>[0]): void =>
      cb(payload)
    ipcRenderer.on('project:opened', listener)
    return () => ipcRenderer.removeListener('project:opened', listener)
  },
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
