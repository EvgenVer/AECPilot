import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// The two aliases that let vendored donor files keep their own imports (see
// `src/renderer/src/donor/README.md`):
//   `@/…`            their src root → our donor zone, which mirrors it
//   `@hermes/shared` their workspace package → our shim, which re-exports the
//                    parts we vendored and swaps their WebSocket client for the
//                    IPC bridge (SPEC C9)
export const donorAliases = {
  '@hermes/shared': path.resolve(here, 'src/renderer/src/shared/hermes-shared'),
  '@': path.resolve(here, 'src/renderer/src/donor')
}

export default defineConfig({
  main: {},
  // Two preloads: the main window's ~150-member bridge, and the quick-entry
  // window's two verbs (task 3.15). A capture box has no business holding the
  // API the application window needs.
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(here, 'src/preload/index.ts'),
          'quick-entry': path.resolve(here, 'src/preload/quick-entry.ts'),
          'wake-indicator': path.resolve(here, 'src/preload/wake-indicator.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: { alias: donorAliases },
    // Its own HTML entry rather than a route of the main one: mounting the
    // whole shell to show one input would boot their application twice, and
    // this window must appear in the time it takes to press a chord.
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(here, 'src/renderer/index.html'),
          'quick-entry': path.resolve(here, 'src/renderer/quick-entry.html'),
          'wake-indicator': path.resolve(here, 'src/renderer/wake-indicator.html')
        }
      }
    }
  }
})
