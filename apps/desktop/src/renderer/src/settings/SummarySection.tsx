import { useEffect, useState } from 'react'
import type { ConfigShowSection } from '../../../shared/gateway/types'

/** "Как настроено" — read-only (task 1.6.B2.15).
 *
 * Rendered exactly as the gateway sends it, and that is the point: their
 * `config.show` builds the sections AND masks the API key (`****last4`)
 * server-side. The alternative — `config.get {key:'full'}` — answers with the
 * whole config.yaml, api key unmasked, for the sake of the same three
 * sections. This app never asks for that. */
export default function SummarySection() {
  const [sections, setSections] = useState<ConfigShowSection[] | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    window.aecpilot
      .getConfigSummary()
      .then((result) => {
        if (mounted) setSections(result.sections ?? [])
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="settings-section">
      {error && <div className="settings-popover__error">{error}</div>}

      {sections && sections.length === 0 && (
        <div className="settings-section__empty">Ядро не прислало сводку настроек.</div>
      )}

      {(sections ?? []).map((section) => (
        <div key={section.title} className="summary-block">
          <div className="settings-popover__section-title">{section.title}</div>
          <dl className="summary-block__rows">
            {(section.rows ?? []).map((row, index) => (
              <div key={`${section.title}-${index}`} className="summary-block__row">
                <dt>{row[0]}</dt>
                <dd>{row[1]}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}
