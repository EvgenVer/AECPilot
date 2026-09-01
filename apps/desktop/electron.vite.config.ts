import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// The three aliases that let vendored donor files keep their own imports (see
// `src/renderer/src/donor/README.md`):
//   `@/…`                their src root → our donor zone, which mirrors it
//   `@hermes/shared`     their workspace package → our shim, which re-exports the
//                        parts we vendored and swaps their WebSocket client for the
//                        IPC bridge (SPEC C9)
//   `@hermes/plugin-sdk` their plugin language → the SDK barrel we already
//                        vendored. In THEIR tree this alias resolves the same way
//                        (`tsconfig.json`: `./src/sdk/index.ts`), so it is not a
//                        substitution — it is the same mapping, pointed at our copy.
//                        Without it their plugin's 37 SDK importers would have to be
//                        edited, and editing them is not one of the five allowed
//                        donor edits (задача 3D.1).
//
// ORDER MATTERS. Vite replaces on a string prefix, so `@` would swallow
// `@hermes/…` if it came first. Both `@hermes/*` entries stay above it.
export const donorAliases = {
  '@hermes/shared': path.resolve(here, 'src/renderer/src/shared/hermes-shared'),
  '@hermes/plugin-sdk': path.resolve(here, 'src/renderer/src/donor/sdk'),
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
      // Шрифт НИКОГДА не вклеивается в CSS как `data:` (находка D-60).
      //
      // Наша CSP — `default-src 'self'` без `font-src` (`src/renderer/index.html`),
      // то есть вклеенный шрифт запрещён. Умолчание Vite вклеивает всё легче
      // 4 КиБ, и под порог попадает ровно один файл: `KaTeX_Size3` из
      // `katex.min.css`, который их `styles.css` импортирует. Браузер отвергает
      // его загрузку, а `page.addStyleTag` в e2e считает это своей ошибкой —
      // отсюда падало восемь проверок подряд, начиная с первой, которая прячет
      // экраны первого запуска.
      //
      // Ослаблять CSP до `font-src data:` ради этого не нужно: файлом шрифт
      // проходит как `'self'`, и правило остаётся строгим.
      assetsInlineLimit: (filePath: string) => (/\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined),
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
