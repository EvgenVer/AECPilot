/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ja_notices.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { TranslationOverrides } from './define-locale'

// Shell notices (remote-display toast, butterbar, keep-awake offer), spread into ja.ts.
export const jaNotices = {
  remoteDisplayBanner: {
    message: reason =>
      `ソフトウェアレンダリングが有効です — リモートディスプレイを検出しました（${reason}）。ちらつきを防ぐため GPU アクセラレーションは無効化されています。`
  },
  butterbar: {
    goTo: (index, total) => `お知らせ ${index} / ${total} を表示`,
    legal: {
      before: 'Hermes Agent のご利用には',
      terms: '利用規約',
      between: 'および',
      privacy: 'プライバシーポリシー',
      after: 'が適用されます。'
    }
  },
  keepAwakeOffer: {
    title: 'Hermes の作業中にコンピューターがスリープしました',
    message:
      'タスクの実行中は、Hermes がコンピューターのスリープを防げます。画面はいつもどおりオフになり、バッテリー駆動中はスリープすることがあります。',
    action: '実行中はスリープしない'
  }
} satisfies Pick<TranslationOverrides, 'remoteDisplayBanner' | 'butterbar' | 'keepAwakeOffer'>
