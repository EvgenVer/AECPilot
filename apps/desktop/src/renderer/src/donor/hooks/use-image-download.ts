/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/hooks/use-image-download.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useCallback, useState } from 'react'

import { useI18n } from '@/i18n'
import { notify, notifyError } from '@/store/notifications'

export function imageFilename(src?: string): string {
  if (!src) {
    return 'image'
  }

  try {
    return new URL(src, window.location.href).pathname.split('/').filter(Boolean).pop() || 'image'
  } catch {
    return src.split(/[\\/]/).filter(Boolean).pop() || 'image'
  }
}

function isMissingIpcHandler(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''

  return message.includes("No handler registered for 'hermes:saveImageFromUrl'")
}

async function startBrowserDownload(src: string) {
  const response = await fetch(src)

  if (!response.ok) {
    throw new Error(`Could not fetch image: ${response.status}`)
  }

  const blobUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = imageFilename(src)
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
}

/** Save an image to disk via the desktop IPC bridge, falling back to a browser
 *  download when the handler is unavailable (older shell / web preview). */
export function useImageDownload(src?: string) {
  const { t } = useI18n()
  const copy = t.desktop
  const [saving, setSaving] = useState(false)

  const download = useCallback(async () => {
    if (!src || saving) {
      return
    }

    setSaving(true)

    try {
      if (window.hermesDesktop?.saveImageFromUrl) {
        if (await window.hermesDesktop.saveImageFromUrl(src)) {
          notify({ kind: 'success', title: copy.imageSaved, message: imageFilename(src) })
        }

        return
      }

      await startBrowserDownload(src)
    } catch (error) {
      if (isMissingIpcHandler(error)) {
        try {
          await startBrowserDownload(src)
          notify({ kind: 'info', title: copy.downloadStarted, message: copy.restartToUseSaveImage })
        } catch (fallbackError) {
          notifyError(fallbackError, copy.restartToSaveImages)
        }

        return
      }

      notifyError(error, copy.imageDownloadFailed)
    } finally {
      setSaving(false)
    }
  }, [copy, saving, src])

  return { download, saving }
}
