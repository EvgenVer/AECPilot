/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/capabilities/connectors/connector-kind.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { Translations } from '@/i18n/types'

import type { ConnectorCardModel } from './types'

export function connectorKindWord(card: ConnectorCardModel, copy: Translations['connectorsPage']['card']): string {
  if (card.residency === 'hosted') {
    return copy.kindManaged
  }

  if (card.plugin) {
    return copy.kindPlugin(card.plugin)
  }

  return card.ways.local?.inCatalog === true ? copy.kindCatalog : copy.kindCustom
}

export function showsCatalogMark(card: ConnectorCardModel): boolean {
  return card.inCatalog && card.plugin === undefined
}
