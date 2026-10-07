// Что именно человек собрался отметить в граф (задача 5.15).
//
// Состояние здесь, а не в пропсах, по одной причине: строку меню рисует ряд
// дерева источников, лежащий на три уровня вглубь, а окно подтверждения —
// панель. Протаскивать обработчик через три компонента значило бы связать их
// тем, что к ним не относится.
//
// Цель — это ИСТОЧНИК И ЗАПИСЬ В НЁМ, а не готовый путь: путь области графа
// собирает главный процесс (`decideGraphMark`), и окно его не строит.

import { atom } from 'nanostores'

import type { GraphScopeKind } from '../../../../shared/ipc'
import { openIndexPage } from '../workspace-pages'

export interface GraphTarget {
  kind: GraphScopeKind
  /** Что показать человеку. Для корня источника это его путь на диске. */
  label: string
  /** Путь от корня источника; пусто — сам корень. */
  rel: string
  sourceId: string
}

export const $graphTarget = atom<GraphTarget | null>(null)

export function askGraphAdd(target: GraphTarget): void {
  $graphTarget.set(target)
}

export function closeGraphAdd(): void {
  $graphTarget.set(null)
}

/** «Проиндексировать» на папке или файле дерева (задача 3H.18): индексируется
 *  только выбранное, оба прохода, и человек сразу видит ход на странице
 *  «Индекс». Цель — та же пара «источник и запись», что у графа: путь собирает
 *  главный процесс. Отказ из дерева возможен один — «индексация уже идёт», и
 *  страница, на которую мы переходим, показывает ту, что идёт. */
export async function indexTarget(target: GraphTarget): Promise<void> {
  await window.aecpilot.startIngest(false, false, {
    kind: target.kind,
    rel: target.rel,
    sourceId: target.sourceId
  })
  openIndexPage()
}
