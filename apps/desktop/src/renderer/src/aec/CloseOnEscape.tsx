// Escape у наших окон (D-182) — по их порядку `lib/escape-layers`, как у их
// оверлеев: окно занимает слой, пока смонтировано, и закрывается тем же, чем
// щелчок по подложке. Ставится внутрь окна, поэтому слой есть, только пока окно
// открыто.

import { useEffect } from 'react'

import { ESCAPE_PRIORITY, isTopEscapeLayer, pushEscapeLayer } from '../donor/lib/escape-layers'

// Наши окна лежат над их оверлеями (`--z-modal` над `z-50` «Настроек»), значит
// и Escape — сначала им.
const DIALOG_PRIORITY = ESCAPE_PRIORITY.overlay + 5

export function CloseOnEscape({ onClose }: { onClose: () => void }): null {
  useEffect(() => {
    const releaseLayer = pushEscapeLayer(DIALOG_PRIORITY)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopEscapeLayer(DIALOG_PRIORITY)) {
        return
      }

      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      releaseLayer()
    }
  }, [onClose])

  return null
}
