import type { AecpilotApi } from '../../shared/ipc'

declare global {
  interface Window {
    aecpilot: AecpilotApi
  }
}

export {}
