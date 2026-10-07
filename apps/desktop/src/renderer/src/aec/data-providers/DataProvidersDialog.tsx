// Окно «Индекс и память»: чьим ключом работают поиск по документам и память
// (задачи 3G.46–3G.47, D-172, SPEC C5).
//
// ПОЧЕМУ ОКНО, А НЕ РАЗДЕЛ ИХ НАСТРОЕК. Их разделы описываются списком ключей
// конфига ядра и рисуются одним общим компонентом; точки расширения для своего
// раздела у их экрана нет (свои вставки принимает только «Внешний вид»). Встроить
// сюда — значит переписать их файл сверх пяти разрешённых правок. Поэтому — как у
// доступов Microsoft Graph (3E.9а): команда палитры и окно, плюс входы оттуда, где
// человек упирается в отказ (индикатор индекса, уведомление памяти, мастер).
//
// ПО УМОЛЧАНИЮ ОДНА СТРОКА. Память идёт за RAG, RAG — за агентом (решение
// владельца 2026-10-02: «по умолчанию один, но развести, если надо»).
//
// МОДЕЛИ (3G.52) — поле плюс выбор из списка провайдера: список читается по
// кнопке, не на каждый выбор, потому что это вызов чужого адреса чужим ключом.
// Пустое поле — модель пресета (она же подсказка в поле); провайдер списка не
// дал — модель вписывается руками в то же поле. Выбор — их `Select`, а не
// `<datalist>` (D-187, задача 3H.25): подсказки `datalist` рисует Chromium, и
// длинный список в них не прокручивался — до нижних моделей было не добраться.

import { useStore } from '@nanostores/react'
import { useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../donor/components/ui/select'
import { useAecT } from '../../shared/i18n'
import { CloseOnEscape } from '../CloseOnEscape'
import type { DataProvidersFile, DataProvidersState } from '../../../../shared/ipc'

import {
  $dataProviders,
  $dataProvidersOpen,
  isSubscriptionProvider,
  listModels,
  saveDataChoice,
  saveDataKey
} from './store'

type RagChoice = DataProvidersFile['rag']
type MemoryChoice = DataProvidersFile['memory']
type Preset = DataProvidersState['presets'][number]
type Section = 'rag' | 'memory'

const inputClass =
  'min-w-0 flex-1 rounded border border-(--ui-border) bg-(--ui-bg-primary) p-1.5 text-xs text-(--ui-text-primary)'

// Раскрытый список `<select>` рисует Chromium, а не наша тема (D-186, задача
// 3H.24): фон поля полупрозрачный (`--ui-bg-primary` смешан с `transparent`), и
// под ним список ложится на белое, а текст в тёмной теме светлый — читать нечего.
// Строкам списка — непрозрачный фон и цвет их всплывающих меню; схема — по классу
// `.dark`, которым донор включает тёмную тему.
const selectClass = `${inputClass} [.dark_&]:[color-scheme:dark] [&_option]:bg-popover [&_option]:text-popover-foreground`

/** Пустые поля не едут в файл: «не задано» и «пустая строка» — одно и то же. */
function clean<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => !(typeof v === 'string' && v.trim() === ''))
  ) as T
}

function presetOf(state: DataProvidersState, id: string): Preset | undefined {
  return state.presets.find((preset) => preset.id === id)
}

function Field({
  id,
  label,
  models,
  onChange,
  placeholder,
  value
}: {
  id: string
  label: string
  /** Список провайдера, если его загрузили, — выбор под полем. */
  models?: string[]
  onChange: (value: string) => void
  placeholder?: string
  value: string
}): React.JSX.Element {
  const t = useAecT()

  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-(--ui-text-secondary)" htmlFor={id}>
        {label}
      </label>
      <input
        className={inputClass}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      {models && models.length > 0 && (
        // Значение пустое нарочно: выбор кладёт модель в поле и снова зовёт
        // «выбрать» — поле, а не список, остаётся тем, что сохраняется.
        <Select onValueChange={onChange} value="">
          <SelectTrigger aria-label={t('dataProviders.modelsPick', label)} size="sm">
            <SelectValue placeholder={t('dataProviders.modelsPickShort')} />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

function KeyRow({
  canEncrypt,
  envOverrides,
  envVar,
  hasKey
}: {
  canEncrypt: boolean
  envOverrides: boolean
  envVar: string
  hasKey: boolean
}): React.JSX.Element {
  const t = useAecT()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (): Promise<void> => {
    setBusy(true)
    setError(await saveDataKey(envVar, draft.trim()))
    setBusy(false)
    setDraft('')
  }

  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <code className="text-xs text-(--ui-text-primary)">{envVar}</code>
        <span className="text-xs text-(--ui-text-secondary)">
          {t(hasKey ? 'dataProviders.keySet' : 'dataProviders.keyMissing')}
        </span>
      </div>
      {envOverrides && (
        <p className="text-xs text-(--ui-text-danger)">{t('dataProviders.envOverride')}</p>
      )}
      <div className="flex items-center gap-2">
        <input
          aria-label={envVar}
          className={`${inputClass} font-mono`}
          disabled={busy || !canEncrypt}
          onChange={(event) => {
            setDraft(event.target.value)
            setError('')
          }}
          type="password"
          value={draft}
        />
        <Button
          disabled={busy || !canEncrypt || draft.trim() === ''}
          onClick={() => void run()}
          size="sm"
          variant="secondary"
        >
          {t('dataProviders.keySave')}
        </Button>
      </div>
      {error && <p className="text-xs text-(--ui-text-danger)">{error}</p>}
    </section>
  )
}

export default function DataProvidersDialog(): React.JSX.Element | null {
  const open = useStore($dataProvidersOpen)
  const state = useStore($dataProviders)
  const t = useAecT()
  const [draft, setDraft] = useState<DataProvidersFile>(state.choice)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [models, setModels] = useState<Partial<Record<Section, string[]>>>({})
  const [modelsError, setModelsError] = useState<Partial<Record<Section, string>>>({})

  // Свежий выбор из профиля — после открытия и после сохранения. Сверка во время
  // отрисовки, а не в эффекте: так черновик не мигает старым выбором лишний кадр.
  const [seen, setSeen] = useState(state.choice)
  if (seen !== state.choice) {
    setSeen(state.choice)
    setDraft(state.choice)
  }

  if (!open) return null

  const separate = draft.memory.provider !== 'rag'
  const touched = (): void => {
    setMessage('')
    setWarnings([])
  }
  const setRag = (rag: RagChoice): void => {
    setDraft((current) => ({ ...current, rag }))
    touched()
  }
  const setMemory = (memory: MemoryChoice): void => {
    setDraft((current) => ({ ...current, memory }))
    touched()
  }
  // Другой провайдер — другой список: прежний не подсказывает чужих моделей.
  const forget = (section: Section): void => {
    setModels((current) => ({ ...current, [section]: undefined }))
    setModelsError((current) => ({ ...current, [section]: undefined }))
  }
  const cleaned = (): DataProvidersFile => ({ rag: clean(draft.rag), memory: clean(draft.memory) })

  const ragPreset = presetOf(
    state,
    draft.rag.provider === 'agent' ? (state.agentProvider ?? '') : draft.rag.provider
  )
  const memoryPresetId =
    draft.memory.provider === 'rag'
      ? draft.rag.provider
      : draft.memory.provider === 'agent'
        ? (state.agentProvider ?? '')
        : draft.memory.provider
  const memoryPreset = presetOf(
    state,
    memoryPresetId === 'agent' ? (state.agentProvider ?? '') : memoryPresetId
  )

  // У «как у агента» при агенте по подписке провайдера нет — и моделей тоже.
  const agentUsable = !!state.agentProvider && !isSubscriptionProvider(state.agentProvider)
  const ragHasProvider = draft.rag.provider !== 'agent' || agentUsable
  const memoryHasProvider =
    draft.memory.provider === 'rag'
      ? ragHasProvider
      : draft.memory.provider !== 'agent' || agentUsable

  // Ключи, которые нужны выбору; «как у агента» своих не добавляет.
  const neededKeys: string[] = []
  for (const choice of [draft.rag, draft.memory]) {
    if (choice.provider === 'agent' || choice.provider === 'rag') continue
    const name =
      choice.provider === 'custom'
        ? (choice.key_env ?? '')
        : (presetOf(state, choice.provider)?.keyEnvVar ?? '')
    if (name && !neededKeys.includes(name)) neededKeys.push(name)
  }

  const save = async (confirmed: boolean): Promise<void> => {
    setBusy(true)
    setError('')
    const answer = await saveDataChoice(cleaned(), confirmed)
    setBusy(false)
    setWarnings(answer.warnings)
    if (answer.error) setError(answer.error)
    else if (answer.warnings.length === 0) setMessage(t('dataProviders.saved'))
  }

  const loadModels = async (section: Section): Promise<void> => {
    forget(section)
    const answer = await listModels(cleaned(), section)
    if (answer.ok) setModels((current) => ({ ...current, [section]: answer.models }))
    else setModelsError((current) => ({ ...current, [section]: answer.error }))
  }

  const modelsRow = (section: Section): React.JSX.Element => (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => void loadModels(section)} size="sm" variant="ghost">
        {t('dataProviders.modelsLoad')}
      </Button>
      {models[section] && (
        <span className="text-xs text-(--ui-text-secondary)">
          {t('dataProviders.modelsCount', models[section].length)}
        </span>
      )}
      {modelsError[section] && (
        <span className="text-xs text-amber-500">
          {t('dataProviders.modelsFailed', modelsError[section])}
        </span>
      )}
    </div>
  )

  const options = (withCustom: boolean): React.JSX.Element[] => [
    <option key="agent" value="agent">
      {t('dataProviders.optAgent')}
    </option>,
    <option key="gemini" value="gemini">
      {t('dataProviders.optGemini')}
    </option>,
    <option key="openai-api" value="openai-api">
      {t('dataProviders.optOpenai')}
    </option>,
    ...(withCustom
      ? [
          <option key="custom" value="custom">
            {t('dataProviders.optCustom')}
          </option>
        ]
      : [])
  ]

  return (
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/40 p-4"
      onClick={() => $dataProvidersOpen.set(false)}
      role="presentation"
    >
      <CloseOnEscape onClose={() => $dataProvidersOpen.set(false)} />
      <div
        aria-label={t('dataProviders.title')}
        aria-modal="true"
        className="flex max-h-[85vh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-lg border border-(--stroke-nous) bg-(--ui-chat-bubble-background) p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-sm font-semibold text-(--ui-text-primary)">
          {t('dataProviders.title')}
        </h2>
        <p className="text-xs text-(--ui-text-secondary)">{t('dataProviders.lead')}</p>

        {!state.profileRead ? (
          <p className="text-xs text-(--ui-text-danger)">{t('dataProviders.profileUnread')}</p>
        ) : (
          <>
            <p className="text-xs text-(--ui-text-primary)">
              {state.agentProvider
                ? t('dataProviders.agent', state.agentProvider)
                : t('dataProviders.agentNone')}
            </p>
            {isSubscriptionProvider(state.agentProvider) && (
              <p className="text-xs text-amber-500">{t('dataProviders.subscription')}</p>
            )}

            <section className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-(--ui-text-primary)" htmlFor="data-rag">
                {t('dataProviders.ragLabel')}
              </label>
              <select
                className={selectClass}
                id="data-rag"
                onChange={(event) => {
                  setRag({ provider: event.target.value as RagChoice['provider'] })
                  forget('rag')
                }}
                value={draft.rag.provider}
              >
                {options(true)}
              </select>
              {draft.rag.provider === 'custom' && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Field
                    id="data-rag-base-url"
                    label={t('dataProviders.baseUrl')}
                    onChange={(value) => setRag({ ...draft.rag, base_url: value })}
                    value={draft.rag.base_url ?? ''}
                  />
                  <Field
                    id="data-rag-key-env"
                    label={t('dataProviders.keyEnv')}
                    onChange={(value) => setRag({ ...draft.rag, key_env: value.toUpperCase() })}
                    value={draft.rag.key_env ?? ''}
                  />
                </div>
              )}
              {ragHasProvider && (
                <>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field
                      id="data-rag-embedding"
                      label={t('dataProviders.embedding')}
                      models={models.rag}
                      onChange={(value) => setRag({ ...draft.rag, embedding: value })}
                      placeholder={ragPreset?.embedding}
                      value={draft.rag.embedding ?? ''}
                    />
                    <Field
                      id="data-rag-extraction"
                      label={t('dataProviders.extraction')}
                      models={models.rag}
                      onChange={(value) => setRag({ ...draft.rag, extraction: value })}
                      placeholder={ragPreset?.extraction}
                      value={draft.rag.extraction ?? ''}
                    />
                  </div>
                  {modelsRow('rag')}
                </>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs text-(--ui-text-primary)">
                <input
                  checked={separate}
                  onChange={(event) =>
                    setMemory({ provider: event.target.checked ? 'agent' : 'rag' })
                  }
                  type="checkbox"
                />
                {t('dataProviders.separate')}
              </label>
              {separate && (
                <>
                  <label
                    className="text-xs font-semibold text-(--ui-text-primary)"
                    htmlFor="data-memory"
                  >
                    {t('dataProviders.memoryLabel')}
                  </label>
                  <select
                    className={selectClass}
                    id="data-memory"
                    onChange={(event) => {
                      setMemory({ provider: event.target.value as MemoryChoice['provider'] })
                      forget('memory')
                    }}
                    value={draft.memory.provider}
                  >
                    {options(true)}
                  </select>
                  {draft.memory.provider === 'custom' && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Field
                        id="data-memory-base-url"
                        label={t('dataProviders.baseUrl')}
                        onChange={(value) => setMemory({ ...draft.memory, base_url: value })}
                        value={draft.memory.base_url ?? ''}
                      />
                      <Field
                        id="data-memory-key-env"
                        label={t('dataProviders.keyEnv')}
                        onChange={(value) =>
                          setMemory({ ...draft.memory, key_env: value.toUpperCase() })
                        }
                        value={draft.memory.key_env ?? ''}
                      />
                    </div>
                  )}
                  {memoryHasProvider && (
                    <>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Field
                          id="data-memory-llm"
                          label={t('dataProviders.memoryLlm')}
                          models={models.memory}
                          onChange={(value) => setMemory({ ...draft.memory, llm: value })}
                          placeholder={memoryPreset?.memoryLlm}
                          value={draft.memory.llm ?? ''}
                        />
                        <Field
                          id="data-memory-embedding"
                          label={t('dataProviders.memoryEmbedding')}
                          models={models.memory}
                          onChange={(value) => setMemory({ ...draft.memory, embedding: value })}
                          placeholder={memoryPreset?.memoryEmbedding}
                          value={draft.memory.embedding ?? ''}
                        />
                      </div>
                      {modelsRow('memory')}
                    </>
                  )}
                </>
              )}
              {!separate && memoryPreset && (
                <p className="text-xs text-(--ui-text-secondary)">
                  {t(
                    'dataProviders.memoryModels',
                    memoryPreset.memoryLlm,
                    memoryPreset.memoryEmbedding
                  )}
                </p>
              )}
            </section>

            {neededKeys.length > 0 && (
              <section className="flex flex-col gap-2 border-t border-(--ui-border) pt-3">
                <h3 className="text-xs font-semibold text-(--ui-text-primary)">
                  {t('dataProviders.keysTitle')}
                </h3>
                {!state.encryptionAvailable && (
                  <p className="text-xs text-(--ui-text-danger)">
                    {t('dataProviders.noEncryption')}
                  </p>
                )}
                {neededKeys.map((envVar) => {
                  const known = state.keys.find((key) => key.envVar === envVar)
                  return (
                    <KeyRow
                      canEncrypt={state.encryptionAvailable}
                      envOverrides={known?.envOverrides ?? false}
                      envVar={envVar}
                      hasKey={known?.hasKey ?? false}
                      key={envVar}
                    />
                  )
                })}
                <p className="text-xs text-(--ui-text-secondary)">{t('dataProviders.keyNote')}</p>
              </section>
            )}

            <section className="flex flex-col gap-1 border-t border-(--ui-border) pt-3">
              <h3 className="text-xs font-semibold text-(--ui-text-primary)">
                {t('dataProviders.statusTitle')}
              </h3>
              {(
                [
                  ['dataProviders.statusRag', state.rag],
                  ['dataProviders.statusMemory', state.memory]
                ] as const
              ).map(([label, status]) => (
                <p className="text-xs text-(--ui-text-secondary)" key={label}>
                  {t(label)}
                  {' — '}
                  <span className={status.ok ? 'text-(--ui-text-primary)' : 'text-amber-500'}>
                    {status.ok ? t('dataProviders.ready') : (status.reason ?? '')}
                  </span>
                </p>
              ))}
            </section>
          </>
        )}

        {warnings.length > 0 && (
          <section className="flex flex-col gap-1 rounded border border-amber-500/50 p-2">
            <h3 className="text-xs font-semibold text-(--ui-text-primary)">
              {t('dataProviders.warningsTitle')}
            </h3>
            {warnings.map((warning) => (
              <p className="text-xs text-(--ui-text-primary)" key={warning}>
                {warning}
              </p>
            ))}
          </section>
        )}
        {error && <p className="text-xs text-(--ui-text-danger)">{error}</p>}
        {message && <p className="text-xs text-(--ui-text-primary)">{message}</p>}

        <div className="flex justify-end gap-2">
          <Button
            disabled={busy || !state.profileRead}
            onClick={() => void save(warnings.length > 0)}
            size="sm"
            variant="secondary"
          >
            {t(warnings.length > 0 ? 'dataProviders.saveAnyway' : 'dataProviders.save')}
          </Button>
          <Button onClick={() => $dataProvidersOpen.set(false)} size="sm" variant="ghost">
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  )
}
