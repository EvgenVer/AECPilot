// Задача 3E.26. Что уходит в настоящий браузер человека, а что нет.
//
// Главная проверка здесь одна и она про отказ: окно называет адрес, а главный
// процесс открывает его В БРАУЗЕРЕ, где нашей песочницы уже нет. Значит
// «рендерер попросил» не может быть причиной открыть произвольный местный файл.

import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { decideOpenPreviewExternal, previewExternalError } from './preview-external-pure'

const win = process.platform === 'win32'
const PROJECT = win ? 'D:\\проект' : '/проект'
const ATTACHMENTS = win ? 'C:\\данные\\attachments' : '/данные/attachments'
const INSIDE = win ? 'D:\\проект\\отчёт.html' : '/проект/отчёт.html'
const STAGED = win ? 'C:\\данные\\attachments\\a1.html' : '/данные/attachments/a1.html'
const SECRET = win ? 'C:\\Users\\Evgen\\.ssh\\id_rsa' : '/home/evgen/.ssh/id_rsa'

const scope = { attachmentsDir: ATTACHMENTS, projectRoot: PROJECT }
const nothingPicked = (): boolean => false
const everythingPicked = (): boolean => true

describe('decideOpenPreviewExternal', () => {
  it('страница проекта уходит в браузер адресом file://', () => {
    expect(decideOpenPreviewExternal(INSIDE, scope, nothingPicked)).toEqual({
      ok: true,
      staged: false,
      url: pathToFileURL(INSIDE).toString()
    })
  })

  it('выгруженное самим предпросмотром — тоже: его записал главный процесс', () => {
    // Ветка `dataUrl`: их код сначала просит `saveImageBuffer` положить
    // содержимое файлом и лишь потом открывает его.
    const decision = decideOpenPreviewExternal(STAGED, scope, nothingPicked)

    expect(decision).toEqual({ ok: true, staged: true, url: pathToFileURL(STAGED).toString() })
  })

  it('ЧУЖОЙ ФАЙЛ — ОТКАЗ, и это главное правило задачи', () => {
    expect(decideOpenPreviewExternal(SECRET, scope, nothingPicked)).toEqual({
      ok: false,
      error: previewExternalError()
    })
  })

  it('тот же чужой файл — можно, если человек выбрал его в нашем диалоге', () => {
    expect(decideOpenPreviewExternal(SECRET, scope, everythingPicked).ok).toBe(true)
  })

  it('выход из проекта точками не проходит', () => {
    expect(decideOpenPreviewExternal('../чужое/секрет.html', scope, nothingPicked).ok).toBe(false)
  })

  it('обычная ссылка уходит по общей политике, нормализованной', () => {
    expect(decideOpenPreviewExternal('https://example.com/a b', scope, nothingPicked)).toEqual({
      ok: true,
      staged: false,
      url: 'https://example.com/a%20b'
    })
  })

  it('javascript: и data: не проходят — их отвергает та же общая политика', () => {
    // Проверяются здесь, а не только в её тестах: эта дверь новая, и молчаливое
    // расширение схем было бы именно тем, чего задача не должна делать.
    expect(decideOpenPreviewExternal('javascript:alert(1)', scope, nothingPicked).ok).toBe(false)
    expect(
      decideOpenPreviewExternal('data:text/html,<script>x</script>', scope, nothingPicked).ok
    ).toBe(false)
  })

  it('пустой адрес — отказ, а не открытие чего попало', () => {
    expect(decideOpenPreviewExternal('', scope, nothingPicked).ok).toBe(false)
    expect(decideOpenPreviewExternal(undefined, scope, nothingPicked).ok).toBe(false)
  })

  it('без открытого проекта относительный путь не разрешается', () => {
    expect(
      decideOpenPreviewExternal('./отчёт.html', { attachmentsDir: ATTACHMENTS }, nothingPicked).ok
    ).toBe(false)
  })
})
