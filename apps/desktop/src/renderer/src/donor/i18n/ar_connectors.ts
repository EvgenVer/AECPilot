/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ar_connectors.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { TranslationOverrides } from './define-locale'

export const arConnectors = {
  sessionImport: {
    title: 'المتابعة من تطبيق آخر',
    subtitle: 'انقل محادثة إلى Hermes وتابع من حيث توقفت.',
    action: 'استيراد جلسة',
    readingFrom: 'القراءة من',
    connectedComputer: 'الكمبيوتر المتصل',
    destination: 'الاستيراد إلى',
    all: 'الكل',
    search: 'البحث في الجلسات المحملة',
    scanning: 'جارٍ البحث عن المحادثات',
    scanError: 'تعذر العثور على الجلسات',
    scanHelp: 'تحقق من اتصال الخادم ثم أعد المحاولة. قد تحتاج الخوادم القديمة إلى تحديث.',
    empty: 'لا توجد محادثات',
    emptyHelp: 'ستظهر هنا جلسات Claude Code وCodex الموجودة على هذا الخادم.',
    noMatches: 'لا توجد محادثات مطابقة',
    searchHelp: 'جرّب عنوانًا أو مجلدًا آخر، أو حمّل المزيد من الجلسات.',
    skipped: 'تم تجاوز بعض السجلات الفارغة أو غير المقروءة أو الكبيرة جدًا.',
    more: 'تحميل المزيد من الجلسات',
    messages: 'رسائل',
    choose: 'محادثة تستحق المتابعة',
    chooseHelp: 'اختر جلسة لقراءة سجلها قبل نقلها إلى Hermes.',
    previewLoading: 'جارٍ فتح المعاينة',
    previewError: 'المعاينة غير متاحة',
    previewHelp: 'ربما تم نقل الملف الأصلي أو تغييره. حدّث القائمة وحاول مرة أخرى.',
    previewLimit: 'تم اختصار المعاينة لتسهيل القراءة. يتم استيراد المحادثة كاملة.',
    you: 'أنت',
    snapshot: 'هذه المحادثة موجودة بالفعل في Hermes. افتح نسختك الحالية للمتابعة.',
    copyNotice: 'ينسخ نص المحادثة دون تغيير الملفات الأصلية. لا يشمل مخرجات الأدوات أو الاستدلال.',
    importing: 'جارٍ الاستيراد…',
    open: 'فتح في Hermes',
    continue: 'المتابعة في Hermes',
    importError: 'تعذر استيراد هذه المحادثة.'
  }
} satisfies Pick<TranslationOverrides, 'sessionImport'>
