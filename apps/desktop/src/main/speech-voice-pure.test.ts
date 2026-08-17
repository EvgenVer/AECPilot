import { describe, expect, test } from 'vitest'
import { DEFAULT_TTS_VOICE, ensureVoiceInConfigYaml } from './speech-voice-pure'

/**
 * Task 3.7a. This runs on every start against a file that belongs to hermes, so
 * the cases that matter are the ones where it must do NOTHING: a voice someone
 * chose, a shape it does not understand, a second run over its own output.
 */

describe('ensureVoiceInConfigYaml', () => {
  test('нет секции tts — дописывается блок', () => {
    const result = ensureVoiceInConfigYaml('model:\n  name: gpt-5\n')

    expect(result.changed).toBe(true)
    expect(result.text).toBe(`model:\n  name: gpt-5\ntts:\n  voice: "${DEFAULT_TTS_VOICE}"\n`)
  })

  test('секция есть, голоса нет — добавляется только голос', () => {
    const result = ensureVoiceInConfigYaml('tts:\n  provider: edge\n  rate: "+0%"\n')

    expect(result.changed).toBe(true)
    expect(result.text).toBe(
      `tts:\n  voice: "${DEFAULT_TTS_VOICE}"\n  provider: edge\n  rate: "+0%"\n`
    )
  })

  test('голос уже выбран — файл не трогается', () => {
    const chosen = 'tts:\n  voice: en-GB-SoniaNeural\n'

    expect(ensureVoiceInConfigYaml(chosen)).toEqual({
      text: chosen,
      changed: false,
      unexpectedStructure: false
    })
  })

  test('второй прогон ничего не меняет', () => {
    const once = ensureVoiceInConfigYaml('model:\n  name: gpt-5\n').text
    const twice = ensureVoiceInConfigYaml(once)

    expect(twice.changed).toBe(false)
    expect(twice.text).toBe(once)
  })

  test('tts скаляром — не наша структура, файл остаётся как есть', () => {
    const scalar = 'tts: off\n'

    expect(ensureVoiceInConfigYaml(scalar)).toEqual({
      text: scalar,
      changed: false,
      unexpectedStructure: true
    })
  })

  test('соседние секции и комментарии сохраняются', () => {
    const text = [
      '# нижний блок трогать нельзя',
      'tts:',
      '  provider: edge',
      'stt:',
      '  provider: whisper',
      ''
    ].join('\n')
    const result = ensureVoiceInConfigYaml(text)

    expect(result.text).toBe(
      [
        '# нижний блок трогать нельзя',
        'tts:',
        `  voice: "${DEFAULT_TTS_VOICE}"`,
        '  provider: edge',
        'stt:',
        '  provider: whisper',
        ''
      ].join('\n')
    )
  })

  test('пустой файл — блок всё равно валидный', () => {
    expect(ensureVoiceInConfigYaml('').text).toBe(`tts:\n  voice: "${DEFAULT_TTS_VOICE}"\n`)
  })
})
