import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router'

// One stylesheet now: theirs. Ours went with the screens that read it — our
// own surfaces are written in their Tailwind (task 1.8.19).
import './donor/styles.css'

import App from './donor/app'
import { ErrorBoundary } from './donor/components/error-boundary'
import { HapticsProvider } from './donor/components/haptics-provider'
import { RootTooltipProvider } from './donor/components/ui/tooltip'
import { ThemeProvider } from './donor/themes/context'
import { installClipboardShim } from './donor/lib/clipboard'
import { queryClient } from './donor/lib/query-client'

import { ProjectGate } from './aec/project/ProjectGate'
import ChannelDisclosureDialog from './aec/channels-disclosure/ChannelDisclosureDialog'
import FirstRunGuide from './aec/onboarding/FirstRunGuide'
// Side-effect: registers our vault explorer as a pane in their shell.
import './aec/explorer/register'
import { registerQuoteCheck } from './aec/citations/register-quote-check'
import { registerChangesPane } from './aec/rollback/register-changes-pane'
import { installPreviewBoundary } from './aec/preview-boundary/install-preview-boundary'
import { registerCoreNotices } from './aec/core-notices/register-core-notices'
import { AecI18nProvider } from './shared/i18n'
import { installHermesDesktopBridge } from './shared/hermes-desktop-shim'

// Vendored donor code reaches the backend through `window.hermesDesktop`
// (tasks 1.8.5/1.8.6). Installed before the first render because their stores
// read it at module load, not from an effect.
installHermesDesktopBridge()
installClipboardShim()
// Task 3.31b: второй рубеж сверки выдержек. Подписка ставится один раз на окно
// и до первого рендера — ответ может прийти раньше, чем смонтируется лента.
registerQuoteCheck()
registerCoreNotices()
// Task 3.3: «Изменения в документах» takes the place of their git review pane
// (SPEC HX6/UR16). Called from the body on purpose — a same-id registration
// wins only if it runs after their shell module, and module bodies run after
// every static import. See `register-changes-pane.tsx`.
registerChangesPane()
// Задача 3.4 (SPEC HX13): вкладка предпросмотра открывает только то, что
// сделал агент. Надзор ставится до первого рендера — вкладка могла остаться в
// хранилище от прошлого запуска.
installPreviewBoundary()

// Their provider stack, in their order (main.tsx at DONOR_SHA), with two
// substitutions: our i18n provider stands in for theirs (same component
// underneath, our catalogs and our storage), and their multi-window entry
// points — pet overlay, quick entry, wake indicator — are not mounted: the
// first is HX1, the other two are phase 3.
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary label="root">
      <QueryClientProvider client={queryClient}>
        <AecI18nProvider>
          <ThemeProvider>
            <HapticsProvider>
              <RootTooltipProvider>
                {/* useTransitions={false} is theirs and deliberate: react-router
                    wraps route updates in startTransition, and under a token
                    stream those non-urgent commits get starved. */}
                <HashRouter useTransitions={false}>
                  {/* Their application only starts once a vault is open — the
                      agent's working directory IS the vault (SPEC), and main
                      hands one over only after this gate. */}
                  <ProjectGate>
                    <App />
                    {/* Task 3.10: asked from our bridge, so it hangs at the
                        root rather than inside the screen that triggers it —
                        the screen is theirs and must stay unedited. */}
                    <ChannelDisclosureDialog />
                    {/* Task 3.20: шаги от пустой установки до первого ответа.
                        Здесь же, а не внутри их экрана: два шага из шести —
                        их собственный оверлей, и мастер должен стоять рядом
                        с ним, а не под ним. */}
                    <FirstRunGuide />
                  </ProjectGate>
                </HashRouter>
              </RootTooltipProvider>
            </HapticsProvider>
          </ThemeProvider>
        </AecI18nProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)
