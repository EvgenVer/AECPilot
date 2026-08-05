import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/shell.css'
import App from './App'
import { applyTheme, readStoredTheme } from './theme'
import { AecI18nProvider } from './shared/i18n'
import { installHermesDesktopBridge } from './shared/hermes-desktop-shim'

// Task 1.5.10: apply the persisted theme before the first render — done here
// rather than in an App/Shell effect so tokens.css's [data-theme="dark"]
// rules are already active for React's very first paint (no light-then-dark
// flash).
applyTheme(document.documentElement, readStoredTheme(window.localStorage))

// Vendored donor code reaches the backend through `window.hermesDesktop`
// (task 1.8.5/1.8.6). Installed before the first render because their stores
// read it at module load, not from an effect.
installHermesDesktopBridge()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AecI18nProvider>
      <App />
    </AecI18nProvider>
  </StrictMode>
)
