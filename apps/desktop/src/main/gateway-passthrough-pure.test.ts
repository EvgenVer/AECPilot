import { describe, expect, it } from 'vitest'
import {
  checkRestCall,
  checkRpcCall,
  classifyEnvWrite,
  describeRpcFailure,
  explainProfileDeleteFailure,
  sanitizeRpcParams
} from './gateway-passthrough-pure'

describe('checkRpcCall', () => {
  it('passes a gateway method through unchanged', () => {
    expect(checkRpcCall('session.list')).toBe('session.list')
    expect(checkRpcCall('skill_hub.search')).toBe('skill_hub.search')
  })

  it('refuses the plaintext key-write method (rule R2)', () => {
    expect(() => checkRpcCall('model.save_key')).toThrow(/rule R2/)
  })

  it('refuses anything that is not shaped like a method name', () => {
    expect(() => checkRpcCall('')).toThrow(/non-empty string/)
    expect(() => checkRpcCall(42)).toThrow(/non-empty string/)
    // No namespace, and no room for a smuggled path or frame field.
    expect(() => checkRpcCall('submit')).toThrow(/not a gateway method name/)
    expect(() => checkRpcCall('session.list; drop')).toThrow(/not a gateway method name/)
  })
})

describe('sanitizeRpcParams (задача 3.4в, риск R19)', () => {
  it('снимает пометку скрытого хода — второй рубеж после перехвата в окне', () => {
    expect(
      sanitizeRpcParams({ session_id: 's1', text: 'пересчитай', display_kind: 'hidden' })
    ).toEqual({ session_id: 's1', text: 'пересчитай' })
  })

  it('не трогает остальные виды строк — их ставит ядро, а не окно', () => {
    const params = { session_id: 's1', display_kind: 'model_switch' }

    expect(sanitizeRpcParams(params)).toEqual(params)
  })

  it('прочие параметры проходят как есть', () => {
    const params = { session_id: 's1', text: 'вопрос', interrupted: true }

    expect(sanitizeRpcParams(params)).toEqual(params)
  })

  it('мусор вместо объекта даёт пустые параметры, а не бросок', () => {
    expect(sanitizeRpcParams(undefined)).toEqual({})
    expect(sanitizeRpcParams('строка')).toEqual({})
    expect(sanitizeRpcParams([1, 2])).toEqual({})
  })
})

describe('checkRestCall', () => {
  it('normalizes the verb and keeps the path', () => {
    expect(checkRestCall('post', '/api/mcp/servers')).toEqual({
      method: 'POST',
      path: '/api/mcp/servers'
    })
  })

  it('defaults to GET when the caller omits the verb', () => {
    expect(checkRestCall(undefined, '/api/status').method).toBe('GET')
  })

  it('refuses the plaintext secret-read route (rule R2)', () => {
    expect(() => checkRestCall('POST', '/api/env/reveal')).toThrow(/rule R2/)
  })

  it('refuses the denied route with a query string attached', () => {
    expect(() => checkRestCall('POST', '/api/env/reveal?profile=dev')).toThrow(/rule R2/)
  })

  it('allows the same path under a verb that is not denied', () => {
    expect(checkRestCall('GET', '/api/env/reveal').method).toBe('GET')
  })

  it('refuses a path outside /api/', () => {
    expect(() => checkRestCall('GET', '/etc/passwd')).toThrow(/must start with/)
    expect(() => checkRestCall('GET', 'api/status')).toThrow(/must start with/)
    expect(() => checkRestCall('GET', 42)).toThrow(/must start with/)
  })

  it('refuses path traversal', () => {
    expect(() => checkRestCall('GET', '/api/../secret')).toThrow(/traversal/)
  })

  it('refuses an unsupported verb', () => {
    // Пример был `PATCH` — и в этом состояла ошибка: донор ходит им на шесть
    // маршрутов (архив сессии, закрепление, отметка прочитанного, имя профиля),
    // а проверка его отбивала. Найдено задачей 3.16; теперь список глаголов
    // сверяется с их деревом гейтом `donor-rest-verbs.test.ts`.
    expect(() => checkRestCall('TRACE', '/api/status')).toThrow(/unsupported method/)
  })
})

describe('explainProfileDeleteFailure', () => {
  const busy = 'REST DELETE /api/profiles/dev failed: 500 [WinError 32] file is being used'

  it('replaces the raw 500 with something the user can act on (D-14)', () => {
    const message = explainProfileDeleteFailure('DELETE', '/api/profiles/dev', busy)
    expect(message).toContain('Профиль не удалён')
    expect(message).toContain('перезапустите приложение')
  })

  it('leaves every other failure alone', () => {
    // A different route, a different verb, and a different reason must all
    // keep the core's own words — this translation is for ONE known bug.
    expect(explainProfileDeleteFailure('DELETE', '/api/mcp/servers/x', busy)).toBeNull()
    expect(explainProfileDeleteFailure('GET', '/api/profiles/dev', busy)).toBeNull()
    expect(
      explainProfileDeleteFailure('DELETE', '/api/profiles/dev', 'profile not found (404)')
    ).toBeNull()
  })

  it('still matches when the path carries a query string', () => {
    expect(explainProfileDeleteFailure('DELETE', '/api/profiles/dev?force=1', busy)).not.toBeNull()
  })
})

// Находка D-37. Отказ обязан пережить `ipcRenderer.invoke`, который доносит
// только текст: код и данные едут отдельными полями.
describe('describeRpcFailure', () => {
  it('код и данные JSON-RPC сохраняются', () => {
    const error = Object.assign(new Error('gateway error 4018: gone'), {
      code: 4018,
      data: { segment_ordinal: -1 }
    })

    expect(describeRpcFailure(error)).toEqual({
      message: 'gateway error 4018: gone',
      code: 4018,
      data: { segment_ordinal: -1 }
    })
  })

  it('обычная ошибка едет одним текстом', () => {
    expect(describeRpcFailure(new Error('gateway is not connected'))).toEqual({
      message: 'gateway is not connected'
    })
  })

  it('не-число в поле code не выдаётся за код JSON-RPC', () => {
    const error = Object.assign(new Error('нет'), { code: 'ENOENT' })

    expect(describeRpcFailure(error)).toEqual({ message: 'нет' })
  })

  it('несериализуемая нагрузка отбрасывается, а ответ доезжает', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const error = Object.assign(new Error('кольцо'), { code: 4018, data: cyclic })

    expect(describeRpcFailure(error)).toEqual({ message: 'кольцо', code: 4018 })
  })
})

// Задача 3E.2. Их панель настроек инструментов пишет ключ через
// `PUT /api/env` — открытым текстом в `.env` профиля. Правило C10 велит
// шифровать; правило проверяется здесь, потому что молчаливая утечка секрета
// в файл, который читает наш же агент, не даёт ни одного видимого симптома.
describe('classifyEnvWrite', () => {
  const put = (key: unknown, value: unknown) => classifyEnvWrite('PUT', '/api/env', { key, value })

  it('ключ провайдера перехватывается, а не уезжает в .env', () => {
    expect(put('TAVILY_API_KEY', ' secret ')).toEqual({
      action: 'store',
      envVar: 'TAVILY_API_KEY',
      value: 'secret'
    })
  })

  it('перехватываются все формы секрета, а не только *_API_KEY', () => {
    for (const name of ['XAI_API_KEY', 'TOOL_GATEWAY_USER_TOKEN', 'SOME_SECRET', 'DB_PASSWORD']) {
      expect(put(name, 'x'), name).toMatchObject({ action: 'store', envVar: name })
    }
  })

  it('адрес своего сервера — не секрет и едет к ядру, где человек его прочитает', () => {
    for (const name of ['SEARXNG_URL', 'FIRECRAWL_API_URL', 'KEENABLE_API_URL']) {
      expect(classifyEnvWrite('PUT', '/api/env', { key: name, value: 'http://x' }), name).toEqual({
        action: 'forward'
      })
    }
  })

  it('пустое значение — это стирание, а не сохранение пустого ключа', () => {
    expect(put('EXA_API_KEY', '   ')).toEqual({ action: 'clear', envVar: 'EXA_API_KEY', value: '' })
  })

  it('удаление перехватывается тоже — иначе наш ключ пережил бы своё удаление', () => {
    expect(classifyEnvWrite('DELETE', '/api/env', { key: 'EXA_API_KEY' })).toEqual({
      action: 'clear',
      envVar: 'EXA_API_KEY',
      value: ''
    })
  })

  it('чужие маршруты и чтения не трогаются', () => {
    expect(classifyEnvWrite('GET', '/api/env', undefined)).toEqual({ action: 'forward' })
    expect(classifyEnvWrite('PUT', '/api/config', { key: 'X_API_KEY', value: 'y' })).toEqual({
      action: 'forward'
    })
  })

  it('строка запроса не прячет маршрут от правила', () => {
    expect(
      classifyEnvWrite('PUT', '/api/env?profile=smeta', { key: 'X_API_KEY', value: 'y' })
    ).toMatchObject({
      action: 'store'
    })
  })

  it('имя не в форме переменной окружения пропускается: перехватывать нечего', () => {
    expect(put('lowercase_key', 'y')).toEqual({ action: 'forward' })
    expect(put(42, 'y')).toEqual({ action: 'forward' })
  })
})
