// Задача 3.4 (SPEC HX13). Проверяется не «внешняя вкладка не показалась», а
// «внешней вкладки не осталось в списке» — показ зависит от дерева панелей, а
// хранилище вкладок одно и переживает перезапуск.
//
// Файл с расширением .tsx, хотя React здесь нет: по `vitest.config.ts`
// расширение и выбирает окружение, а их хранилище уведомлений зовёт
// `window.clearTimeout` — то есть отказу нужен DOM.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $previewTabs, openPreview, type PreviewTarget } from '../../donor/store/preview'

import { enforcePreviewBoundary, installPreviewBoundary } from './install-preview-boundary'

const artifact: PreviewTarget = {
  kind: 'artifact',
  label: 'Ведомость',
  source: 'sess-1:vedomost-html',
  url: 'sess-1:vedomost-html'
}

const external: PreviewTarget = {
  kind: 'url',
  label: 'example.com',
  source: 'https://example.com/page',
  url: 'https://example.com/page'
}

describe('граница вкладки предпросмотра', () => {
  beforeEach(() => {
    $previewTabs.set([])
  })

  afterEach(() => {
    $previewTabs.set([])
    vi.restoreAllMocks()
  })

  it('снимает внешнюю вкладку и оставляет артефакт', () => {
    const dispose = installPreviewBoundary()

    openPreview(artifact)
    openPreview(external)

    expect($previewTabs.get().map((tab) => tab.target.kind)).toEqual(['artifact'])
    dispose()
  })

  it('снимает вкладку, восстановленную из хранилища прошлого запуска', () => {
    $previewTabs.set([{ id: 'preview:old' as never, target: external }])

    const refused = enforcePreviewBoundary()

    expect(refused).toEqual(['https://example.com/page'])
    expect($previewTabs.get()).toEqual([])
  })

  it('не трогает список, когда открывать нечего', () => {
    $previewTabs.set([{ id: 'preview:a' as never, target: artifact }])

    expect(enforcePreviewBoundary()).toEqual([])
    expect($previewTabs.get()).toHaveLength(1)
  })
})
