// Наши страницы в основной области: «Индекс», «Память» и «Проект» (задачи
// 3H.8–3H.10, 3H.28, SPEC UR43).
//
// СТРАНИЦА, А НЕ ОКНО НАД СТРОКОЙ СОСТОЯНИЯ: в простом режиме и по Ctrl+Shift+S
// донор прячет строку состояния, и всё, что в ней смонтировано, исчезает вместе
// с ней (D-189). Маршрут их области `routes` живёт, пока жива оболочка, а входов
// к нему три — строка боковой панели, пункт «Настроек» и строка Ctrl+K.
//
// Переход — те же два шага, что у их `host.navigate`: хэш и `syncWorkspaceRoute`.
// Их `sdk` целиком сюда не тянем — он поднимает полприложения, а нужен один вызов.

import { syncWorkspaceRoute } from '../donor/app/routes'

export const INDEX_PAGE = '/aec-index'
export const MEMORY_PAGE = '/aec-memory'
export const PROJECT_PAGE = '/aec-project'

export function openWorkspacePage(path: string): void {
  window.location.hash = `#${path}`
  // Повторный переход на ту же страницу не меняет хэш и не будит их роутер —
  // страницу выводит вперёд этот вызов (тот же довод у них в `host.navigate`).
  syncWorkspaceRoute(path)
}

export function openIndexPage(): void {
  openWorkspacePage(INDEX_PAGE)
}
