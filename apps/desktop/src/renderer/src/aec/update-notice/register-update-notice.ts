// Задача T42. Провод к уведомлению о новой версии; решает главный процесс
// (`main/update-check-pure.ts`), здесь только показ их уведомлением.
//
// ТОЛЬКО УВЕДОМЛЕНИЕ (решение владельца 2026-10-16): кнопка открывает ссылку на
// установщик в браузере через ту же политику внешних ссылок, что и ссылки из ответа
// агента; ставит человек сам, поверх — `data/` сохраняется (T30). Их окно обновления
// (`updates-overlay.tsx`) не используется: `updates` в шиме объявлен отсутствующим (HX4).

import { notify } from '../../donor/store/notifications'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

function t(key: string, ...args: unknown[]): string {
  return translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)
}

export async function registerUpdateNotice(): Promise<void> {
  let notice: Awaited<ReturnType<typeof window.aecpilot.checkForUpdate>> = null
  try {
    notice = await window.aecpilot.checkForUpdate()
  } catch {
    return
  }
  if (!notice) return

  const { url, version } = notice
  notify({
    id: 'aec-update-available',
    kind: 'info',
    icon: 'gift',
    durationMs: 0,
    title: t('updateNotice.title', version),
    message: t('updateNotice.message'),
    action: {
      label: t('updateNotice.download'),
      onClick: () => {
        void window.aecpilot.openExternalLink(url)
      }
    }
  })
}
