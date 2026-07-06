import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('aecpilot', {
  appVersion: '0.0.0'
})
