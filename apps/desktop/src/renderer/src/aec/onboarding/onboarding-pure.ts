// Первый запуск: шесть шагов от пустой установки до первого ответа (task 3.20).
//
// Two of the six are NOT ours to build: «ключ провайдера» и «модель» — это
// вендоренный оверлей донора (`donor/components/onboarding`), который сам
// поднимается, когда ядру нечем отвечать, и уже пишет ключ в наш safeStorage
// (EDIT [1] в `donor/store/onboarding.ts`, правило R2). Переписывать его значило
// бы завести второй экран для того же дела. Поэтому мастер — не мастер в смысле
// «шесть своих экранов», а СПИСОК: он показывает, где человек сейчас, и на
// каждом шаге даёт ровно одно действие, отправляя на чужой шаг чужой экран.
//
// Состояние шага выводится из фактов, а не хранится: подключён источник — шаг
// сделан, независимо от того, сделали это здесь или в панели «Источники».
// Хранится только то, у чего наблюдаемого следа нет: «пропустил», «спросил»,
// «закрыл» (см. `readGuideMemory`).

export const GUIDE_STEPS = ['project', 'key', 'model', 'sources', 'index', 'ask'] as const

export type GuideStepId = (typeof GUIDE_STEPS)[number]

/** Шаги, которые владелец разрешил отложить (решение по задаче 3.20:
 * «последние два пользователь может пропустить и добавить позже»). Остальные
 * пропустить нельзя — без ключа, модели и заданного вопроса первого ответа не
 * бывает, а это и есть критерий приёмки. */
export const OPTIONAL_STEPS: readonly GuideStepId[] = ['sources', 'index']

export interface GuideFacts {
  hasProject: boolean
  /** `setup.runtime_check` — «дошёл бы сейчас запрос до модели». Именно этот
   * вопрос и задаёт шаг «ключ»: наличие строки в хранилище ещё не значит, что
   * ключ рабочий. */
  runtimeOk: boolean
  model: null | string
  sourceCount: number
  filesIndexed: number
  asked: boolean
  skipped: readonly GuideStepId[]
}

export type GuideStepState = 'current' | 'done' | 'skipped' | 'waiting'

export interface GuideStep {
  id: GuideStepId
  optional: boolean
  state: GuideStepState
}

function isDone(id: GuideStepId, facts: GuideFacts): boolean {
  switch (id) {
    case 'project':
      return facts.hasProject
    case 'key':
      return facts.runtimeOk
    case 'model':
      return (facts.model ?? '').trim() !== ''
    case 'sources':
      return facts.sourceCount > 0
    case 'index':
      return facts.filesIndexed > 0
    case 'ask':
      return facts.asked
  }
}

/** Шесть шагов в фиксированном порядке, каждый со своим состоянием.
 *
 * «Текущий» — первый несделанный и непропущенный; всё после него ждёт. Порядок
 * не подстраивается под факты: человек, которому этот экран нужен, читает
 * сверху вниз. */
export function guideSteps(facts: GuideFacts): GuideStep[] {
  // Пропуск «подключите папку» уносит с собой и индексацию: индексировать
  // нечего, и оставить её висеть текущим шагом значило бы упереть человека в
  // кнопку, которая ничего не сделает.
  const skipped = new Set<GuideStepId>(facts.skipped)
  if (skipped.has('sources')) skipped.add('index')

  let currentTaken = false

  return GUIDE_STEPS.map((id) => {
    const optional = OPTIONAL_STEPS.includes(id)
    if (isDone(id, facts)) return { id, optional, state: 'done' as const }
    if (skipped.has(id)) return { id, optional, state: 'skipped' as const }
    if (!currentTaken) {
      currentTaken = true
      return { id, optional, state: 'current' as const }
    }
    return { id, optional, state: 'waiting' as const }
  })
}

export function currentStep(steps: readonly GuideStep[]): GuideStep | undefined {
  return steps.find((step) => step.state === 'current')
}

/** Ни одного текущего шага — значит идти больше некуда, и список пора убрать. */
export function isGuideComplete(steps: readonly GuideStep[]): boolean {
  return currentStep(steps) === undefined
}

/** Вопрос, который подставляется в поле ввода на последнем шаге.
 *
 * Возвращается КЛЮЧ строки, а не текст: сам текст живёт в каталоге переводов,
 * как и всё остальное в наших экранах. Вопрос разный, потому что без
 * подключённых документов «перечисли документы» — это обещание, которого агент
 * не выполнит, и первый же ответ окажется пустым. */
export function suggestedQuestionKey(sourceCount: number): string {
  return sourceCount > 0 ? 'onboarding.askWithSources' : 'onboarding.askWithoutSources'
}

// --- Что помним между запусками -------------------------------------------

export const GUIDE_STORAGE_KEY = 'aec.first-run-guide.v1'

export interface GuideMemory {
  asked: boolean
  closed: boolean
  skipped: GuideStepId[]
}

const EMPTY_MEMORY: GuideMemory = { asked: false, closed: false, skipped: [] }

function isStepId(value: unknown): value is GuideStepId {
  return typeof value === 'string' && (GUIDE_STEPS as readonly string[]).includes(value)
}

function parseAll(raw: null | string): Record<string, GuideMemory> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const result: Record<string, GuideMemory> = {}
    for (const [vaultPath, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue
      const entry = value as Record<string, unknown>
      result[vaultPath] = {
        asked: entry.asked === true,
        closed: entry.closed === true,
        skipped: Array.isArray(entry.skipped) ? entry.skipped.filter(isStepId) : []
      }
    }
    return result
  } catch {
    // Чужая или испорченная запись — не повод падать на старте: мастер просто
    // считает, что человек здесь впервые.
    return {}
  }
}

/** Память про ОДИН проект. Ключ — путь vault: у нового проекта нет ни
 * источников, ни индекса, и список там снова уместен. */
export function readGuideMemory(raw: null | string, vaultPath: string): GuideMemory {
  return parseAll(raw)[vaultPath] ?? EMPTY_MEMORY
}

/** Новое содержимое хранилища с обновлённой записью про этот проект. Остальные
 * проекты переписываются как есть — два окна с разными проектами не должны
 * затирать друг друга. */
export function writeGuideMemory(
  raw: null | string,
  vaultPath: string,
  memory: GuideMemory
): string {
  return JSON.stringify({ ...parseAll(raw), [vaultPath]: memory })
}
