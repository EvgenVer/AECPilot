import { describe, expect, it } from 'vitest'

import {
  decideUpdateNotice,
  feedUrlFrom,
  isNewerVersion,
  parseUpdateFeed
} from './update-check-pure'

describe('сравнение версий (T42)', () => {
  it('новее по любой из трёх частей', () => {
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true)
    expect(isNewerVersion('0.1.10', '0.1.9')).toBe(true)
    expect(isNewerVersion('v0.1.1', '0.1.0')).toBe(true)
  })

  it('та же или старшая версия — не новее', () => {
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false)
  })

  it('предрелиз младше своего выпуска; два предрелиза не сравниваются', () => {
    expect(isNewerVersion('0.2.0', '0.2.0-rc.1')).toBe(true)
    expect(isNewerVersion('0.2.0-rc.1', '0.2.0')).toBe(false)
    expect(isNewerVersion('0.2.0-rc.2', '0.2.0-rc.1')).toBe(false)
  })

  it('непонятная строка — не новее', () => {
    expect(isNewerVersion('latest', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.2', '0.1.0')).toBe(false)
  })
})

describe('файл версии (T42)', () => {
  it('берёт версию и https-ссылку', () => {
    expect(
      parseUpdateFeed('{"version":"v0.2.0","url":"https://example.org/AECPilot-0.2.0-win-x64.exe"}')
    ).toEqual({ version: '0.2.0', url: 'https://example.org/AECPilot-0.2.0-win-x64.exe' })
  })

  it('отвергает http, не JSON и неполный файл', () => {
    expect(parseUpdateFeed('{"version":"0.2.0","url":"http://example.org/a.exe"}')).toBeNull()
    expect(parseUpdateFeed('<html>')).toBeNull()
    expect(parseUpdateFeed('{"version":"0.2.0"}')).toBeNull()
    expect(parseUpdateFeed('{"version":"new","url":"https://example.org/a.exe"}')).toBeNull()
    expect(parseUpdateFeed('null')).toBeNull()
  })

  it('уведомление только для новой версии', () => {
    const feed = '{"version":"0.2.0","url":"https://example.org/a.exe"}'
    expect(decideUpdateNotice(feed, '0.1.0')).toEqual({
      version: '0.2.0',
      url: 'https://example.org/a.exe'
    })
    expect(decideUpdateNotice(feed, '0.2.0')).toBeNull()
  })
})

describe('адрес файла версии из настройки сборки (T42)', () => {
  it('пусто или не https — проверки нет', () => {
    expect(feedUrlFrom('')).toBeNull()
    expect(feedUrlFrom('   ')).toBeNull()
    expect(feedUrlFrom(undefined)).toBeNull()
    expect(feedUrlFrom('http://example.org/latest.json')).toBeNull()
    expect(feedUrlFrom('not a url')).toBeNull()
  })

  it('https-адрес принимается', () => {
    expect(feedUrlFrom(' https://example.org/latest.json ')).toBe('https://example.org/latest.json')
  })
})
