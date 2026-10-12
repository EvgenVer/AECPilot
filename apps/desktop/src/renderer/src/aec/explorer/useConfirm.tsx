// Вопрос «вы уверены?» своим окном, а не `window.confirm` (дефект D-204).
//
// Системное окно Electron на Windows оставляет страницу без фокуса клавиатуры:
// после него поля ввода и выпадающие списки не откликаются, пока окно
// приложения не перещёлкнуть (electron/electron#31917, #40212; исправлено в
// Electron 44.5, у нас 43). Владелец наткнулся на это после «Убрать из индекса»:
// на вкладке «Граф» не раскрывался фильтр по документу.
//
// Обещание, как у `NamePrompt`: вызывающий код читается прежним линейным
// сценарием — спросил, получил ответ, сделал.

import { useCallback, useState } from 'react'

import { ConfirmDialog } from '../../donor/components/ui/confirm-dialog'
import { useAecT } from '../../shared/i18n'

interface Question {
  confirmLabel: string
  message: string
  resolve: (yes: boolean) => void
}

export function useConfirm(): {
  confirm: (message: string, confirmLabel: string) => Promise<boolean>
  dialog: React.JSX.Element | null
} {
  const t = useAecT()
  const [question, setQuestion] = useState<Question | null>(null)

  const confirm = useCallback(
    (message: string, confirmLabel: string) =>
      new Promise<boolean>((resolve) => setQuestion({ confirmLabel, message, resolve })),
    []
  )

  const dialog = question ? (
    <ConfirmDialog
      cancelLabel={t('common.cancel')}
      confirmLabel={question.confirmLabel}
      destructive
      dismissOnConfirm
      // Закрытие после «да» тоже зовёт onClose — второй ответ обещание не меняет.
      onClose={() => {
        question.resolve(false)
        setQuestion(null)
      }}
      onConfirm={() => question.resolve(true)}
      open
      title={question.message}
    />
  ) : null

  return { confirm, dialog }
}
