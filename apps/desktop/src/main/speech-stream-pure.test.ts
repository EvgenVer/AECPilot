import { describe, expect, test } from 'vitest'
import { buildSpeakStreamUrl, isValidStreamId, parseSpeechFrame } from './speech-stream-pure'

/**
 * Task 3.7a. This channel exists because the renderer must not hold the
 * gateway token, so the two things worth pinning are: the URL is built here
 * (with the token in it) and never anywhere else, and the renderer cannot turn
 * the relay into a socket of its own choosing.
 */

const target = { host: '127.0.0.1', port: 8765, token: 'sekret-token-value' }

describe('buildSpeakStreamUrl', () => {
  test('их эндпойнт на том же хосте, порту и токене', () => {
    expect(buildSpeakStreamUrl(target)).toBe(
      'ws://127.0.0.1:8765/api/audio/speak-stream?token=sekret-token-value'
    )
  })

  test('токен экранируется, а не склеивается', () => {
    const url = new URL(buildSpeakStreamUrl({ ...target, token: 'a b&c=d' }))
    expect(url.searchParams.get('token')).toBe('a b&c=d')
    expect(url.pathname).toBe('/api/audio/speak-stream')
  })

  test('профиль в запрос не уезжает — шлюз один и им владеет main', () => {
    expect(buildSpeakStreamUrl(target)).not.toContain('profile')
  })
})

describe('isValidStreamId', () => {
  test('обычный идентификатор рендерера проходит', () => {
    expect(isValidStreamId('speech-12')).toBe(true)
  })

  test('двоеточие запрещено — иначе можно выдать себя за поток чужого окна', () => {
    // Ключ в main — `<webContentsId>:<id>`.
    expect(isValidStreamId('7:speech-1')).toBe(false)
  })

  test('мусор вместо идентификатора отклоняется, а не падает', () => {
    for (const value of ['', ' ', 'a'.repeat(65), '../etc', 42, null, undefined, {}]) {
      expect(isValidStreamId(value)).toBe(false)
    }
  })
})

describe('parseSpeechFrame', () => {
  test('три формы их протокола проходят', () => {
    expect(parseSpeechFrame('{"text":"Колонна К-1."}')).toEqual({
      ok: true,
      frame: '{"text":"Колонна К-1."}'
    })
    expect(parseSpeechFrame('{"done":true}')).toEqual({ ok: true, frame: '{"done":true}' })
    expect(parseSpeechFrame('{"stop":true}')).toEqual({ ok: true, frame: '{"stop":true}' })
  })

  test('текст вместе с done — их же случай «может совмещаться»', () => {
    expect(parseSpeechFrame('{"text":"…конец.","done":true}')).toEqual({
      ok: true,
      frame: '{"text":"…конец.","done":true}'
    })
  })

  test('лишнее поле не проезжает молча', () => {
    const result = parseSpeechFrame('{"text":"привет","voice":"alloy"}')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('voice')
  })

  test('кадр пересобирается заново, а не пересылается как есть', () => {
    // Порядок ключей и пробелы — наши, не присланные: то, чего функция не
    // разобрала, до сокета не доходит по построению.
    expect(parseSpeechFrame('{ "done" : true , "text" : "раз" }')).toEqual({
      ok: true,
      frame: '{"text":"раз","done":true}'
    })
  })

  test('неверные типы и пустой кадр отклоняются', () => {
    for (const raw of [
      '{"text":42}',
      '{"done":"yes"}',
      '{"stop":1}',
      '{}',
      '[]',
      '"строка"',
      'null',
      'не json',
      ''
    ]) {
      expect(parseSpeechFrame(raw).ok, raw).toBe(false)
    }
  })

  test('не строка — тоже отказ', () => {
    for (const raw of [{ text: 'привет' }, 42, null, undefined]) {
      expect(parseSpeechFrame(raw).ok).toBe(false)
    }
  })
})
