// Страж границы голоса (SPEC HX19, UR49; задача T59, прежде 3E.22/3H.2).
//
// В продукте из голоса есть ОДНО — диктовка: человек нажал микрофон, речь стала текстом
// в поле сообщения. Чтения вслух, голосового разговора и слова-активатора нет. Тест держит
// обе стороны: снятое мертво, а диктовка достижима единственным путём — через нашу
// проверку (`aec/dictation`), без сокета из окна и без облачного распознавания.
//
// ПОЧЕМУ ТЕСТ ЧИТАЕТ ИСХОДНИКИ, А НЕ РИСУЕТ ОКНО. Снятие сделано правкой вида [3]: файлы
// донора (`use-composer-voice.ts`, `use-voice-conversation.ts`, `use-auto-speak-replies.ts`)
// ОСТАЛИСЬ в зоне дословно и просто не регистрируются. Значит проверять надо именно
// регистрацию: файл на диске есть, вызывающего у него нет. Отсутствие кнопки окно показать
// не может: кнопку можно убрать, оставив поверхность достижимой горячей клавишей, конфигом
// или словом-активатором, а таких входов было СЕМЬ.

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

// ГРАНИЦА СДВИНУТА ДВАЖДЫ: 2026-10-07 голос исключён целиком (3H.2), версия 0.2 вернула
// из него локальную диктовку (UR49, T59) — и больше ничего.
describe('диктовка живёт одним путём, и он проходит нашу проверку', () => {
  const RECORDER = 'donor/app/chat/composer/hooks/use-voice-recorder.ts'
  const COMPOSER = 'donor/app/chat/composer/index.tsx'
  // Мёртвая цепочка разговора: её вершину (`useComposerVoice`) не зовёт никто — первый блок.
  const DEAD = 'donor/app/chat/composer/hooks/use-composer-voice.ts'

  it('запись начинает только композер, и только через проверку', () => {
    expect(callers('useVoiceRecorder(')).toEqual([RECORDER, COMPOSER, DEAD].sort())

    const composer = code(read(COMPOSER))
    expect(composer).toContain('useDictationGate(record, voiceStatus)')
    // `record` — голая запись без проверки: кроме проверки, её не берёт никто.
    expect(composer.match(/\brecord\b/g)).toHaveLength(2)
    expect(composer).not.toContain('<VoicePlaybackActivity')
  })

  it('разрешение на микрофон просит один член моста, и только по живому нажатию', () => {
    expect(callers('requestMicrophoneAccess')).toEqual([
      'donor/app/chat/composer/hooks/use-mic-recorder.ts',
      'donor/global.d.ts'
    ])
    // Сырой текст: шаблоны путей в файле моста похожи на начало комментария.
    expect(callers('aecpilot.requestMicrophone(')).toEqual(['aec/dictation/store.ts'])
    expect(readFileSync(join(RENDERER, '../../preload/index.ts'), 'utf8')).toMatch(
      /requestMicrophone[\s\S]{0,200}userActivation[\s\S]{0,40}isActive/
    )
  })

  it('звук уходит только ядру: ни живого сокета, ни распознавания из окна напрямую в облако', () => {
    expect(callers('openDictationStream(')).toEqual(['donor/lib/voice-stream.ts'])
    expect(callers('transcribeAudioClientDirect(')).toEqual(['donor/lib/voice-client-direct.ts'])
    expect(callers('fetchVoiceClientConfigFor(')).toEqual(['donor/lib/voice-client-direct.ts'])
  })

  it('в ряду кнопок из голоса — только диктовка', () => {
    const controls = code(read('donor/app/chat/composer/controls.tsx'))

    expect(controls.match(/<Voice(Fan|Menu)\b[^>]*>/g)).toEqual([
      '<VoiceMenu disabled={disabled} onDictate={onDictate} state={state} voiceStatus={voiceStatus} />',
      '<VoiceFan disabled={disabled} onDictate={onDictate} state={state} voiceStatus={voiceStatus} />'
    ])
    for (const file of ['voice-fan.tsx', 'voice-menu.tsx']) {
      expect(code(read(`donor/app/chat/composer/${file}`))).not.toMatch(
        /wake|autoSpeak|conversation/i
      )
    }
  })

  it('у диктовки есть действие без клавиши по умолчанию', () => {
    expect(code(read('donor/lib/keybinds/actions.ts'))).toContain(
      "{ id: 'composer.dictate', category: 'composer', defaults: [] }"
    )
    expect(code(read('donor/app/hooks/use-keybinds.ts'))).toContain(
      "'composer.dictate': requestComposerDictation"
    )
  })
})

describe('остального голоса нет ни на одной поверхности окна', () => {
  it('у ответа нет «прочитать вслух»', () => {
    expect(callers('<ReadAloudButton')).toEqual([])
  })

  it('слово-активатор не взводится, его событие ничего не делает', () => {
    const wiring = code(read('donor/app/contrib/wiring.tsx'))

    expect(callers('armWakeWord(')).toEqual(['donor/store/wake-word.ts'])
    // Их `WakeWordButton` лежит в `controls.tsx` и у них самих нигде не рисуется.
    expect(callers('<WakeWordButton')).toEqual([])
    expect(callers('toggleWakeWord(')).toEqual([
      'donor/app/chat/composer/controls.tsx',
      'donor/store/wake-word.ts'
    ])
    expect(wiring).not.toContain('playWakeSound(')
    expect(wiring).not.toContain('newSessionInProfile(')
  })

  it('в Настройках нет раздела «Голос», в наборах — строки синтеза речи', () => {
    expect(code(read('donor/app/settings/constants.ts'))).not.toContain("id: 'voice'")
    expect(code(read('donor/lib/desktop-toolsets.ts'))).toContain("'tts'")
  })

  it('нет слэш-команды /wake', () => {
    expect(code(read('donor/lib/desktop-slash-commands.ts'))).not.toContain("name: '/wake'")
  })
})
