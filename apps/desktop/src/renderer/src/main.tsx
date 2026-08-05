import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Their stylesheet first, ours second: theirs opens with Tailwind's preflight
// and their theme variables, and our remaining screens (task 1.8.17–1.8.19
// replace them) must still be able to override it. Both theme mechanisms are
// live for that stretch — theirs on `.dark` + `color-scheme`, ours on
// `[data-theme]` — and ours goes away with the last screen that reads it.
import './donor/styles.css'
import './styles/tokens.css'
import './styles/shell.css'
import App from './App'
import { ThemeProvider } from './donor/themes/context'
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
    <ThemeProvider>
      <AecI18nProvider>
        <App />
      </AecI18nProvider>
    </ThemeProvider>
  </StrictMode>
)
