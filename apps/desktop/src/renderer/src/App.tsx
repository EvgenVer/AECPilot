import Welcome from './shell/Welcome'
import Shell from './shell/Shell'

/** Root component (task 1.0): the Welcome/"choose a project" screen shows
 * only behind the `AEC_SHOW_WELCOME=1` dev flag (window.aecpilot.showWelcome,
 * set once in preload from process.env) — otherwise the app autostarts
 * straight into the workspace shell, unchanged from Phase 0's behavior (and
 * what the e2e smoke test exercises). */
export default function App() {
  if (window.aecpilot.showWelcome) return <Welcome />
  return <Shell />
}
