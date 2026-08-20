// Задача 3.4 (SPEC HX13). Что именно считается внешним — единственное решение
// этой границы; исполнение проверяется рядом, в `preview-boundary.test.tsx`.

import { describe, expect, it } from 'vitest'

import type { PreviewTarget } from '../../donor/store/preview'

import { isExternalPreview } from './preview-boundary-pure'

const artifact: PreviewTarget = {
  kind: 'artifact',
  label: 'Ведомость',
  source: 'sess-1:vedomost-html',
  url: 'sess-1:vedomost-html'
}

const file: PreviewTarget = {
  kind: 'file',
  label: 'смета.md',
  path: 'D:/vault/wiki/смета.md',
  previewKind: 'text',
  source: 'wiki/смета.md',
  url: 'file:///D:/vault/wiki/%D1%81%D0%BC%D0%B5%D1%82%D0%B0.md'
}

const external: PreviewTarget = {
  kind: 'url',
  label: 'example.com',
  source: 'https://example.com/page',
  url: 'https://example.com/page'
}

describe('isExternalPreview', () => {
  it('внешним считается их вид `url` — единственный, что рождается из http(s)', () => {
    expect(isExternalPreview(external)).toBe(true)
  })

  it('и любая цель с сетевой схемой, каким бы видом она ни пришла', () => {
    // Цель могла прийти с той стороны моста (`normalizePreviewTarget`), где вид
    // проставляет не их renderer-ветка.
    expect(isExternalPreview({ kind: 'file', url: 'http://192.168.0.10/report.html' })).toBe(true)
    expect(isExternalPreview({ kind: 'file', url: 'ws://somewhere/socket' })).toBe(true)
    expect(isExternalPreview({ kind: 'artifact', source: 'https://example.com' })).toBe(true)
  })

  it('артефакт и файл проекта — не внешние', () => {
    expect(isExternalPreview(artifact)).toBe(false)
    expect(isExternalPreview(file)).toBe(false)
    expect(isExternalPreview({ kind: 'file', url: 'data:image/png;base64,AAA' })).toBe(false)
  })

  it('идентификатор артефакта с двоеточием не принимается за адрес', () => {
    // `sess-1:vedomost-html` выглядит как схема, но ею не является — проверка
    // должна смотреть на конкретные сетевые схемы, а не на «есть двоеточие».
    expect(isExternalPreview({ kind: 'artifact', url: 'sess-1:vedomost-html' })).toBe(false)
  })
})
