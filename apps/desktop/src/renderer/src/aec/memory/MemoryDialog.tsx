// Что человек видит и чем управляет в памяти агента (задача 5.4).
//
// ЗАПИСКА ПРАВИТСЯ ТЕКСТОМ, и это требование спеки дословно: «видит записку слоя
// 1 как текст и правит её текстом». Никакого разбора на пункты — у ядра записка
// и есть текст, а всякий разбор добавил бы формат, которого в ней нет.
//
// СЧЁТЧИК ЗНАКОВ РЯДОМ С ПРЕДЕЛОМ — не украшение. Записка уезжает в системный
// промпт ЦЕЛИКОМ каждый ход, и человек имеет право видеть цену до того, как
// отказ случится.
//
// ПРО СПИСОК ФАКТОВ СКАЗАНО ПРЯМО, А НЕ СКРЫТО. Спека просит ещё и список памяти
// проекта с поиском и удалением; его здесь нет, и причина не в забывчивости:
// встроенный qdrant держит свою папку исключительно, и при живом ядре прочитать
// её нашим процессом нельзя (замер `runtime/memory-store-access-probe.mjs`).
// Пустое место с объяснением честнее, чем список, который врал бы.

import { useStore } from '@nanostores/react'
import { useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'

import { $memoryNotes, $memoryOpen, saveMemoryNote, setAutowrite } from './store'

function NoteEditor({ target }: { target: 'memory' | 'user' }): React.JSX.Element {
  const view = useStore($memoryNotes)
  const t = useAecT()
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')

  const saved = view[target]
  const text = draft ?? saved
  const limit = view.limits[target]
  const dirty = draft !== null && draft !== saved

  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold text-(--ui-text-primary)">
        {t(target === 'memory' ? 'memoryScreen.agentNote' : 'memoryScreen.userNote')}
      </h3>
      <p className="text-xs text-(--ui-text-secondary)">
        {t(target === 'memory' ? 'memoryScreen.agentNoteHint' : 'memoryScreen.userNoteHint')}
      </p>
      <textarea
        aria-label={t(target === 'memory' ? 'memoryScreen.agentNote' : 'memoryScreen.userNote')}
        className="min-h-24 w-full resize-y rounded border border-(--ui-border) bg-(--ui-bg-primary) p-2 font-mono text-xs text-(--ui-text-primary)"
        onChange={(event) => {
          setDraft(event.target.value)
          setError('')
        }}
        value={text}
      />
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            text.length > limit
              ? 'text-xs text-(--ui-text-danger)'
              : 'text-xs text-(--ui-text-secondary)'
          }
        >
          {t('memoryScreen.counter', text.length, limit)}
        </span>
        <Button
          disabled={!dirty}
          onClick={async () => {
            const refusal = await saveMemoryNote(target, text)
            setError(refusal)
            if (!refusal) setDraft(null)
          }}
          size="sm"
          variant="secondary"
        >
          {t('memoryScreen.save')}
        </Button>
      </div>
      {error && <p className="text-xs text-(--ui-text-danger)">{error}</p>}
    </section>
  )
}

export default function MemoryDialog(): React.JSX.Element | null {
  const open = useStore($memoryOpen)
  const view = useStore($memoryNotes)
  const t = useAecT()
  const [toggleError, setToggleError] = useState('')

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => $memoryOpen.set(false)}
      role="presentation"
    >
      <div
        aria-label={t('memoryScreen.title')}
        aria-modal="true"
        className="flex max-h-[85vh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-lg bg-(--ui-bg-secondary) p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-sm font-semibold text-(--ui-text-primary)">
          {t('memoryScreen.title')}
        </h2>

        {view.error && <p className="text-xs text-(--ui-text-danger)">{view.error}</p>}

        <NoteEditor target="user" />
        <NoteEditor target="memory" />

        <section className="flex flex-col gap-1 border-t border-(--ui-border) pt-3">
          <label className="flex items-center gap-2 text-xs text-(--ui-text-primary)">
            <input
              checked={view.autowrite}
              onChange={async (event) => {
                setToggleError(await setAutowrite(event.target.checked))
              }}
              type="checkbox"
            />
            {t('memoryScreen.autowrite')}
          </label>
          <p className="text-xs text-(--ui-text-secondary)">{t('memoryScreen.autowriteHint')}</p>
          {toggleError && <p className="text-xs text-(--ui-text-danger)">{toggleError}</p>}
        </section>

        <section className="flex flex-col gap-1 border-t border-(--ui-border) pt-3">
          <h3 className="text-xs font-semibold text-(--ui-text-primary)">
            {t('memoryScreen.projectFacts')}
          </h3>
          <p className="text-xs text-(--ui-text-secondary)">{t('memoryScreen.projectFactsGap')}</p>
        </section>

        <div className="flex justify-end">
          <Button onClick={() => $memoryOpen.set(false)} size="sm" variant="secondary">
            {t('memoryScreen.close')}
          </Button>
        </div>
      </div>
    </div>
  )
}
