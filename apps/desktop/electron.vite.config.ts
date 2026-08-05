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
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: { alias: donorAliases }
  }
})
