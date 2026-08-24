// Что делать с `session.resume_progress` — событием, которое до нас не
// обрабатывал никто, включая донора (находка D-39).
//
// ЧТО ПРОИСХОДИТ БЕЗ ЭТОГО. При ХОЛОДНОМ возврате к старой сессии ядро не
// отдаёт историю в ответе на `session.resume`, а подгружает её в фоне
// (`_schedule_resume_hydration`, `tui_gateway/server.py`). Пока идёт загрузка,
// окно пустое — и человеку не сказано ничего: ни что идёт работа, ни сколько
// её осталось. Пустое окно и сломанное приложение выглядят одинаково.
//
// ПРОВАЛ при этом виден и без нас: в ветке `failed` ядро следом эмитит `error`,
// который код донора разбирает. Непокрыт ровно случай «идёт загрузка».
//
// ПОЧЕМУ СВОЯ ПОВЕРХНОСТЬ. Дописать индикатор в их ленту нельзя — это пятый вид
// правки файла донора, которого AGENTS §14 не разрешает. Поэтому здесь тот же
// приём, что у `core-notices` (задачи 4D-1/4D-2): подписка живёт у нас, а
// показывает через ИХ хранилище уведомлений, ничего у них не редактируя.
//
// Решение отделено от провода и проверено тестами; провод — в
// `register-resume-progress.ts`.

/** Один и тот же id на сессию: показ идемпотентен, а снятие не требует
 * помнить, что было показано. */
export function resumeNoticeId(sessionId: string): string {
  return `aec-resume-${sessionId}`
}

export type ResumeNoticeAction =
  { kind: 'show'; id: string } | { kind: 'hide'; id: string } | undefined

/** Их конверт события — ровно те поля, которые здесь читаются. */
interface ResumeEvent {
  type?: unknown
  session_id?: unknown
  payload?: unknown
}

/**
 * Показать извещение о загрузке, снять его — или ничего не делать.
 *
 * `complete` и `failed` оба СНИМАЮТ: после первого история уже в окне и
 * объяснять нечего, после второго объяснение даёт их собственный разбор
 * `error`, а два сообщения об одном и том же хуже одного.
 */
export function resumeNoticeAction(event: unknown): ResumeNoticeAction {
  const { type, session_id: sessionId, payload } = (event ?? {}) as ResumeEvent
  if (type !== 'session.resume_progress') return undefined
  if (typeof sessionId !== 'string' || sessionId === '') return undefined

  const { status } = (payload ?? {}) as { status?: unknown }
  const id = resumeNoticeId(sessionId)

  if (status === 'loading') return { kind: 'show', id }
  if (status === 'complete' || status === 'failed') return { kind: 'hide', id }

  // Незнакомое состояние — молчим. Ядро вправе завести новую фазу, и придумать
  // за него текст хуже, чем не сказать ничего.
  return undefined
}
