// Задача 3E.22 (SPEC HX19, замечание D-72): граница голоса проходит по тому,
// КТО РЕШАЕТ — и этот тест держит её с обеих сторон.
//
// ЧТО РЕШИЛ ВЛАДЕЛЕЦ 2026-09-08. Кнопка «прочитать вслух» у отдельного ответа
// остаётся: человек нажимает её сам, на каждый ответ. Автоматическое чтение всех
// ответов и непрерывный разговор с перебиванием снимаются: они говорят без
// такого решения.
//
// ПОЧЕМУ ТЕСТ ЧИТАЕТ ИСХОДНИКИ, А НЕ РИСУЕТ ОКНО. Снятие сделано правкой вида
// [3]: три файла донора (`use-composer-voice.ts`, `use-voice-conversation.ts`,
// `use-auto-speak-replies.ts`) ОСТАЛИСЬ в зоне дословно и просто не
// регистрируются. Значит проверять надо именно регистрацию: файл на диске есть,
// вызывающего у него нет. Отсутствие кнопки окно показать не может: кнопку можно
// убрать, оставив поверхность достижимой горячей клавишей, конфигом или
// словом-активатором, а таких входов было СЕМЬ.
//
// ОБЕ СТОРОНЫ ОБЯЗАТЕЛЬНЫ. Тест, который проверяет только отсутствие, проходит и
// в том случае, когда голос вырезан целиком — включая диктовку и кнопку у
// ответа, которые HX19 оставляет взятыми. Поэтому ниже они проверяются тоже.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const RENDERER = join(__dirname, '..')

function read(relative: string): string {
  return readFileSync(join(RENDERER, relative), 'utf8')
}

/** Комментарии выбрасываются перед поиском (то же правило, что в `no-pet.test.ts`):
 * снятие объяснено словами прямо в месте снятия, и без очистки тест ловил бы
 * объяснение как вызов. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ')
}

function sourcesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)

    if (statSync(path).isDirectory()) {
      sourcesUnder(path, out)
      continue
    }

    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path)
  }

  return out
}

const SOURCES = sourcesUnder(RENDERER)

/** Файлы, где имя встречается в КОДЕ. Путь от корня рендерера, чтобы ожидание
 * читалось. */
function callers(needle: string): string[] {
  return SOURCES.filter((file) => code(readFileSync(file, 'utf8')).includes(needle))
    .map((file) => file.slice(RENDERER.length + 1).replace(/\\/g, '/'))
    .sort()
}

describe('снятые поверхности лежат в зоне, но не зарегистрированы', () => {
  const AGGREGATOR = 'donor/app/chat/composer/hooks/use-composer-voice.ts'

  it.each([
    // Две снятые поверхности вызываются только из их же сводного хока — а он
    // сам не вызывается никем (проверка следующая). То есть мёртв весь путь, а
    // не одна его дверь.
    [
      'donor/app/chat/composer/hooks/use-auto-speak-replies.ts',
      'useAutoSpeakReplies',
      [AGGREGATOR]
    ],
    [
      'donor/app/chat/composer/hooks/use-voice-conversation.ts',
      'useVoiceConversation',
      [AGGREGATOR]
    ],
    // Вершина цепочки: у неё вызывающего нет вовсе.
    [AGGREGATOR, 'useComposerVoice', []],
    // Их «живой голосовой разговор» 0.21.3 (OpenAI Realtime) — та же
    // поверхность, то же решение (HX19 подтверждён 2026-09-15). Пять файлов
    // лежат дословно; входы сняты из `controls.tsx`, `voice-menu.tsx`,
    // `use-hermes-config.ts` правкой [3]. Зовёт их только мёртвый сводный хук
    // и они друг друга.
    [
      'donor/app/chat/composer/hooks/use-voice-live-conversation.ts',
      'useVoiceLiveConversation',
      [AGGREGATOR]
    ],
    ['donor/app/chat/composer/start-voice-button.tsx', 'StartVoiceButton', []],
    [
      'donor/app/chat/composer/voice-engine-rows.tsx',
      'VoiceEngineRows',
      ['donor/app/chat/composer/start-voice-button.tsx']
    ],
    [
      'donor/store/voice-live.ts',
      'setVoiceChatMode',
      ['donor/app/chat/composer/voice-engine-rows.tsx']
    ]
  ])('%s перенесён дословно и без вызывающего', (relative, exported, alsoMentionedIn) => {
    // Файл на месте: при следующем переносе донора его перекопируют по
    // `DONOR_SHA`, а не будут восстанавливать по памяти.
    const source = read(relative)
    expect(
      source.includes(`export function ${exported}(`) ||
        source.includes(`export async function ${exported}(`)
    ).toBe(true)

    expect(callers(exported)).toEqual([relative, ...alsoMentionedIn].sort())
  })

  it.each([
    // Горячая клавиша: снят и обработчик, и строка таблицы действий.
    ['requestVoiceToggle', 'donor/app/chat/composer/focus.ts'],
    // Слово-активатор больше не открывает разговор.
    ['requestVoiceConversationStart', 'donor/store/composer.ts'],
    // `voice.auto_tts` из их конфига включал чтение без единого нажатия в окне.
    ['applyAutoSpeakFromConfig', 'donor/store/voice-prefs.ts']
  ])('%s объявлен, но никем не вызывается', (name, declaredIn) => {
    expect(callers(name)).toEqual([declaredIn])
  })

  it("'composer.voice' снято и из таблицы действий, и из набора «безопасных при наборе»", () => {
    expect(code(read('donor/lib/keybinds/actions.ts'))).not.toContain("id: 'composer.voice'")
    expect(code(read('donor/lib/keybinds/combo.ts'))).not.toContain("'composer.voice'")
  })

  it('маршруты живого голоса не зовутся, поверхность voice-live не отправляется', () => {
    // `lib/voice-live.ts` — единственный, кто знает адрес; его самого никто
    // не импортирует, кроме мёртвых файлов этой же поверхности.
    expect(callers('/api/audio/voice-live')).toEqual(['donor/lib/voice-live.ts'])
    expect(callers("surface: 'voice-live'")).toEqual([AGGREGATOR])
  })

  it('табличка слова-активатора не поднимается тем, кто не умеет её опустить', () => {
    // Опускал её ТОЛЬКО непрерывный разговор (`syncWakeIndicatorWithVoice`).
    // Оставленный вызов означал бы табличку об открытом микрофоне, висящую
    // вечно — при закрытом микрофоне.
    expect(callers('activateWakeIndicator')).toEqual(['donor/lib/wake-indicator.ts'])
  })
})

describe('оставленное взятым работает', () => {
  it('кнопка «прочитать вслух» у ответа на месте', () => {
    const message = read('donor/components/assistant-ui/thread/assistant-message.tsx')

    expect(message).toContain('copy.readAloud')
    expect(message).toContain('stopVoicePlayback()')
  })

  it('диктовка зарегистрирована композером напрямую', () => {
    const composer = code(read('donor/app/chat/composer/index.tsx'))

    expect(composer).toContain('useVoiceRecorder({')
    expect(composer).not.toContain('useComposerVoice(')
  })

  it('слово-активатор остаётся: профиль, свежая сессия и звук подтверждения', () => {
    const wiring = code(read('donor/app/contrib/wiring.tsx'))

    expect(wiring).toContain("event.type === 'wake.detected'")
    expect(wiring).toContain('playWakeSound()')
  })
})
