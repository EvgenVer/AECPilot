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
import { AecI18nProvider } from './shared/i18n'
import { installHermesDesktopBridge } from './shared/hermes-desktop-shim'

// Vendored donor code reaches the backend through `window.hermesDesktop`
// (tasks 1.8.5/1.8.6). Installed before the first render because their stores
// read it at module load, not from an effect.
installHermesDesktopBridge()
installClipboardShim()

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
