/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/capabilities/connectors/connector-kind.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
