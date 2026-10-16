/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ar_update_channel.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export const arUpdateChannel = {
  title: 'قناة التحديث',
  description: 'المستقر يثبّت الإصدارات المنشورة فقط. «كل التزام» يتبع فرع main مع وصول التغييرات.',
  stable: 'الإصدارات المستقرة',
  main: 'كل التزام',
  stableConfirmTitle: 'التبديل إلى الإصدارات المستقرة؟',
  stableConfirmBody:
    'سينتقل Hermes إلى أحدث إصدار منشور، وقد يكون أقدم من الكود الذي تشغّله الآن. قد لا تُقرأ البيانات التي كتبها كود أحدث بشكل صحيح، لذا انسخها احتياطيًا أولًا.',
  stableConfirm: 'التبديل إلى المستقر',
  failed: 'تعذّر تغيير قناة التحديث',
  detailsLabel: 'القناة',
  branch: (b: string) => `الفرع: ${b}`,
  change: 'تغيير',
  latestRelease: (v: string) => `أنت على أحدث إصدار مستقر (${v}).`,
  rollbackTitle: (v: string) => `العودة إلى الإصدار المستقر ${v}`,
  rollbackBody: (v: string) => `هذا الإصدار أحدث من الإصدار المستقر ${v}. سيعيد التثبيت Hermes إلى ذلك الإصدار.`,
  rollbackAction: (v: string) => `العودة إلى ${v}`
}
