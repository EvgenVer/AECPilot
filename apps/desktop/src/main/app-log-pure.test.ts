// Задача 3.29. Главное, что здесь проверяется, — что в журнал не уедет токен:
// файл на диске люди пересылают, а адрес шлюза несёт `?token=…`.

import { describe, expect, it } from 'vitest'

import {
  formatLine,
  formatRendererError,
  redactLogLine,
  RECENT_LINES,
  tailLines,
  textOfArgs
} from './app-log-pure'

describe('в журнал не попадает секрет', () => {
  it('токен в адресе шлюза', () => {
    expect(redactLogLine('connect ws://127.0.0.1:8765/api/ws?token=deadbeefcafe1234')).toBe(
      'connect ws://127.0.0.1:8765/api/ws?token=***'
    )
  })

  it('токен вторым параметром', () => {
    expect(redactLogLine('GET /api/x?a=1&access_token=abc.def-ghi&b=2')).toBe(
      'GET /api/x?a=1&access_token=***&b=2'
    )
  })

  it('переменная окружения с токеном', () => {
    expect(redactLogLine('env HERMES_DASHBOARD_SESSION_TOKEN=0123456789abcdef')).toBe(
      'env HERMES_DASHBOARD_SESSION_TOKEN=***'
    )
  })

  it('заголовок авторизации', () => {
    expect(redactLogLine('Authorization: Bearer zzz999')).toBe('Authorization: ***')
  })

  it('ключ поставщика модели — второй слой гасит его целиком', () => {
    expect(redactLogLine('bad key sk-abcd1234EFGH5678ijkl')).toBe('bad key [скрыто]')
  })

  it('токен, напечатанный БЕЗ имени поля, — то, чего прицельные правила не видят', () => {
    expect(redactLogLine('token 0123456789abcdef0123456789abcdef')).toBe('token [скрыто]')
  })

  it('обычная строка не портится', () => {
    const line = 'aecpilot: window created (project D:\\work\\smeta)'
    expect(redactLogLine(line)).toBe(line)
  })

  it('вырезание работает и внутри собранной строки журнала', () => {
    expect(formatLine('error', 'FAIL ws://h/api/ws?token=secret', '2026-08-21T10:00:00.000Z')).toBe(
      '2026-08-21T10:00:00.000Z ERROR FAIL ws://h/api/ws?token=***\n'
    )
  })
})

describe('строка журнала', () => {
  it('время, уровень, текст — по одной строке на запись', () => {
    expect(formatLine('log', 'привет', '2026-08-21T10:00:00.000Z')).toBe(
      '2026-08-21T10:00:00.000Z LOG   привет\n'
    )
  })

  it('многострочный текст не разрывает запись', () => {
    const line = formatLine('warn', 'первая\nвторая', '2026-08-21T10:00:00.000Z')
    expect(line.split('\n')).toHaveLength(2)
    expect(line).toContain('первая ⏎ вторая')
  })
})

describe('textOfArgs', () => {
  it('строки соединяются пробелом, как в консоли', () => {
    expect(textOfArgs(['a', 'b'])).toBe('a b')
  })

  it('ошибка разворачивается со стеком — иначе запись бесполезна', () => {
    const error = new Error('сломалось')
    expect(textOfArgs([error])).toContain('Error: сломалось')
    expect(textOfArgs([error])).toContain('app-log-pure.test')
  })

  it('объект сериализуется, а неподъёмный — не роняет запись', () => {
    expect(textOfArgs([{ a: 1 }])).toBe('{"a":1}')
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(textOfArgs([cyclic])).toBe('[object Object]')
  })
})

describe('падение рендерера', () => {
  it('окно, граница, сообщение и верхушка стека — в одной строке', () => {
    expect(
      formatRendererError({
        label: 'main',
        boundary: 'root',
        message: 'destroy_ is not a function',
        componentStack: 'at ThemeProvider'
      })
    ).toBe('renderer crashed [main/root] destroy_ is not a function | at ThemeProvider')
  })

  it('без сообщения записывать нечего', () => {
    expect(formatRendererError({ boundary: 'root' })).toBeNull()
    expect(formatRendererError(undefined)).toBeNull()
  })

  it('пустые поля заменяются, а не печатаются пустыми', () => {
    expect(formatRendererError({ message: 'бум' })).toBe('renderer crashed [main/unlabeled] бум')
  })

  it('огромный стек обрезается', () => {
    const report = formatRendererError({ message: 'бум', componentStack: 'x'.repeat(9000) })
    expect(report?.length).toBeLessThan(2600)
  })
})

describe('хвост журнала', () => {
  it('последние строки, без пустого хвоста', () => {
    expect(tailLines('a\nb\nc\n', 2)).toEqual(['b', 'c'])
  })

  it('короткий файл отдаётся целиком', () => {
    expect(tailLines('одна\n')).toEqual(['одна'])
  })

  it('пустой файл — пустой список', () => {
    expect(tailLines('')).toEqual([])
  })

  it('умолчание — сколько обещано экрану', () => {
    const content = Array.from({ length: 500 }, (_unused, index) => `строка ${index}`).join('\n')
    expect(tailLines(content)).toHaveLength(RECENT_LINES)
  })
})
