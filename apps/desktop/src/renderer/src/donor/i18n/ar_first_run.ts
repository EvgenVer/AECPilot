/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ar_first_run.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { FirstRunCopy } from './types_first_run'

export const arFirstRun: FirstRunCopy = {
  beats: {
    name: 'الاسم',
    theme: 'لون التمييز',
    layout: 'التخطيط',
    connectors: 'التطبيقات',
    plugins: 'الإضافات',
    tour: 'الجولة',
    build: 'المهمة الأولى'
  },
  namePlaceholder: 'اسمك',
  useName: name => `استخدام «${name}»`,
  install: 'تثبيت',
  installed: 'مثبّت',
  loading: 'جارٍ التحميل…',
  noPlugins: 'لا توجد إضافات لعرضها الآن.',
  noneChosen: 'لا شيء',
  noAnswer: 'لا توجد إجابة',
  answerRefused: 'لم تُقبل الإجابة',
  tours: {
    quick: 'جولة سريعة',
    full: 'أرني كل شيء',
    skip: 'تخطَّ، لنصنع شيئًا'
  },
  skippedAll: 'تم تخطي الإعداد',
  skip: 'تخطي الإعداد',
  skipTip: 'إنهاء الإعداد الموجَّه وفتح محادثة جديدة.',
  skipFailed: 'تعذّر تخطي الإعداد',
  localModel: {
    title: 'يمكن لهذا الكمبيوتر تشغيل نموذج محليًا',
    text: (model, size) => `${model} (${size}) يناسب أجهزتك. يعمل مجانًا، وتبقى محادثاتك على هذا الكمبيوتر.`,
    setUp: 'إعداده',
    notNow: 'ليس الآن'
  },
  intro: {
    greeting: 'مرحبًا، أنا Hermes.',
    plan: 'لنجهّز كل شيء لك، ثم ننجز معًا شيئًا رائعًا.'
  },
  rerun: {
    title: 'تشغيل الإعداد الأولي مرة أخرى',
    description: 'يفتح محادثة إعداد جديدة تمر بخطوات التشغيل الأول باستخدام نموذجك الحالي.',
    action: 'تشغيل مرة أخرى',
    failed: 'تعذّر بدء الإعداد الأولي'
  }
}
