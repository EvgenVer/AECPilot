// Вопрос «как назвать?» для проводника — новый файл, новая папка, новое имя.
//
// Своё окно, а не `window.prompt`: Electron его не реализует и бросает
// исключение (строка «prompt() is not supported» лежит в самом бинаре), так что
// до дефекта D-90 создание и переименование из проводника не работали вовсе —
// jsdom в vitest `prompt` подменял, и падение видел только человек. `confirm`
// Electron показывает, но после него окно теряет фокус клавиатуры (D-204), и
// подтверждение тоже своё — `useConfirm`.
//
// Ведёт себя как системный prompt: поле с подставленным значением, Enter —
// ответ, Escape и клик мимо — отказ.

import { useEffect, useRef, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'

export function NamePrompt({
  message,
  initial,
  onAnswer
}: {
  message: string
  initial: string
  /** `null` — человек отказался. */
  onAnswer: (name: string | null) => void
}): React.JSX.Element {
  const t = useAecT()
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/40 p-4"
      onClick={() => onAnswer(null)}
      role="presentation"
    >
      <form
        aria-label={message}
        aria-modal="true"
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-(--stroke-nous) bg-(--ui-chat-bubble-background) p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onAnswer(null)
        }}
        onSubmit={(event) => {
          event.preventDefault()
          onAnswer(value)
        }}
        role="dialog"
      >
        <label className="flex flex-col gap-1.5 text-xs text-(--ui-text-secondary)">
          {message}
          <input
            className="rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1.5 text-sm text-(--ui-text-primary) outline-none focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50"
            onChange={(event) => setValue(event.target.value)}
            ref={inputRef}
            type="text"
            value={value}
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button onClick={() => onAnswer(null)} size="sm" type="button" variant="text">
            {t('common.cancel')}
          </Button>
          <Button size="sm" type="submit">
            {t('common.ok')}
          </Button>
        </div>
      </form>
    </div>
  )
}
