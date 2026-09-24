// Их тесты написаны под английскую систему: `lib/time.ts` строит
// `Intl.RelativeTimeFormat(undefined, …)`, то есть берёт локаль ОС, и их
// проверки ждут «… ago» (с пином 0.21.5 — `cron-detail.test.tsx`). На машине с
// русской Windows выходит «7 ч назад», и тест падает не из-за кода, а из-за
// машины. Переменные LANG/LC_ALL ICU под Windows не читает (замерено), поэтому
// умолчание закрепляется здесь — только в проекте `donor` и только когда
// вызывающий локаль не назвал.
const SystemRelativeTimeFormat = Intl.RelativeTimeFormat

Object.defineProperty(Intl, 'RelativeTimeFormat', {
  configurable: true,
  writable: true,
  value: class extends SystemRelativeTimeFormat {
    constructor(locales?: Intl.LocalesArgument, options?: Intl.RelativeTimeFormatOptions) {
      super(locales ?? 'en-US', options)
    }
  }
})
