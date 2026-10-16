/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/fr_notices.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { TranslationOverrides } from './define-locale'

// Shell notices (remote-display toast, butterbar, keep-awake offer), spread into fr.ts.
export const frNotices = {
  remoteDisplayBanner: {
    message: reason =>
      `Rendu logiciel actif — affichage distant détecté (${reason}). L'accélération GPU est désactivée pour éviter les scintillements.`
  },
  butterbar: {
    goTo: (index, total) => `Afficher l'avis ${index} sur ${total}`,
    legal: {
      before: "L'utilisation de Hermes Agent est soumise à nos ",
      terms: "Conditions d'utilisation",
      between: ' et à notre ',
      privacy: 'Politique de confidentialité',
      after: '.'
    }
  },
  keepAwakeOffer: {
    title: 'Votre ordinateur s’est mis en veille pendant que Hermes travaillait',
    message:
      'Hermes peut empêcher la mise en veille pendant qu’une tâche s’exécute. L’écran s’éteint toujours, et sur batterie l’ordinateur peut quand même se mettre en veille.',
    action: 'Empêcher la veille pendant le travail'
  }
} satisfies Pick<TranslationOverrides, 'remoteDisplayBanner' | 'butterbar' | 'keepAwakeOffer'>
