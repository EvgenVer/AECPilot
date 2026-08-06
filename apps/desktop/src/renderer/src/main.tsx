import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router'

// Their stylesheet first, ours second: theirs opens with Tailwind's preflight
// and their theme variables, and our remaining screens (task 1.8.17–1.8.19
// replace them) must still be able to override it.
import './donor/styles.css'
import './styles/tokens.css'
import './styles/shell.css'

import App from './donor/app'
import { ErrorBoundary } from './donor/components/error-boundary'
import { HapticsProvider } from './donor/components/haptics-provider'
import { RootTooltipProvider } from './donor/components/ui/tooltip'
import { ThemeProvider } from './donor/themes/context'
import { installClipboardShim } from './donor/lib/clipboard'
import { queryClient } from './donor/lib/query-client'

import { applyTheme, readStoredTheme } from './theme'
import { ProjectGate } from './aec/project/ProjectGate'
// Side-effect: registers our vault explorer as a pane in their shell.
import './aec/explorer/register'
import { AecI18nProvider } from './shared/i18n'
import { installHermesDesktopBridge } from './shared/hermes-desktop-shim'

// Task 1.5.10: apply the persisted theme before the first render — done here
// rather than in an App/Shell effect so tokens.css's [data-theme="dark"]
// rules are already active for React's very first paint (no light-then-dark
// flash). Their ThemeProvider does the same for their own variables.
applyTheme(document.documentElement, readStoredTheme(window.localStorage))

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
