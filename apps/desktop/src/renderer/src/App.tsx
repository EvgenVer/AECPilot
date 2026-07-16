import { useEffect, useState } from 'react'
import Welcome from './shell/Welcome'
import Shell from './shell/Shell'

/** Root component (task 1.0): the Welcome/"choose a project" screen shows
 * only behind the `AEC_SHOW_WELCOME=1` dev flag (window.aecpilot.showWelcome,
 * set once in preload from process.env) — otherwise the app autostarts
 * straight into the workspace shell, unchanged from Phase 0's behavior (and
 * what the e2e smoke test exercises). Once a project is created from Welcome
 * (task 1.3), `project:opened` fires and this switches to the shell — there
 * is no path back to Welcome. */
export default function App() {
  const [showWelcome, setShowWelcome] = useState(window.aecpilot.showWelcome)

  useEffect(() => {
    if (!showWelcome) return
    return window.aecpilot.onProjectOpened(() => setShowWelcome(false))
  }, [showWelcome])

  if (showWelcome) return <Welcome />
  return <Shell />
}
