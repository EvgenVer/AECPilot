/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ar_cron_control.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { CronControlCopy } from './types_cron_control'

export const arCronControl: CronControlCopy = {
  stop: 'إيقاف',
  stopping: 'جارٍ الإيقاف…',
  stopped: 'أُلغي التشغيل',
  finishedFirst: 'انتهى التشغيل قبل إيقافه',
  nothingToStop: 'لا يوجد تشغيل جارٍ',
  failedStop: 'تعذّر إيقاف التشغيل',
  lastCancelled: (reason: string) => (reason ? `أُلغي آخر تشغيل: ${reason}` : 'أُلغي آخر تشغيل'),
  catchUpLabel: 'التشغيلات الفائتة',
  catchUpHint: 'ما يحدث للتشغيلات الفائتة أثناء توقف Hermes.',
  catchUpChoices: {
    default: 'استخدام الإعداد الافتراضي',
    run: 'تشغيل مرة واحدة عند العودة',
    skip: 'تخطيها'
  }
}
