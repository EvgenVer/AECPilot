// Что человек видит до установки (задача 3.8, SPEC UR23).
//
// Требование короткое: «перед установкой показывается, что скил делает и какие
// инструменты требует; установка — явное подтверждение». Три вещи, которые этот
// диалог обязан удержать:
//
// 1. ОПИСАНИЕ БЕРЁТСЯ У ЯДРА, А НЕ У СТРАНИЦЫ ХАБА. Карточку в списке рисует
//    сама страница; верить её словам о содержимом пакета — это спрашивать у
//    продавца, стоит ли покупать. Отсюда `loadSkillDetails` → предпросмотр.
// 2. ОШИБКА ПРЕДПРОСМОТРА НЕ РАЗРЕШАЕТ УСТАНОВКУ. Если ядро не ответило,
//    показывается это — и подтверждение всё равно требуется. Обратное («не
//    смогли узнать, значит ладно») и есть тот путь, ради которого гейт писался.
// 3. ЗНАЧЕНИЯ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ НЕ ПОКАЗЫВАЮТСЯ. Там ключ доступа, который
//    человек только что ввёл; решение принимается по тому, ЧТО получит процесс.

import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle
} from '../../donor/components/ui/dialog'
import { useAecT } from '../../shared/i18n'

import type { SkillDetails } from './details'
import { $installConsent } from './store'

export default function InstallConsentDialog(): React.JSX.Element | null {
  const question = useStore($installConsent)
  const t = useAecT()
  // Ответ хранится ВМЕСТЕ с идентификатором, для которого он получен. Так
  // сброс при смене вопроса — это сравнение при отрисовке, а не `setState`
  // внутри эффекта: последнее вызывает каскад перерисовок и на секунду
  // показывает описание одного пакета в диалоге о другом.
  const [loaded, setLoaded] = useState<{ id: string; details?: SkillDetails; failed?: true }>({
    id: ''
  })

  const identifier = question?.kind === 'skill' ? question.label : ''

  useEffect(() => {
    if (identifier === '') return undefined

    let cancelled = false

    // Загрузчик подтягивается лениво: он тянет за собой их клиент целиком, а
    // диалог показывается редко и должен появляться сразу.
    import('./details')
      .then(({ loadSkillDetails }) => loadSkillDetails(identifier))
      .then((details) => {
        if (!cancelled) setLoaded({ id: identifier, details })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ id: identifier, failed: true })
      })

    return () => {
      cancelled = true
    }
  }, [identifier])

  const details = loaded.id === identifier ? loaded.details : undefined
  const failed = loaded.id === identifier && loaded.failed === true

  if (!question) return null

  const title =
    question.kind === 'skill-update'
      ? t('install.updateTitle')
      : question.kind === 'skill'
        ? t('install.skillTitle', details?.name ?? question.label)
        : t('install.serverTitle', question.label)

  const lead =
    question.kind === 'skill-update'
      ? t('install.updateLead')
      : question.kind === 'skill'
        ? t('install.skillLead')
        : t('install.serverLead')

  // Их `Dialog`, а не своя подложка: вопрос приходит и тогда, когда поверх
  // уже стоит их модальное окно («Connect to a custom MCP» ждёт ответа со
  // спиннером). Своя подложка лежала ПОД ним (`z-50` против их `--z-modal`), а
  // их слой к тому же гасит щелчки вне себя — человек не видел вопроса и не мог
  // ответить (замер 25.09.2026, позиция 29.4.1). Их диалог встаёт верхним слоем
  // стопки: он получает щелчки и фокус. Закрытие мимо кнопок — это отказ.
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) question.answer(false)
      }}
      open
    >
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogTitle className="text-sm font-semibold text-(--ui-text-primary)">
          {title}
        </DialogTitle>

        <DialogDescription className="text-xs text-(--ui-text-secondary)">{lead}</DialogDescription>

        {question.kind === 'skill' && (
          <div className="flex flex-col gap-2 text-xs text-(--ui-text-secondary)">
            {!details && !failed && <p>{t('common.loading')}</p>}
            {failed && <p>{t('install.previewFailed')}</p>}
            {details && (
              <>
                {details.description !== '' && (
                  <p className="text-(--ui-text-primary)">{details.description}</p>
                )}
                <p>{t('install.source', details.source || '—', details.trustLevel || '—')}</p>
                <p>{t('install.files', details.fileCount)}</p>
                <p className="text-(--ui-text-primary)">
                  {details.tools.length === 0
                    ? t('install.toolsUnrestricted')
                    : t('install.tools', details.tools.join(', '))}
                </p>
              </>
            )}
          </div>
        )}

        {question.command !== undefined && (
          <p className="rounded bg-(--ui-bg-tertiary) p-2 font-mono text-xs break-all text-(--ui-text-primary)">
            {question.command}
          </p>
        )}

        {question.envKeys !== undefined && question.envKeys.length > 0 && (
          <p className="text-xs text-(--ui-text-secondary)">
            {t('install.env', question.envKeys.join(', '))}
          </p>
        )}

        <DialogFooter>
          <Button onClick={() => question.answer(false)} size="sm" variant="ghost">
            {t('common.cancel')}
          </Button>
          <Button onClick={() => question.answer(true)} size="sm">
            {t('install.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
