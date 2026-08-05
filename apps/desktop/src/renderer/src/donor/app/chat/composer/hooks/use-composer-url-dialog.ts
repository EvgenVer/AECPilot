/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/hooks/use-composer-url-dialog.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useEffect, useRef, useState } from 'react'

import { triggerHaptic } from '@/lib/haptics'

interface UseComposerUrlDialogOptions {
  insertText: (text: string) => void
  onAddUrl?: (url: string) => void
}

/**
 * "Add URL" dialog engine: open/value state, autofocus-on-open, and submit. On
 * submit it prefers the host's `onAddUrl` (which may fetch/title the link) and
 * otherwise drops an `@url:` directive into the draft.
 */
export function useComposerUrlDialog({ insertText, onAddUrl }: UseComposerUrlDialogOptions) {
  const urlInputRef = useRef<HTMLInputElement | null>(null)
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlValue, setUrlValue] = useState('')

  useEffect(() => {
    if (urlOpen) {
      window.requestAnimationFrame(() => urlInputRef.current?.focus({ preventScroll: true }))
    }
  }, [urlOpen])

  const openUrlDialog = () => {
    triggerHaptic('open')
    setUrlOpen(true)
  }

  const submitUrl = () => {
    const url = urlValue.trim()

    if (!url) {
      return
    }

    if (onAddUrl) {
      onAddUrl(url)
    } else {
      insertText(`@url:${url}`)
    }

    triggerHaptic('success')
    setUrlValue('')
    setUrlOpen(false)
  }

  return { openUrlDialog, setUrlOpen, setUrlValue, submitUrl, urlInputRef, urlOpen, urlValue }
}
