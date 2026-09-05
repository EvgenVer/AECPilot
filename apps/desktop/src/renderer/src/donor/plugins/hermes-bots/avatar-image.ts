/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/avatar-image.ts
 * Commit:  29112bef099274229cadff79cdff7bf7b99c4b77 (v2026.8.31)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [3] dropped the portrait-generation half — `$imagenAvailable`, `probeImagen`,
 *       `GeneratedImage`, `generateAvatarImage` (HX11); the image-normalising and
 *       file-picking half of this file is untouched
 *   [4] dropped the now-unused `atom` import orphaned by that removal
 * (no other edits)
 */
/**
 * Image avatars: the device-upload path and the gateway's `image.generate`
 * backend (probe + generation). Kept apart from `avatar.tsx` so the roster's
 * render path doesn't drag the picker's network surface along with it.
 */

import { host } from '@hermes/plugin-sdk'

import { getPluginCtx } from './shared'

// ── image avatars: upload from device + generate via image.generate ─────────

/** Downscale to a small square so plugin storage stays light. */
export function normalizeAvatarImage(dataUrl: string, edge = 256): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = edge
        canvas.height = edge
        const ctx2d = canvas.getContext('2d')!
        const side = Math.min(img.width, img.height)
        ctx2d.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, edge, edge)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(dataUrl)
      }
    }

    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

export function pickImageFromDevice(): Promise<null | string> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif'

    input.onchange = () => {
      const file = input.files?.[0]

      if (!file) {
        return resolve(null)
      }

      if (file.size > 15_000_000) {
        host.notify({
          kind: 'error',
          message: getPluginCtx()?.i18n?.t('avatar.imageTooLarge') ?? 'Image too large (max 15MB).'
        })

        return resolve(null)
      }

      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    }

    input.click()
  })
}

// EDIT [3]: снят весь блок генерации портрета — `$imagenAvailable`,
// `probeImagen`, `GeneratedImage` и `generateAvatarImage`. Это HX11: лицо
// специалиста у нас геометрическое либо загруженная картинка, а `image.generate`
// в нашем дереве не зовётся ниоткуда (проверка AC12). Соседние экспорты этого
// файла — нормализация картинки и выбор файла с диска — к генерации отношения
// не имеют и остаются: файл смешивал два дела, и снято ровно одно.

/** The roster backfill draws the live SVG at 160x160. Pets are 96x104
 *  and uploads are 256. Use that to tell a still face-copy from a real picture. */
export function isBackfilledFacePng(dataUrl: null | string | undefined) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    return false
  }

  try {
    const bin = atob(dataUrl.slice('data:image/png;base64,'.length).slice(0, 48))

    if (bin.length < 24) {
      return false
    }

    const w = (bin.charCodeAt(16) << 24) | (bin.charCodeAt(17) << 16) | (bin.charCodeAt(18) << 8) | bin.charCodeAt(19)
    const h = (bin.charCodeAt(20) << 24) | (bin.charCodeAt(21) << 16) | (bin.charCodeAt(22) << 8) | bin.charCodeAt(23)

    return w === 160 && h === 160
  } catch {
    return false
  }
}
