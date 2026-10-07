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
// С 2026-10-07 ГОЛОС ВНЕ ОБЪЁМА ЦЕЛИКОМ (решение владельца после приёмки, SPEC
// HX19, задача 3H.2). Прежде тест держал границу с двух сторон — снятое мертво,
// оставленное (диктовка, «прочитать вслух», слово-активатор) живо. Теперь
// оставленного нет: вторая половина проверяет, что голоса нет нигде.

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

// ГРАНИЦА СДВИНУТА 2026-10-07 (решение владельца после приёмки, SPEC HX19,
// задача 3H.2): голос исключён ЦЕЛИКОМ — диктовка, кнопка «прочитать вслух» и
// слово-активатор ушли вслед за разговором. Прежняя вторая половина теста
// («оставленное взятым работает») держала их живыми и заменена этой.
describe('голоса нет ни на одной поверхности окна', () => {
  it('композер не регистрирует диктовку и не рисует голосовые кнопки', () => {
    const composer = code(read('donor/app/chat/composer/index.tsx'))
    const controls = code(read('donor/app/chat/composer/controls.tsx'))

    expect(composer).not.toContain('useVoiceRecorder(')
    expect(composer).not.toContain('<VoiceActivity')
    expect(composer).not.toContain('<VoicePlaybackActivity')
    expect(controls).not.toContain('<VoiceFan')
    expect(controls).not.toContain('<VoiceMenu')
  })

  it('у ответа нет «прочитать вслух»', () => {
    expect(callers('<ReadAloudButton')).toEqual([])
  })

  it('слово-активатор не взводится, его событие ничего не делает', () => {
    const wiring = code(read('donor/app/contrib/wiring.tsx'))

    expect(callers('armWakeWord(')).toEqual(['donor/store/wake-word.ts'])
    expect(wiring).not.toContain('playWakeSound(')
    expect(wiring).not.toContain('newSessionInProfile(')
  })

  it('в Настройках нет раздела «Голос», в наборах — строки синтеза речи', () => {
    expect(code(read('donor/app/settings/constants.ts'))).not.toContain("id: 'voice'")
    expect(code(read('donor/lib/desktop-toolsets.ts'))).toContain("'tts'")
  })

  it('нет клавиши диктовки и слэш-команды /wake', () => {
    expect(code(read('donor/lib/keybinds/actions.ts'))).not.toContain("'composer.dictate'")
    expect(code(read('donor/app/hooks/use-keybinds.ts'))).not.toContain("'composer.dictate'")
    expect(code(read('donor/lib/desktop-slash-commands.ts'))).not.toContain("name: '/wake'")
  })
})
