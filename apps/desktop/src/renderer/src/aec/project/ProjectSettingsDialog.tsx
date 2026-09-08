// «Настройки проекта» — задача 5.14 (языки) и находка D-57 (всё остальное).
//
// Про D-57. До 31.08.2026 у настроек проекта не было экрана ВООБЩЕ: интервал
// сканирования и модель эмбеддингов правились только руками в `project.json`.
// IPC для них существовал с фазы 1.6, а экраны были наши и исчезли вместе со
// старым рендерером (1.8.9). Решение владельца 31.08.2026 — одно окно на все
// четыре поля, а не два похожих: настройка, которую человек ищет и не находит,
// читается как отсутствующая.
//
// Про языки — задача 5.14, SPEC G7.
//
// G7 считает три уровня языка, и они принадлежат РАЗНЫМ владельцам. Два живут в
// проекте: язык вики и язык имён в графе. Третий — язык, на котором агент
// разговаривает, — принадлежит ПОЛЬЗОВАТЕЛЮ, а не проекту. Четвёртый, язык
// интерфейса, тоже пользовательский и стоит в их настройках оформления.
//
// ТРЕТИЙ УРОВЕНЬ ПЕРЕЕХАЛ СЮДА 2026-09-08 (решение владельца, задача 5.14). До
// этого он жил строкой, которую НАШ диалог создания специалиста подставлял в
// видимое поле; диалог заместил их плагин, и уровень открылся заново. Теперь это
// отдельная настройка: она хранится у нас (`main/agent-language.ts`, файл в
// userData — с человеком, а не с проектом), а строка попадает в SOUL нового
// специалиста из неё. Поле стоит ВЫШЕ проектных и подписано «ваш, а не проекта»,
// чтобы соседство не прочиталось как «настройка этого проекта».
//
// Поэтому окно правит три поля и НАЗЫВАЕТ четвёртое вместе с местом, где оно
// лежит: настройка, которую человек ищет и не находит, читается как
// отсутствующая, и следующим шагом её заводят второй раз (ровно так появилась
// находка D-38).
//
// Про подтверждение смены языка графа. `check_compatible` в `aec_rag.rag_index`
// откажется открыть граф, построенный на другом языке, — и это защита, а не
// ошибка: иначе одна сущность получит два имени. Значит цена смены — полная
// переиндексация, и сказать о ней надо ДО записи (D-38). Отсюда второй шаг:
// первое нажатие показывает последствие, второе соглашается с ним.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'

const SETTINGS_KEY = ['aec', 'project-settings'] as const
const AGENT_LANGUAGE_KEY = ['aec', 'agent-language'] as const

/** Язык вики — КОД (`auto` | `ru` | `en`): им помечают текст страницы. Ключ
 * подписи хранится рядом со значением, а не собирается из него: собранный ключ
 * не находится поиском по строке и переживает удаление перевода молча. */
const WIKI_LANGS = [
  { value: 'auto', label: 'project.langWikiAuto' },
  { value: 'ru', label: 'project.langWikiRu' },
  { value: 'en', label: 'project.langWikiEn' }
] as const

/** Язык графа — СЛОВО, которое LightRAG кладёт в промпт (`addon_params.language`),
 * а не код. Пустая строка — «не выбран», и тогда язык берёт себе
 * `aec_rag.rag_index.EXTRACTION_LANGUAGE`. Список закрытый: продукт живёт на
 * двух языках (SPEC C7), а свободное поле здесь означало бы опечатку, которую
 * никто не заметит до следующей переиндексации. */
const GRAPH_LANGS = [
  { value: '', label: 'project.langGraphDefault' },
  { value: 'Russian', label: 'project.langGraphRussian' },
  { value: 'English', label: 'project.langGraphEnglish' }
] as const

/** Язык ответов агента — закрытый список языков продукта (SPEC C7) плюс «не
 * задан». Пустое значение законно и означает «ничего в SOUL не дописывать». */
const AGENT_LANGS = [
  { value: '', label: 'project.langAgentUnset' },
  { value: 'ru', label: 'project.langAgentRu' },
  { value: 'en', label: 'project.langAgentEn' }
] as const

/** Наименьший осмысленный интервал сканирования. Секунды хранятся в
 * `project.json`, а человеку показываются минуты: обход папок источника — не та
 * работа, которую заводят на секунды, и поле в секундах приглашает вписать
 * туда 5. */
const MIN_SCAN_MINUTES = 1

export default function ProjectSettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useAecT()
  const queryClient = useQueryClient()
  const [wikiLang, setWikiLang] = useState<string | undefined>(undefined)
  const [graphLang, setGraphLang] = useState<string | undefined>(undefined)
  const [scanMinutes, setScanMinutes] = useState<string | undefined>(undefined)
  const [embedding, setEmbedding] = useState<string | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const [agentLang, setAgentLang] = useState<string | undefined>(undefined)

  const { data: settings, isPending } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => window.aecpilot.getProjectSettings()
  })

  // Своим запросом, а не вместе с проектными: настройка пользовательская и
  // читается, даже когда проект не открыт.
  const { data: agentLanguage } = useQuery({
    queryKey: AGENT_LANGUAGE_KEY,
    queryFn: () => window.aecpilot.getAgentLanguage()
  })

  // `undefined` — «человек этого поля не трогал», и значение показывается прямо
  // из загруженных настроек. Копировать их в состояние через эффект было бы и
  // лишним, и хуже: копия живёт своей жизнью, а перерисовка после ответа
  // запроса затирала бы уже начатую правку.
  const graphChanged =
    Boolean(settings) && graphLang !== undefined && graphLang !== settings?.extraction_language
  const wikiChanged =
    Boolean(settings) && wikiLang !== undefined && wikiLang !== settings?.wiki_lang

  const storedMinutes = settings ? String(Math.round(settings.scan_interval_s / 60)) : ''
  const scanChanged =
    Boolean(settings) && scanMinutes !== undefined && scanMinutes !== storedMinutes
  const scanMinutesValue = Number(scanMinutes)
  const scanInvalid =
    scanChanged && (!Number.isFinite(scanMinutesValue) || scanMinutesValue < MIN_SCAN_MINUTES)

  const embeddingChanged =
    Boolean(settings) && embedding !== undefined && embedding !== settings?.embedding_model

  const storedAgentLang = agentLanguage?.language ?? ''
  const agentLangChanged = agentLang !== undefined && agentLang !== storedAgentLang

  const dirty = graphChanged || wikiChanged || scanChanged || embeddingChanged || agentLangChanged
  // Второй шаг нужен обоим полям, которые обесценивают уже построенный индекс:
  // язык графа и модель эмбеддингов. `check_compatible` откажется открыть и то,
  // и другое, и в обоих случаях это защита, а не ошибка.
  const needsConfirm = graphChanged || embeddingChanged

  async function save(): Promise<void> {
    // Второй шаг — только для полей с ценой. У языка вики её нет (следующая
    // сборка просто пишет страницы иначе), у интервала тоже.
    if (scanInvalid) {
      setError(t('project.scanTooSmall'))
      return
    }
    if (needsConfirm && !confirming) {
      setConfirming(true)
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      // Сначала пользовательская настройка: она не зависит от открытого проекта,
      // и отказ проектной записи не должен её терять.
      if (agentLangChanged) {
        await window.aecpilot.setAgentLanguage(agentLang ?? '')
        await queryClient.invalidateQueries({ queryKey: AGENT_LANGUAGE_KEY })
      }

      // Проектных правок может не быть вовсе — тогда и писать нечего.
      if (!graphChanged && !wikiChanged && !scanChanged && !embeddingChanged) {
        onClose()
        return
      }

      const result = await window.aecpilot.updateProjectSettings({
        ...(wikiChanged ? { wikiLang } : {}),
        ...(graphChanged ? { extractionLanguage: graphLang } : {}),
        // Минуты человеку, секунды на диск — единица хранения не меняется.
        ...(scanChanged ? { scanIntervalS: Math.round(scanMinutesValue * 60) } : {}),
        ...(embeddingChanged ? { embeddingModel: embedding } : {})
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      await queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
      setConfirming(false)
    }
  }

  const title = t('project.settingsTitle')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        aria-label={title}
        aria-modal="true"
        className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-(--ui-bg-secondary) p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-(--ui-text-primary)">{title}</h2>
          <Button disabled={saving} onClick={onClose} size="icon-xs" variant="ghost">
            <span aria-hidden="true">✕</span>
            <span className="sr-only">{t('common.close')}</span>
          </Button>
        </div>

        {/* Пользовательская настройка стоит ВНЕ блока проекта: она правится и
            тогда, когда проект не открыт, — иначе язык ответов агента зависел бы
            от того, открыта ли папка. */}
        <div className="flex flex-col gap-1.5 text-xs text-(--ui-text-secondary)">
          <label htmlFor="aec-agent-lang">{t('project.langAgentLabel')}</label>
          <select
            className="rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1.5 text-sm text-(--ui-text-primary) outline-none focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50"
            disabled={saving}
            id="aec-agent-lang"
            onChange={(event) => setAgentLang(event.target.value)}
            value={agentLang ?? storedAgentLang}
          >
            {AGENT_LANGS.map((option) => (
              <option key={option.value || 'unset'} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <span className="text-(--ui-text-tertiary)">{t('project.langAgentHint')}</span>
        </div>

        {isPending && (
          <div className="text-xs text-(--ui-text-secondary)">{t('common.loading')}</div>
        )}

        {!isPending && !settings && (
          <div className="text-xs text-(--ui-text-secondary)">{t('project.langNoProject')}</div>
        )}

        {settings && (
          <>
            {/* Подпись и подсказка — разные узлы: внутри одного `label` они
                склеились бы в одно имя поля, и «Язык вики» перестал бы им
                называться ни для читалки, ни для теста. */}
            <div className="flex flex-col gap-1.5 text-xs text-(--ui-text-secondary)">
              <label htmlFor="aec-wiki-lang">{t('project.langWikiLabel')}</label>
              <select
                className="rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1.5 text-sm text-(--ui-text-primary) outline-none focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50"
                disabled={saving}
                id="aec-wiki-lang"
                onChange={(event) => setWikiLang(event.target.value)}
                value={wikiLang ?? settings.wiki_lang}
              >
                {WIKI_LANGS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
              <span className="text-(--ui-text-tertiary)">{t('project.langWikiHint')}</span>
            </div>

            <div className="flex flex-col gap-1.5 text-xs text-(--ui-text-secondary)">
              <label htmlFor="aec-graph-lang">{t('project.langGraphLabel')}</label>
              <select
                className="rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1.5 text-sm text-(--ui-text-primary) outline-none focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50"
                disabled={saving}
                id="aec-graph-lang"
                onChange={(event) => setGraphLang(event.target.value)}
                value={graphLang ?? settings.extraction_language}
              >
                {GRAPH_LANGS.map((option) => (
                  <option key={option.value || 'default'} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
              <span className="text-(--ui-text-tertiary)">{t('project.langGraphHint')}</span>
            </div>

            {graphChanged && (
              <div
                className="rounded-[4px] bg-(--ui-bg-quaternary) p-3 text-xs text-(--ui-text-primary)"
                role="alert"
              >
                {t('project.langGraphWarning')}
              </div>
            )}

            {/* Находка D-57. Интервал показывается в МИНУТАХ, а хранится в
                секундах: обход папок источника — не та работа, которую заводят
                на секунды, и поле в секундах приглашает вписать туда 5. */}
            <div className="flex flex-col gap-1.5 text-xs text-(--ui-text-secondary)">
              <label htmlFor="aec-scan-interval">{t('project.scanLabel')}</label>
              <div className="flex items-center gap-2">
                <input
                  className="w-24 rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1.5 text-sm text-(--ui-text-primary) outline-none focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50"
                  disabled={saving}
                  id="aec-scan-interval"
                  min={MIN_SCAN_MINUTES}
                  onChange={(event) => setScanMinutes(event.target.value)}
                  type="number"
                  value={scanMinutes ?? storedMinutes}
                />
                <span className="text-(--ui-text-tertiary)">{t('project.scanUnit')}</span>
              </div>
              <span className="text-(--ui-text-tertiary)">{t('project.scanHint')}</span>
            </div>

            {/* Свободное поле, а не список: имя модели задаёт ядро, и закрытый
                список здесь устарел бы на следующем их релизе. Пустое значение
                законно — оно и означает «как в ядре». */}
            <div className="flex flex-col gap-1.5 text-xs text-(--ui-text-secondary)">
              <label htmlFor="aec-embedding-model">{t('project.embeddingLabel')}</label>
              <input
                className="rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1.5 text-sm text-(--ui-text-primary) outline-none focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50"
                disabled={saving}
                id="aec-embedding-model"
                onChange={(event) => setEmbedding(event.target.value)}
                placeholder={t('project.embeddingPlaceholder')}
                type="text"
                value={embedding ?? settings.embedding_model}
              />
              <span className="text-(--ui-text-tertiary)">{t('project.embeddingHint')}</span>
            </div>

            {embeddingChanged && (
              <div
                className="rounded-[4px] bg-(--ui-bg-quaternary) p-3 text-xs text-(--ui-text-primary)"
                role="alert"
              >
                {t('project.embeddingWarning')}
              </div>
            )}

            {/* Четвёртый уровень G7 — не наше поле, но человек ищет его здесь. */}
            <div className="flex flex-col gap-1 border-t border-(--ui-border-primary) pt-3 text-xs text-(--ui-text-tertiary)">
              <span>{t('project.langUiWhere')}</span>
            </div>
          </>
        )}

        {error && <div className="text-xs text-destructive">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button
            disabled={saving}
            onClick={confirming ? () => setConfirming(false) : onClose}
            variant="text"
          >
            {t('common.cancel')}
          </Button>
          <Button disabled={!dirty || saving} onClick={() => void save()}>
            {saving
              ? t('project.langSaving')
              : confirming
                ? t('project.langConfirmReindex')
                : t('project.langSave')}
          </Button>
        </div>
      </div>
    </div>
  )
}
