import type { AecpilotApi } from '../../shared/ipc'
import type { QuickEntryApi } from '../../preload/quick-entry'

declare global {
  interface Window {
    aecpilot: AecpilotApi
    /** Only the quick-entry window has this, and only this (task 3.15): its
     * preload exposes two verbs and nothing that reads anything back. */
    quickEntry: QuickEntryApi
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
