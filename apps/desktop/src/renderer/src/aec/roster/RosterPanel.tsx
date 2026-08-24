// Роестр специалистов (задача 3C.1, SPEC UR27). Контракт — specs/agent-roster.md.
//
// Специалист — это профиль ядра, у которого есть имя, роль и лицо. Экран
// показывает их списком и даёт четыре действия: завести, поправить, продублировать
// и удалить. Всё, что он показывает, живёт на машине ядра, а не здесь, — значит
// список одинаков на всех машинах, подключённых к тому же ядру, и переживает
// перезапуск сам собой.
//
// Порядок списка — от ядра и НЕ по активности: список, прыгающий от каждой
// реплики, нельзя читать глазами (их же урок, `active-now-strip`).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { openSession } from '../../donor/app/open-session'
import { Button } from '../../donor/components/ui/button'
import { Codicon } from '../../donor/components/ui/codicon'
import { useAecT } from '../../shared/i18n'
import type { SpecialistView } from '../../../../shared/ipc'

import { setCanonicalChats } from './register-canonical-guard'
import { setMentionRoster } from './register-mentions'
import { GroupPanel } from './GroupPanel'
import { SpecialistDialog, type SpecialistDraft } from './SpecialistDialog'
import { SpecialistFace } from './SpecialistFace'

const ROSTER_KEY = ['aec', 'roster'] as const

export function RosterPanel(): React.JSX.Element {
  const t = useAecT()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [editing, setEditing] = useState<SpecialistDraft | null>(null)
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  const { data: roster } = useQuery({
    queryKey: ROSTER_KEY,
    queryFn: () => window.aecpilot.listRoster()
  })

  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ROSTER_KEY }),
    [queryClient]
  )

  // Ответ ядра о том, куда легли поля, — это три исхода, а не два (их урок
  // `bot-meta-persistence`): старое ядро сохраняет только здесь, и это не отказ.
  const report = useCallback(
    (result: { ok: boolean; outcome?: string; error?: string; failed?: string[] }): boolean => {
      // Раздел, который не лёг, называется по имени: «не сохранилось» без
      // «что именно» человеку делать нечего (их урок `model-inherit`).
      const sections = result.failed ?? []
      setError(
        result.ok
          ? undefined
          : // Расхождение версий — не «не сохранилось», а «сохранять было уже
            // некуда»: пока человек правил, это изменили в другом окне. Сказать
            // ему надо именно это, иначе он нажмёт ещё раз и затрёт чужое.
            result.outcome === 'conflict'
            ? t('roster.saveConflict')
            : sections.length > 0
              ? t('roster.sectionsFailed', sections.join(', '))
              : (result.error ?? t('roster.failed'))
      )
      setNotice(result.ok && result.outcome === 'local-only' ? t('roster.localOnly') : undefined)
      return result.ok
    },
    [t]
  )

  const save = useMutation({
    mutationFn: (draft: SpecialistDraft) =>
      draft.isNew
        ? window.aecpilot.createSpecialist(draft.input)
        : window.aecpilot.saveSpecialist(draft.input),
    onSuccess: async (result) => {
      if (report(result)) setEditing(null)
      await reload()
    }
  })

  const duplicate = useMutation({
    mutationFn: (name: string) => window.aecpilot.duplicateSpecialist(name),
    onSuccess: async (result) => {
      report(result)
      await reload()
    }
  })

  // Задача 3C.3. Картинка выбирается диалогом ГЛАВНОГО процесса: путь, который
  // окно не получило от человека через доверенный диалог, — это путь, которого у
  // него быть не должно. Уходит она сразу и отдельно от формы: весит больше, чем
  // помещается в метаданные профиля.
  const pickPicture = useMutation({
    mutationFn: async (name: string) => {
      const picked = await window.aecpilot.selectPaths({
        filters: [
          { name: t('roster.facePictureFilter'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }
        ]
      })
      if (picked.length === 0) return { ok: true }
      return window.aecpilot.setSpecialistAvatar({ name, filePath: picked[0] })
    },
    onSuccess: async (result) => {
      report(result)
      await reload()
    }
  })

  // Задача 3C.4. Щелчок по специалисту открывает ЕГО постоянный чат: какую
  // сессию — решает главный процесс (там привязка и там видно, ответило ли
  // ядро), а открывает её их же оболочка, как любую другую.
  const openChat = useMutation({
    mutationFn: (specialist: SpecialistView) =>
      window.aecpilot.openSpecialistChat({
        name: specialist.name,
        pin: specialist.chatSessionId
      }),
    onSuccess: async (result) => {
      if (!report(result)) return
      if (result.sessionId) openSession(result.sessionId, () => {}, 'in-place')
      // Новая сессия меняет привязку — список надо перечитать, иначе сторож
      // `/new` будет сторожить вчерашний чат.
      if (result.created) await reload()
    }
  })

  // Задача 3C.8. Скрыть — не значит выключить: обращения по имени доходят,
  // рутины идут. Это только про место в списке.
  const hide = useMutation({
    mutationFn: (specialist: SpecialistView) =>
      window.aecpilot.hideSpecialist({
        name: specialist.name,
        hidden: !specialist.hidden,
        // Версия того, что человек ВИДИТ. Если пока он смотрел на список, поле
        // изменили с другой машины, ядро откажет вместо тихой перезаписи.
        revision: specialist.revision
      }),
    onSuccess: async (result) => {
      report(result)
      await reload()
    }
  })

  const remove = useMutation({
    mutationFn: (name: string) => window.aecpilot.deleteSpecialist({ name, confirmed: true }),
    onSuccess: async (result) => {
      report(result)
      await reload()
    }
  })

  const visible = useMemo(() => {
    const all = roster ?? []
    const shown = showHidden ? all : all.filter((specialist) => !specialist.hidden)
    const needle = query.trim().toLowerCase()
    if (needle === '') return shown

    return shown.filter(
      (specialist) =>
        displayName(specialist).toLowerCase().includes(needle) ||
        specialist.name.toLowerCase().includes(needle) ||
        specialist.role.toLowerCase().includes(needle)
    )
  }, [roster, query, showHidden])

  const anyHidden = (roster ?? []).some((specialist) => specialist.hidden)

  // Сторож `/new` держит привязки у себя: он стоит на пути каждого сообщения, и
  // спрашивать главный процесс перед отправкой значило бы добавить обход IPC
  // туда, где его никто не ждёт.
  useEffect(() => {
    setCanonicalChats((roster ?? []).map((specialist) => specialist.chatSessionId))
    // Скрытые в подсказке ОСТАЮТСЯ: скрытие убирает специалиста из списка, но
    // не из работы — обращение по имени до него доходит (задача 3C.8).
    setMentionRoster(
      (roster ?? []).map((specialist) => ({
        handle: specialist.name,
        title: specialist.title,
        role: specialist.role,
        // Машина пуста, пока подключение одно (решение владельца 2026-08-23:
        // реестр из одной записи). Двух одновременных подключений не бывает,
        // значит и одинаковых имён рядом — тоже; `@имя-машина` появится вместе
        // со вторым подключением, а не раньше.
        device: ''
      })),
      Object.fromEntries(
        (roster ?? [])
          .filter((specialist) => specialist.chatSessionId !== '')
          .map((specialist) => [specialist.chatSessionId, specialist.name])
      )
    )
  }, [roster])

  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-2 text-(--ui-text-primary)">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-(--ui-text-secondary)">{t('roster.title')}</span>
        <span className="flex gap-0.5">
          {anyHidden && (
            <Button
              aria-label={t('roster.showHidden')}
              onClick={() => setShowHidden((on) => !on)}
              size="icon-xs"
              title={t('roster.showHidden')}
              variant="ghost"
            >
              <Codicon name={showHidden ? 'eye' : 'eye-closed'} />
            </Button>
          )}
          <Button
            aria-label={t('roster.create')}
            onClick={() => setEditing(emptyDraft())}
            size="icon-xs"
            title={t('roster.create')}
            variant="ghost"
          >
            <Codicon name="add" />
          </Button>
        </span>
      </div>

      <input
        aria-label={t('roster.search')}
        className="w-full rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1 text-xs"
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('roster.search')}
        value={query}
      />

      {error && <div className="text-xs text-destructive">{error}</div>}
      {notice && <div className="text-xs text-(--ui-text-secondary)">{notice}</div>}

      {roster === undefined ? (
        <div className="text-xs text-(--ui-text-secondary)">{t('common.loading')}</div>
      ) : visible.length === 0 ? (
        <div className="text-xs text-(--ui-text-secondary)">
          {roster.length === 0 ? t('roster.empty') : t('roster.noMatches')}
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {visible.map((specialist) => (
            <li key={specialist.name}>
              <div
                className={`group flex items-center gap-2 rounded-[4px] px-1 py-1 hover:bg-(--chrome-action-hover) ${
                  specialist.hidden ? 'opacity-50' : ''
                }`}
              >
                <SpecialistFace specialist={specialist} />

                <button
                  className="flex min-w-0 flex-1 flex-col items-start text-left"
                  onClick={() => {
                    // Новые сессии тоже уходят этому специалисту: человек,
                    // открывший его чат, обращается к НЕМУ.
                    void window.aecpilot.useProfile(specialist.name)
                    openChat.mutate(specialist)
                  }}
                  type="button"
                >
                  <span className="flex min-w-0 items-center gap-1 text-xs font-medium">
                    <span className="truncate">{displayName(specialist)}</span>
                    {specialist.busy && (
                      // Задача 3C.4в. Работа специалиста идёт в сессии, которой
                      // в списках разговоров не видно вообще, — без этой метки
                      // роестр показывал бы покой у занятого.
                      <span
                        aria-label={t('roster.busy')}
                        className="size-1.5 shrink-0 rounded-full bg-(--ui-accent)"
                        title={t('roster.busy')}
                      />
                    )}
                  </span>
                  <span className="truncate text-[11px] text-(--ui-text-secondary)">
                    {specialist.role || specialist.preview}
                  </span>
                </button>

                <span className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                  <Button
                    aria-label={t('roster.edit')}
                    onClick={() => setEditing(draftOf(specialist))}
                    size="icon-xs"
                    title={t('roster.edit')}
                    variant="ghost"
                  >
                    <Codicon name="edit" />
                  </Button>
                  <Button
                    aria-label={specialist.hidden ? t('roster.unhide') : t('roster.hide')}
                    onClick={() => hide.mutate(specialist)}
                    size="icon-xs"
                    title={specialist.hidden ? t('roster.unhide') : t('roster.hide')}
                    variant="ghost"
                  >
                    <Codicon name={specialist.hidden ? 'eye' : 'eye-closed'} />
                  </Button>
                  <Button
                    aria-label={t('roster.duplicate')}
                    onClick={() => duplicate.mutate(specialist.name)}
                    size="icon-xs"
                    title={t('roster.duplicate')}
                    variant="ghost"
                  >
                    <Codicon name="copy" />
                  </Button>
                  {!specialist.isDefault && (
                    <Button
                      aria-label={t('roster.delete')}
                      onClick={() => {
                        // Спрашивается ИМЕНЕМ: «удалить специалиста?» и «удалить
                        // Смету?» — разные вопросы для того, кто торопится.
                        if (window.confirm(t('roster.deleteConfirm', displayName(specialist)))) {
                          remove.mutate(specialist.name)
                        }
                      }}
                      size="icon-xs"
                      title={t('roster.delete')}
                      variant="ghost"
                    >
                      <Codicon name="trash" />
                    </Button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Комнаты — под списком специалистов: «с кем я работаю» и «кого я
          собираю вместе» это один взгляд, а не два экрана (задача 3C.6). */}
      <div className="border-t border-(--ui-border) pt-2">
        <GroupPanel roster={roster ?? []} />
      </div>

      {editing && (
        <SpecialistDialog
          busy={save.isPending || pickPicture.isPending}
          draft={editing}
          onCancel={() => setEditing(null)}
          onChange={setEditing}
          onPickPicture={() => pickPicture.mutate(editing.input.name)}
          onSubmit={() => save.mutate(editing)}
          roster={roster}
        />
      )}
    </div>
  )
}

function displayName(specialist: SpecialistView): string {
  return specialist.title.trim() === '' ? specialist.name : specialist.title.trim()
}

function emptyDraft(): SpecialistDraft {
  return { isNew: true, input: { name: '', title: '', role: '', description: '' } }
}

function draftOf(specialist: SpecialistView): SpecialistDraft {
  return {
    isNew: false,
    input: {
      name: specialist.name,
      title: specialist.title,
      role: specialist.role,
      description: specialist.description,
      face: specialist.face,
      // Версия ТОГО, что человек открыл на правку. Дальше она едет с формой до
      // самой записи: правка основана на этом, а не на том, что стало потом.
      revision: specialist.revision
    }
  }
}
