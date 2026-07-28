import { describe, expect, test } from 'vitest'
import { decideExternalLink, isOwnRendererUrl } from './external-link-policy'

/**
 * Task 1.6.4a. These are the rules that keep agent-authored text from
 * reaching the OS shell or the window, so the negative cases matter more than
 * the positive ones.
 */

describe('decideExternalLink', () => {
  test('обычные веб-ссылки и почта разрешены', () => {
    for (const url of [
      'https://example.com/spec',
      'http://example.com',
      'mailto:someone@example.com'
    ]) {
      expect(decideExternalLink(url).allowed).toBe(true)
    }
  })

  test('опасные схемы отклоняются', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'file:///C:/Windows/System32/calc.exe',
      'vbscript:msgbox(1)',
      'ms-msdt:/id',
      'smb://attacker/share'
    ]) {
      const decision = decideExternalLink(url)
      expect(decision.allowed, url).toBe(false)
    }
  })

  test('мусор вместо ссылки отклоняется, а не падает', () => {
    for (const value of ['', '   ', 'не ссылка', 42, null, undefined, {}, 'http://']) {
      expect(decideExternalLink(value).allowed).toBe(false)
    }
  })

  test('слишком длинная ссылка отклоняется', () => {
    expect(decideExternalLink(`https://example.com/${'a'.repeat(2100)}`).allowed).toBe(false)
  })

  test('в систему уходит нормализованный URL, а не исходная строка', () => {
    // То, что проверили, и то, что открыли, должно быть одной строкой.
    const decision = decideExternalLink('https://EXAMPLE.com/a/../b?x=1 2')
    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.url).toBe('https://example.com/b?x=1%202')
    }
  })
})

describe('isOwnRendererUrl', () => {
  test('своя страница разрешена в обоих режимах запуска', () => {
    expect(isOwnRendererUrl('http://localhost:5173/', 'http://localhost:5173/')).toBe(true)
    expect(
      isOwnRendererUrl(
        'file:///D:/app/out/renderer/index.html',
        'file:///D:/app/out/renderer/index.html'
      )
    ).toBe(true)
  })

  test('чужой сайт и чужой локальный файл — не своя страница', () => {
    expect(isOwnRendererUrl('https://example.com/', 'http://localhost:5173/')).toBe(false)
    expect(isOwnRendererUrl('http://localhost:5174/', 'http://localhost:5173/')).toBe(false)
    expect(
      isOwnRendererUrl(
        'file:///C:/Windows/System32/drivers/etc/hosts',
        'file:///D:/app/out/renderer/index.html'
      )
    ).toBe(false)
  })

  test('без известного адреса своей страницы навигация не разрешается никому', () => {
    expect(isOwnRendererUrl('http://localhost:5173/', undefined)).toBe(false)
  })
})
