// Что человек видит и чем управляет в памяти агента (задачи 5.4 и 5.16).
//
// ЗАПИСКА ПРАВИТСЯ ТЕКСТОМ, и это требование спеки дословно: «видит записку слоя
// 1 как текст и правит её текстом». Никакого разбора на пункты — у ядра записка
// и есть текст, а всякий разбор добавил бы формат, которого в ней нет.
//
// СЧЁТЧИК ЗНАКОВ РЯДОМ С ПРЕДЕЛОМ — не украшение. Записка уезжает в системный
// промпт ЦЕЛИКОМ каждый ход, и человек имеет право видеть цену до того, как
// отказ случится.
//
// СПИСОК ФАКТОВ ПРОЕКТА ЖИВЁТ ПОД УСЛОВИЕМ, и условие названо до нажатия.
// Хранилище слоя 2 — встроенная база, и работающее ядро держит её папку
// исключительно (замер `runtime/memory-store-access-probe.mjs`). Поэтому список
// читается при остановленном агенте: цена — оборванный разговор, и человек
// соглашается на неё кнопкой, а не узнаёт после. Пока список открыт, страница
// говорит, что агент стоит; кнопка «Скрыть» и уход со страницы поднимают его
// обратно.
//
// СТРАНИЦА, А НЕ ОКНО (задача 3H.8, SPEC UR43): окно жило в строке состояния и
// пропадало вместе с ней (D-189). Факты — первая вкладка, записка ядра — вторая:
// «запомни» пишет в факты, и человек ищет сказанное именно там (D-190).

import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import type { MemoryFact } from '../../../../shared/ipc'
import { PageSearchShell } from '../../donor/app/page-search-shell'
import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'

import {
  $memoryFacts,
  $memoryNotes,
  closeMemoryFacts,
  deleteMemoryFact,
  openMemoryFacts,
  refreshMemoryNotes,
  saveMemoryNote,
  setAutowrite
} from './store'

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

function FactRow({ fact }: { fact: MemoryFact }): React.JSX.Element {
  const t = useAecT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  return (
    <li className="flex flex-col gap-1 border-t border-(--ui-border) py-2 first:border-t-0">
      <p className="text-xs text-(--ui-text-primary)">{fact.text}</p>
      <div className="flex items-center gap-2">
        {fact.created_at && (
          <span className="text-xs text-(--ui-text-secondary)">{fact.created_at.slice(0, 10)}</span>
        )}
        {fact.channel && (
          <span className="text-xs text-(--ui-text-secondary)">
            {t('memoryScreen.factsChannel', fact.channel)}
          </span>
        )}
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            // Строка исчезает сама — она уходит из списка вместе с фактом. Гасить
            // занятость после удачи незачем, а после отказа нужно: кнопка должна
            // снова работать.
            const refusal = await deleteMemoryFact(fact.id)
            if (refusal) {
              setError(refusal)
              setBusy(false)
            }
          }}
          size="sm"
          variant="text"
        >
          {t('memoryScreen.factsDelete')}
        </Button>
      </div>
      {error && <p className="text-xs text-(--ui-text-danger)">{error}</p>}
    </li>
  )
}

function ProjectFacts(): React.JSX.Element {
  const t = useAecT()
  const view = useStore($memoryFacts)
  const [query, setQuery] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState('')

  const needle = query.trim().toLowerCase()
  const rows = needle
    ? view.facts.filter((fact) => fact.text.toLowerCase().includes(needle))
    : view.facts

  const hide = async (): Promise<void> => {
    setRestoring(true)
    const refusal = await closeMemoryFacts()
    setRestoring(false)
    setError(refusal)
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-(--ui-text-primary)">
        {t('memoryScreen.projectFacts')}
      </h3>

      {view.state === 'idle' && (
        <>
          <p className="text-xs text-(--ui-text-secondary)">{t('memoryScreen.factsWhyStop')}</p>
          <div className="flex justify-start">
            <Button onClick={() => void openMemoryFacts()} size="sm" variant="secondary">
              {t('memoryScreen.factsShow')}
            </Button>
          </div>
        </>
      )}

      {view.state === 'reading' && (
        <p className="text-xs text-(--ui-text-secondary)">{t('memoryScreen.factsReading')}</p>
      )}

      {view.state === 'failed' && (
        <>
          <p className="text-xs text-(--ui-text-danger)">
            {view.busy ? t('memoryScreen.factsBusy') : view.error}
          </p>
          {/* Агент к этому моменту уже остановлен нами — кнопка поднимает его
              обратно, а не просто прячет сообщение. */}
          <div className="flex justify-start">
            <Button disabled={restoring} onClick={() => void hide()} size="sm" variant="secondary">
              {t(restoring ? 'memoryScreen.factsRestoring' : 'memoryScreen.factsHide')}
            </Button>
          </div>
        </>
      )}

      {view.state === 'open' && (
        <>
          <p className="text-xs text-amber-500">{t('memoryScreen.factsStopped')}</p>
          <input
            aria-label={t('memoryScreen.factsSearch')}
            className="w-full rounded border border-(--ui-border) bg-(--ui-bg-primary) p-1.5 text-xs text-(--ui-text-primary)"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('memoryScreen.factsSearch')}
            type="search"
            value={query}
          />
          <span className="text-xs text-(--ui-text-secondary)">
            {t('memoryScreen.factsCount', view.facts.length)}
          </span>
          {rows.length === 0 ? (
            <p className="text-xs text-(--ui-text-secondary)">
              {t(needle ? 'memoryScreen.factsNoMatch' : 'memoryScreen.factsEmpty')}
            </p>
          ) : (
            <ul className="flex flex-col">
              {rows.map((fact) => (
                <FactRow fact={fact} key={fact.id} />
              ))}
            </ul>
          )}
          <div className="flex justify-start">
            <Button disabled={restoring} onClick={() => void hide()} size="sm" variant="secondary">
              {t(restoring ? 'memoryScreen.factsRestoring' : 'memoryScreen.factsHide')}
            </Button>
          </div>
        </>
      )}

      {error && <p className="text-xs text-(--ui-text-danger)">{error}</p>}
    </section>
  )
}

function Notes(): React.JSX.Element {
  const view = useStore($memoryNotes)
  const t = useAecT()
  const [toggleError, setToggleError] = useState('')

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  )
}

type MemoryTab = 'facts' | 'notes'

export default function MemoryPage(): React.JSX.Element {
  const t = useAecT()
  const [tab, setTab] = useState<MemoryTab>('facts')

  useEffect(() => {
    // Записку пишет и сам агент своим инструментом — читаем её при каждом входе,
    // иначе человеку предложат затереть чужую правку.
    void refreshMemoryNotes()
    // Ушёл со страницы со списком фактов — агент поднимается обратно. Ждать
    // некому: страницы уже нет, а отказ поднять агента ядро покажет само.
    return () => {
      if ($memoryFacts.get().state !== 'idle') void closeMemoryFacts()
    }
  }, [])

  return (
    <PageSearchShell
      activeTab={tab}
      aria-label={t('memoryScreen.title')}
      onSearchChange={() => undefined}
      onTabChange={(id) => setTab(id as MemoryTab)}
      searchHidden
      searchPlaceholder=""
      searchValue=""
      tabs={[
        { id: 'facts', label: t('memoryScreen.tabFacts') },
        { id: 'notes', label: t('memoryScreen.tabNotes') }
      ]}
    >
      <div className="h-full overflow-y-auto px-6 pb-6 pt-2">
        <div className="max-w-2xl">{tab === 'facts' ? <ProjectFacts /> : <Notes />}</div>
      </div>
    </PageSearchShell>
  )
}
