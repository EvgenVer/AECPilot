/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/fr_connector_accounts.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { TranslationOverrides } from './define-locale'

export const frConnectorAccounts: NonNullable<TranslationOverrides['connectorsPage']>['accounts'] = {
  heading: 'Comptes',
  count: (count: number) => `${count} compte${count === 1 ? '' : 's'}`,
  addAnother: 'Ajouter un autre compte',
  aliasLabel: 'Nom du compte',
  aliasHint: 'Lettres minuscules, chiffres et tirets, 32 au plus. Par exemple travail ou maison.',
  aliasInvalid:
    'Utilisez des lettres minuscules, des chiffres et des tirets, en commençant par une lettre ou un chiffre.',
  aliasTaken: 'Ce nom est déjà utilisé.',
  add: 'Connecter',
  rename: 'Renommer',
  renameLabel: (name: string) => `Nouveau nom pour ${name}`,
  renameGone: 'Ce compte n’existe plus. Il a été supprimé ou remplacé par une reconnexion.',
  remove: 'Retirer',
  removeTitle: (app: string, name: string) => `Retirer le compte ${app} ${name} ?`,
  removeBody: "Hermes cesse d'agir avec ce compte. Vos autres comptes restent connectés.",
  retiredCount: (count: number) => `${count} retiré${count === 1 ? '' : 's'}`,
  status: {
    expired: 'Accès expiré',
    failed: 'Connexion impossible',
    inactive: 'Inactif',
    pending: 'En attente de connexion',
    retired: 'Remplacé par une reconnexion',
    revoked: 'Accès révoqué'
  }
}
