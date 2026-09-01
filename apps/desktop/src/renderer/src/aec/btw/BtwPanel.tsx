// Панель побочного вопроса (задача 3.B3ж).
//
// Вопрос про текущий разговор, который НЕ становится его частью: ядро снимает
// копию ленты, спрашивает вспомогательную модель и присылает ответ событием.
// История, чередование ролей и кэш промпта остаются как были — это и есть
// единственная причина, по которой поверхность отдельная, а не ещё одна кнопка
// в поле ввода.

import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { $activeSessionId } from '../../donor/store/session'
import { useAecT } from '../../shared/i18n'

import { type BtwAccepted, btwParams, checkQuestion, isAnswerFor, readAnswer } from './btw-pure'

type Phase = 'idle' | 'asking' | 'answered' | 'failed'

export function BtwPanel(): React.JSX.Element {
  const sessionId = useStore($activeSessionId) ?? ''
  const t = useAecT()

  const [question, setQuestion] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [answer, setAnswer] = useState('')
  const taskId = useRef('')

  // Ответ приходит СОБЫТИЕМ, а не значением вызова: `prompt.btw` отвечает
  // идентификатором задачи сразу, а модель отвечает потом. Слушаем тот же
  // канал, которым идёт вся лента, — своего сокета у окна нет (SPEC C9).
  useEffect(() => {
    return window.aecpilot.onChatEvent((event) => {
      if (!taskId.current || !isAnswerFor(event, taskId.current)) return
      const parsed = readAnswer(event)
      taskId.current = ''
      setAnswer(parsed.text)
      setPhase(parsed.failed ? 'failed' : 'answered')
    })
  }, [])

  const ask = async (): Promise<void> => {
    const checked = checkQuestion(question)
    if (!checked.ok || !sessionId) return

    setPhase('asking')
    setAnswer('')
    try {
      const outcome = await window.aecpilot.gatewayRpc<BtwAccepted>(
        'prompt.btw',
        btwParams(sessionId, checked.text)
      )
      // Отказ шлюза приходит значением, а не исключением, и показывается как
      // есть: код 4012 («text required») сюда не дойдёт — пустой вопрос
      // отсечён выше, — а вот отказ по сессии дойдёт, и молчать о нём нельзя.
      if (!outcome.ok) {
        taskId.current = ''
        setAnswer(outcome.error.message)
        setPhase('failed')
        return
      }
      taskId.current = typeof outcome.value?.task_id === 'string' ? outcome.value.task_id : ''
      // Ядро приняло вопрос, но идентификатора не дало — ответ узнать не по
      // чему, и честнее сказать об этом сразу, чем ждать вечно.
      if (!taskId.current) {
        setAnswer(t('btw.noTask'))
        setPhase('failed')
      }
    } catch (error) {
      taskId.current = ''
      setAnswer(error instanceof Error ? error.message : String(error))
      setPhase('failed')
    }
  }

  const ready = checkQuestion(question).ok && Boolean(sessionId) && phase !== 'asking'

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <p className="text-xs text-(--ui-text-secondary)">{t('btw.hint')}</p>

      <textarea
        aria-label={t('btw.title')}
        className="min-h-16 resize-none rounded border border-(--ui-border) bg-(--ui-input-background) p-2 text-sm"
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={sessionId ? t('btw.placeholder') : t('btw.noSession')}
        value={question}
      />

      <button
        className="self-end rounded bg-(--ui-control-active-background) px-2 py-1 text-xs disabled:opacity-50"
        disabled={!ready}
        onClick={() => void ask()}
        type="button"
      >
        {phase === 'asking' ? t('btw.asking') : t('btw.ask')}
      </button>

      {phase !== 'idle' && phase !== 'asking' ? (
        <div
          className={
            phase === 'failed'
              ? 'min-h-0 flex-1 overflow-y-auto text-sm whitespace-pre-wrap text-(--ui-text-danger)'
              : 'min-h-0 flex-1 overflow-y-auto text-sm whitespace-pre-wrap'
          }
          role="status"
        >
          {answer || t('btw.emptyAnswer')}
        </div>
      ) : null}
    </div>
  )
}
