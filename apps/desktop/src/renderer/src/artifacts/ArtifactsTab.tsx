// The "Артефакты" center tab (task 1.6.B7.4). Contract:
// specs/external-surfaces.md.
//
// Placement follows PLAN §"Карта размещения экранов": artifacts and the map are
// center tabs, "там уже живут вьюеры".
//
// Two rules run through the whole component and are worth stating once:
//
// - **The list is a heuristic, and the tab admits it.** A row is a string that
//   LOOKED like a file in the transcript. Whether that file exists is checked
//   against the disk, per row, and a row whose file is gone is MARKED rather
//   than dropped — dropping it would hide the fact that the agent's output was
//   removed or renamed.
// - **Nothing is opened from here.** A file is revealed in the OS file manager
//   (select, not launch); a link goes through the app's existing external-link
//   policy. See the handlers in main for why launching is not offered.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { CopyIcon, FolderOpenIcon, SearchIcon } from '../shell/icons'
import type { ArtifactKind, ArtifactRecord } from './artifact-extract'
import ArtifactPreview from './ArtifactPreview'
import {
  ARTIFACTS_EMPTY_HINT,
  ARTIFACTS_NO_SESSIONS_HINT,
  scanArtifacts,
  type ArtifactScan
} from './artifact-source'

type Filter = 'all' | ArtifactKind

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'image', label: 'Картинки' },
  { id: 'file', label: 'Файлы' },
  { id: 'link', label: 'Ссылки' }
]

const KIND_LABEL: Record<ArtifactKind, string> = {
  image: 'картинка',
  file: 'файл',
  link: 'ссылка'
}

/** Disk state per artifact value, filled in lazily as rows come into the list.
 * `undefined` means "not asked yet" — deliberately distinct from `false`, so a
 * row is never marked missing before anything checked. */
type Presence = Map<string, boolean>

function formatWhen(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

export default function ArtifactsTab(): JSX.Element {
  const [scan, setScan] = useState<ArtifactScan | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [presence, setPresence] = useState<Presence>(() => new Map())
  const [selected, setSelected] = useState<ArtifactRecord | null>(null)
  const [notice, setNotice] = useState('')
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    setBusy(true)
    setNotice('')
    const result = await scanArtifacts(window.aecpilot)
    if (!mounted.current) return
    setScan(result)
    setPresence(new Map())
    setSelected(null)
    setBusy(false)
  }, [])

  // The first scan runs through a microtask, not straight out of the effect
  // body: `refresh` sets `busy` synchronously, and `react-hooks/
  // set-state-in-effect` (correctly) does not distinguish that from a render
  // cascade. Same shape as `GoalBadge`'s startup read.
  useEffect(() => {
    mounted.current = true
    queueMicrotask(() => {
      if (mounted.current) void refresh()
    })
    return () => {
      mounted.current = false
    }
  }, [refresh])

  const artifacts = useMemo(() => scan?.artifacts ?? [], [scan])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return artifacts.filter((record) => {
      if (filter !== 'all' && record.kind !== filter) return false
      if (!needle) return true
      return (
        record.label.toLowerCase().includes(needle) ||
        record.value.toLowerCase().includes(needle) ||
        record.sessionTitle.toLowerCase().includes(needle)
      )
    })
  }, [artifacts, filter, query])

  // Existence is checked for the rows on screen, not for the whole scan: a
  // project with hundreds of artifacts would otherwise `stat` all of them on
  // every open, and the filter narrows the list far more often than not.
  useEffect(() => {
    let active = true
    const unchecked = visible.filter(
      (record) => record.kind !== 'link' && !presence.has(record.value)
    )
    if (unchecked.length === 0) return
    void (async () => {
      const found: [string, boolean][] = []
      for (const record of unchecked.slice(0, 60)) {
        const result = await window.aecpilot.statArtifact(record.value)
        found.push([record.value, result.ok ? result.exists : false])
      }
      if (active && found.length > 0) {
        setPresence((current) => {
          const next = new Map(current)
          for (const [value, exists] of found) next.set(value, exists)
          return next
        })
      }
    })()
    return () => {
      active = false
    }
  }, [visible, presence])

  async function reveal(record: ArtifactRecord): Promise<void> {
    setNotice('')
    const result =
      record.kind === 'link'
        ? await window.aecpilot.openExternalLink(record.value)
        : await window.aecpilot.revealArtifact(record.value)
    if (!result.ok) setNotice(result.error ?? 'Не удалось открыть')
  }

  async function copyPath(record: ArtifactRecord): Promise<void> {
    setNotice('')
    try {
      await navigator.clipboard.writeText(record.value)
      setNotice('Путь скопирован')
    } catch {
      setNotice('Не удалось скопировать — буфер обмена недоступен')
    }
  }

  if (scan === null) {
    return <div className="artifacts__state">Собираем артефакты из истории сессий…</div>
  }

  if (scan.error) {
    return (
      <div className="artifacts__state artifacts__state--error" role="alert">
        <strong>Не удалось собрать артефакты</strong>
        <span>{scan.error}</span>
        <button
          type="button"
          className="artifacts__btn"
          onClick={() => void refresh()}
          disabled={busy}
        >
          Повторить
        </button>
      </div>
    )
  }

  return (
    <div className="artifacts">
      <div className="artifacts__toolbar">
        <div className="artifacts__filters" role="tablist" aria-label="Вид артефакта">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={`artifacts__filter${filter === item.id ? ' artifacts__filter--active' : ''}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span className="artifacts__count">
                {item.id === 'all'
                  ? artifacts.length
                  : artifacts.filter((record) => record.kind === item.id).length}
              </span>
            </button>
          ))}
        </div>
        <label className="artifacts__search">
          <SearchIcon aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Поиск по имени, пути или сессии"
            aria-label="Поиск по артефактам"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="artifacts__btn"
          onClick={() => void refresh()}
          disabled={busy}
        >
          {busy ? 'Обновляем…' : 'Обновить'}
        </button>
      </div>

      {scan.skipped.length > 0 && (
        <div className="artifacts__warning">
          Не удалось прочитать историю {scan.skipped.length} сессий из{' '}
          {scan.scanned + scan.skipped.length}: {scan.skipped.map((row) => row.title).join(', ')}.
          Показано то, что прочиталось.
        </div>
      )}
      {notice && <div className="artifacts__notice">{notice}</div>}

      {artifacts.length === 0 ? (
        <div className="artifacts__state">
          {scan.scanned === 0 ? ARTIFACTS_NO_SESSIONS_HINT : ARTIFACTS_EMPTY_HINT}
        </div>
      ) : visible.length === 0 ? (
        <div className="artifacts__state">Под фильтр и запрос ничего не подошло.</div>
      ) : (
        <div className="artifacts__body">
          <ul className="artifacts__list">
            {visible.map((record) => {
              const missing = presence.get(record.value) === false
              return (
                <li
                  key={record.id}
                  className={`artifacts__row${selected?.id === record.id ? ' artifacts__row--active' : ''}`}
                >
                  <button
                    type="button"
                    className="artifacts__pick"
                    onClick={() => setSelected(record)}
                  >
                    <span className="artifacts__name">
                      {record.label}
                      {missing && <span className="artifacts__missing">нет на диске</span>}
                    </span>
                    <span className="artifacts__meta">
                      {KIND_LABEL[record.kind]} · {record.sessionTitle}
                      {formatWhen(record.timestamp) ? ` · ${formatWhen(record.timestamp)}` : ''}
                    </span>
                    <span className="artifacts__path">{record.value}</span>
                  </button>
                  <span className="artifacts__actions">
                    <button
                      type="button"
                      className="artifacts__icon-btn"
                      title={record.kind === 'link' ? 'Открыть ссылку' : 'Показать в проводнике'}
                      aria-label={
                        record.kind === 'link' ? 'Открыть ссылку' : 'Показать в проводнике'
                      }
                      onClick={() => void reveal(record)}
                    >
                      <FolderOpenIcon aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="artifacts__icon-btn"
                      title="Копировать путь"
                      aria-label="Копировать путь"
                      onClick={() => void copyPath(record)}
                    >
                      <CopyIcon aria-hidden="true" />
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
          {selected && (
            <ArtifactPreview
              key={selected.id}
              record={selected}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}
