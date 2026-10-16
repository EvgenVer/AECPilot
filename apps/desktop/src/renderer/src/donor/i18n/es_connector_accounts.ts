/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/es_connector_accounts.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { TranslationOverrides } from './define-locale'

export const esConnectorAccounts: NonNullable<TranslationOverrides['connectorsPage']>['accounts'] = {
  heading: 'Cuentas',
  count: (count: number) => `${count} cuenta${count === 1 ? '' : 's'}`,
  addAnother: 'Añadir otra cuenta',
  aliasLabel: 'Nombre de la cuenta',
  aliasHint: 'Minúsculas, números y guiones, hasta 32. Por ejemplo trabajo o casa.',
  aliasInvalid: 'Usa minúsculas, números y guiones, empezando por una letra o un número.',
  aliasTaken: 'Ese nombre ya está en uso.',
  add: 'Conectar',
  rename: 'Cambiar nombre',
  renameLabel: (name: string) => `Nuevo nombre para ${name}`,
  renameGone: 'Esa cuenta ya no existe. Se quitó o una reconexión la sustituyó.',
  remove: 'Quitar',
  removeTitle: (app: string, name: string) => `¿Quitar la cuenta ${name} de ${app}?`,
  removeBody: 'Hermes deja de actuar con esta cuenta. Tus otras cuentas siguen conectadas.',
  retiredCount: (count: number) => `${count} retirada${count === 1 ? '' : 's'}`,
  status: {
    expired: 'Acceso caducado',
    failed: 'No se pudo conectar',
    inactive: 'Inactiva',
    pending: 'Esperando el inicio de sesión',
    retired: 'Sustituida al reconectar',
    revoked: 'Acceso revocado'
  }
}
