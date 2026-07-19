import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/shell.css'
import App from './App'
import { applyTheme, readStoredTheme } from './theme'

// Task 1.5.10: apply the persisted theme before the first render — done here
// rather than in an App/Shell effect so tokens.css's [data-theme="dark"]
// rules are already active for React's very first paint (no light-then-dark
// flash).
applyTheme(document.documentElement, readStoredTheme(window.localStorage))

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
