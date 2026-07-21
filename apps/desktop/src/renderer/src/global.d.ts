import type { AecpilotApi } from '../../shared/ipc'

declare global {
  interface Window {
    aecpilot: AecpilotApi
  }

  /** Just the build-time flag we use (task 1.5.D1's dev-only unhandled-event
   * warning). Declared here rather than pulling in `vite/client` wholesale,
   * which would widen the renderer's ambient types for one boolean. */
  interface ImportMetaEnv {
    readonly DEV: boolean
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

export {}
