/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/edit-profile-look.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { BotMeta } from './types'

/** What Edit Profile shows for a bot's look, as opened and as submitted. */
export interface EditProfileLook {
  color: null | string
  image: null | string
  shape: BotMeta['shape']
  title: string
}

/** The fields the user actually changed since the dialog opened, as a
 *  saveBotMeta patch; null when nothing changed. Untouched fields stay out of
 *  the patch: a form value seeded minutes ago is not an edit, and sending it
 *  would revert whatever another Desktop or the backend wrote since (a rename
 *  undone by a color change). */
export function editedLook(opened: EditProfileLook, current: EditProfileLook): BotMeta | null {
  const patch: BotMeta = {}

  if (current.shape !== opened.shape) {
    patch.shape = current.shape
  }

  if (current.color !== opened.color) {
    patch.color = current.color ?? undefined
  }

  if (current.image !== opened.image) {
    patch.image = current.image
    patch.imageKind = current.image ? 'photo' : 'shape'
  }

  if (Object.keys(patch).length > 0) {
    patch.custom = true
  }

  if (current.title.trim() !== opened.title.trim()) {
    patch.title = current.title.trim()
  }

  return Object.keys(patch).length > 0 ? patch : null
}
