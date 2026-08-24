// Комнаты: совещание с несколькими специалистами (задача 3C.6, SPEC UR27).
// Контракт — specs/agent-roster.md §Р5.
//
// ЧТО ЭТОТ ЭКРАН ОБЯЗАН ПОКАЗАТЬ, ПОМИМО ПЕРЕПИСКИ:
//
// * СКОЛЬКО УЧАСТНИКОВ ОТВЕТИТ — до отправки. Один вопрос в комнате из шести
//   при трёх кругах это до восемнадцати обращений к модели. Узнавать цену
//   постфактум человек не должен;
// * ПОЧЕМУ ТИХО. Лента круга (в очереди, работает, ответил, промолчал, не
//   успел, сорвался) свёрнута по умолчанию и не сохраняется. Без неё комната,
//   где двое думают, а один промолчал, выглядит зависшей — и человек отправляет
//   вопрос второй раз, платя за него дважды;
// * ЧТО НУЖЕН ЧЕЛОВЕК. `@user` в ответе участника поднимает пометку, и она
//   висит, пока человек не ответит сам. Спорное поднимается ему, а не
//   «решается» большинством.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '../../donor/components/ui/button'
import { Codicon } from '../../donor/components/ui/codicon'
import { useAecT } from '../../shared/i18n'
import { applyMention, mentionAtCaret } from '../../../../main/mentions-pure'
import type { GroupRoomView, RoomEventView, SpecialistView } from '../../../../shared/ipc'

const ROOMS_KEY = ['aec', 'rooms'] as const
const MIN_MEMBERS = 2
const MAX_MEMBERS = 6

function shownName(roster: SpecialistView[], name: string): string {
  const found = roster.find((one) => one.name === name)
  return found === undefined || found.title.trim() === '' ? name : found.title.trim()
}

export function GroupPanel({ roster }: { roster: SpecialistView[] }): React.JSX.Element {
  const t = useAecT()
  const queryClient = useQueryClient()
  const [openRoom, setOpenRoom] = useState<string>('')
  const [making, setMaking] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | undefined>(undefined)

  const { data: rooms } = useQuery({
    queryKey: ROOMS_KEY,
    queryFn: () => window.aecpilot.listRooms()
  })

  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ROOMS_KEY }),
    [queryClient]
  )

  const create = useMutation({
    mutationFn: () => window.aecpilot.createRoom({ members: picked }),
    onSuccess: async (result) => {
      setError(result.ok ? undefined : result.error)
      if (result.ok) {
        setMaking(false)
        setPicked([])
        if (result.id !== undefined) setOpenRoom(result.id)
      }
      await reload()
    }
  })

  const disband = useMutation({
    mutationFn: (id: string) => window.aecpilot.disbandRoom(id),
    onSuccess: async () => {
      setOpenRoom('')
      await reload()
    }
  })

  const toggle = (name: string): void =>
    setPicked((chosen) =>
      chosen.includes(name)
        ? chosen.filter((one) => one !== name)
        : chosen.length >= MAX_MEMBERS
          ? chosen
          : [...chosen, name]
    )

  const room = (rooms ?? []).find((one) => one.id === openRoom)

  if (room !== undefined) {
    return (
      <RoomView
        onBack={() => setOpenRoom('')}
        onDisband={() => disband.mutate(room.id)}
        room={room}
        roster={roster}
      />
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-(--ui-text-secondary)">{t('rooms.title')}</span>
        <Button onClick={() => setMaking((on) => !on)} size="sm" variant="text">
          {making ? t('rooms.cancel') : t('rooms.new')}
        </Button>
      </div>

      {error !== undefined && (
        <div className="text-[11px] text-(--ui-error-foreground)">{error}</div>
      )}

      {making && (
        <div className="flex flex-col gap-1 rounded-[4px] bg-(--ui-bg-tertiary) p-1.5">
          <span className="text-[11px] text-(--ui-text-secondary)">{t('rooms.pick')}</span>
          {roster.map((one) => (
            <label className="flex items-center gap-1 text-xs" key={one.name}>
              <input
                checked={picked.includes(one.name)}
                onChange={() => toggle(one.name)}
                type="checkbox"
              />
              {shownName(roster, one.name)}
            </label>
          ))}
          <Button
            disabled={picked.length < MIN_MEMBERS || create.isPending}
            onClick={() => create.mutate()}
            size="sm"
          >
            {t('rooms.create')}
          </Button>
        </div>
      )}

      {(rooms ?? []).map((one) => (
        <button
          className="flex items-center gap-1 rounded-[4px] px-1 py-0.5 text-left text-xs hover:bg-(--ui-bg-tertiary)"
          key={one.id}
          onClick={() => setOpenRoom(one.id)}
          type="button"
        >
          <Codicon name="organization" />
          <span className="flex-1 truncate">{one.title}</span>
          {/* Пометка «нужны вы» заметна не цветом одним: цвет теряется у тех,
              кто его не различает, а комната зовёт человека всерьёз. */}
          {one.needsYou && (
            <span className="rounded-[3px] bg-(--ui-warning-background) px-1 text-[10px] text-(--ui-warning-foreground)">
              {t('rooms.needsYou')}
            </span>
          )}
        </button>
      ))}

      {(rooms ?? []).length === 0 && !making && (
        <span className="text-[11px] text-(--ui-text-secondary)">{t('rooms.none')}</span>
      )}
    </div>
  )
}

/** Открытая комната: переписка, лента круга и поле ввода. */
function RoomView({
  room,
  roster,
  onBack,
  onDisband
}: {
  room: GroupRoomView
  roster: SpecialistView[]
  onBack: () => void
  onDisband: () => void
}): React.JSX.Element {
  const t = useAecT()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [events, setEvents] = useState<RoomEventView[]>([])
  const [showEvents, setShowEvents] = useState(false)
  const [willAnswer, setWillAnswer] = useState<string[]>([])
  /** ИМЕНА приложенных файлов. Путей у окна нет и быть не должно: их держит
   * главный процесс, который сам показал человеку диалог. */
  const [files, setFiles] = useState<string[]>([])
  /** Где стоит курсор. Нужен подсказке: без него непонятно, какое обращение
   * человек набирает — их в тексте может быть несколько. `-1` — подсказка
   * закрыта рукой. */
  const [caret, setCaret] = useState(-1)
  const [hintAt, setHintAt] = useState(0)
  const box = useRef<HTMLTextAreaElement | null>(null)
  const bottom = useRef<HTMLDivElement | null>(null)

  // Запомнен нарочно: этот ключ стоит в зависимостях подписки на ленту, и
  // новый массив на каждую отрисовку переподписывал бы её без конца.
  const transcriptKey = useMemo(() => ['aec', 'room', room.id] as const, [room.id])
  const { data: turns } = useQuery({
    queryKey: transcriptKey,
    queryFn: () => window.aecpilot.roomTranscript(room.id)
  })

  // Лента круга приходит из главного процесса по ходу разговора. Она НЕ
  // сохраняется: единственная запись остаётся сама переписка.
  useEffect(
    () =>
      window.aecpilot.onRoomEvent((event) => {
        if (event.room !== room.id) return
        setEvents((all) => [...all, event])

        // Опоздавший ответ ложится в переписку сам, уже после конца круга — и
        // окно об этом узнаёт только отсюда. Перечитываем: иначе реплика есть,
        // а на экране её нет до следующего вопроса.
        if (event.kind === 'answered') {
          void queryClient.invalidateQueries({ queryKey: transcriptKey })
        }
      }),
    [room.id, queryClient, transcriptKey]
  )

  // Сколько ответит — считается ядром по тому же правилу, что и сам круг.
  // Спрашивать окно не может: правило одно, и второй его копией оно разошлось бы.
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      void window.aecpilot
        .willAnswerInRoom({ id: room.id, text: draft })
        .then((who) => {
          if (alive) setWillAnswer(who)
        })
        .catch(() => undefined)
    }, 200)

    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [draft, room.id])

  const rename = useMutation({
    mutationFn: (title: string) => window.aecpilot.editRoom({ id: room.id, title }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROOMS_KEY })
  })

  const ask = useMutation({
    mutationFn: (text: string) => window.aecpilot.askRoom({ id: room.id, text }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: transcriptKey })
      await queryClient.invalidateQueries({ queryKey: ROOMS_KEY })
    }
  })

  const pickFiles = useMutation({
    mutationFn: () => window.aecpilot.pickRoomFiles(room.id),
    onSuccess: (result) => setFiles(result.names)
  })

  const dropFiles = useMutation({
    mutationFn: () => window.aecpilot.clearRoomFiles(room.id),
    onSuccess: () => setFiles([])
  })

  // Кого можно позвать в этой комнате: её участники плюс «все». Считается по
  // тому, что набрано ПОД КУРСОРОМ, — обращений в тексте может быть несколько.
  const typing = caret < 0 ? null : mentionAtCaret(draft, caret)
  // Без запоминания нарочно: список — это фильтр по семи именам, и городить
  // вокруг него зависимости дороже, чем посчитать его заново.
  const hints =
    typing === null
      ? []
      : [
          t('rooms.everyone'),
          ...room.members.map((name) => shownName(roster, name).replace(/\s+/g, '-'))
        ]
          // Пустой запрос показывает всех: человек нажал `@` и хочет увидеть
          // список, а не угадывать первую букву.
          .filter((one) => one.toLowerCase().startsWith(typing.query.toLowerCase()))

  const insertHint = (handle: string): void => {
    if (typing === null) return
    const next = applyMention(draft, typing.start, caret, handle)
    setDraft(next.text)
    setCaret(-1)
    setHintAt(0)
    // Курсор ставится после вставленного имени: продолжать печатать человек
    // будет отсюда, а не с того места, где поле его бросит.
    requestAnimationFrame(() => {
      box.current?.focus()
      box.current?.setSelectionRange?.(next.caret, next.caret)
      setCaret(next.caret)
    })
  }

  const send = (): void => {
    const text = draft.trim()
    if (text === '' || ask.isPending) return
    setEvents([])
    setDraft('')
    // Файлы уходят вместе с вопросом и здесь же снимаются: к следующему вопросу
    // они не прицепятся — их главный процесс уже отдал.
    setFiles([])
    ask.mutate(text)
  }

  // Лента прижата к низу, но перехваченную человеком прокрутку не отбирает:
  // прокрутка вверх — это чтение, и дёргать её обратно значит мешать читать.
  useEffect(() => {
    // `?.` на самом методе, а не только на узле: прокрутка есть не в каждой
    // среде, где этот экран поднимают, и падать из-за неё разговору незачем.
    bottom.current?.scrollIntoView?.({ block: 'end' })
  }, [turns])

  return (
    <div className="flex h-full flex-col gap-1">
      <div className="flex items-center gap-1">
        <Button onClick={onBack} size="sm" variant="text">
          <Codicon name="arrow-left" />
        </Button>
        {/* Переименование НЕ трогает сессии участников: имя — подпись, а не
            адрес, и менять из-за него разговор было бы подменой. */}
        <input
          aria-label={t('rooms.rename')}
          className="flex-1 truncate bg-transparent text-xs text-(--ui-text-primary) outline-none"
          defaultValue={room.title}
          key={room.id}
          onBlur={(event) => {
            const title = event.target.value.trim()
            if (title !== '' && title !== room.title) rename.mutate(title)
          }}
        />
        <Button onClick={onDisband} size="sm" variant="text" title={t('rooms.disband')}>
          <Codicon name="trash" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto text-xs">
        {(turns ?? []).map((turn, index) => (
          <div className="mb-1" key={index}>
            <span className="text-[10px] text-(--ui-text-secondary)">
              {turn.from === '' ? t('rooms.you') : shownName(roster, turn.from)}
            </span>
            <div className="whitespace-pre-wrap">{turn.text}</div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {events.length > 0 && (
        <div className="rounded-[4px] bg-(--ui-bg-tertiary) p-1">
          <button
            className="w-full text-left text-[11px] text-(--ui-text-secondary)"
            onClick={() => setShowEvents((on) => !on)}
            type="button"
          >
            {showEvents ? '▾ ' : '▸ '}
            {t('rooms.feed')}
          </button>
          {showEvents &&
            events.map((event, index) => (
              <div className="text-[10px] text-(--ui-text-secondary)" key={index}>
                {event.member === '' ? '' : `${shownName(roster, event.member)}: `}
                {t(`rooms.event.${event.kind}`)}
              </div>
            ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-(--ui-text-secondary)">
          <Codicon name="paperclip" />
          <span className="flex-1 truncate">{files.join(', ')}</span>
          <Button onClick={() => dropFiles.mutate()} size="sm" variant="text">
            {t('rooms.dropFiles')}
          </Button>
        </div>
      )}

      {hints.length > 0 && (
        <ul className="max-h-24 overflow-auto rounded-[4px] bg-(--ui-bg-tertiary) text-xs">
          {hints.map((hint, index) => (
            <li key={hint}>
              <button
                className={`w-full px-2 py-0.5 text-left ${
                  index === hintAt ? 'bg-(--ui-bg-secondary)' : ''
                }`}
                onClick={() => insertHint(hint)}
                type="button"
              >
                @{hint}
              </button>
            </li>
          ))}
        </ul>
      )}

      <textarea
        aria-label={t('rooms.say')}
        className="rounded-[4px] bg-(--ui-bg-tertiary) px-2 py-1 text-xs text-(--ui-text-primary)"
        onChange={(event) => {
          setDraft(event.target.value)
          setCaret(event.target.selectionStart)
          setHintAt(0)
        }}
        onKeyDown={(event) => {
          // Пока открыта подсказка, Enter выбирает имя, а не отправляет: иначе
          // человек, набравший `@см`, отправлял бы вопрос вместо выбора.
          if (hints.length > 0) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setHintAt(
                (at) => (at + (event.key === 'ArrowDown' ? 1 : hints.length - 1)) % hints.length
              )
              return
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault()
              insertHint(hints[hintAt])
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setCaret(-1)
              return
            }
          }

          // Enter отправляет, Shift+Enter переносит — как везде в приложении.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            send()
          }
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        ref={box}
        rows={2}
        value={draft}
      />

      <div className="flex items-center justify-between text-[10px] text-(--ui-text-secondary)">
        <span>
          {ask.isPending
            ? t('rooms.asking')
            : t('rooms.willAnswer', String(willAnswer.length), String(room.members.length))}
        </span>
        <span className="flex items-center gap-1">
          <Button
            aria-label={t('rooms.attach')}
            disabled={ask.isPending}
            onClick={() => pickFiles.mutate()}
            size="sm"
            title={t('rooms.attach')}
            variant="text"
          >
            <Codicon name="paperclip" />
          </Button>
          <Button disabled={draft.trim() === '' || ask.isPending} onClick={send} size="sm">
            {t('rooms.send')}
          </Button>
        </span>
      </div>

      {ask.data?.ok === false && (
        <div className="text-[11px] text-(--ui-error-foreground)">{ask.data.error}</div>
      )}
    </div>
  )
}
