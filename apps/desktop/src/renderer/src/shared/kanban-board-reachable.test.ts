// @vitest-environment jsdom
// С пином 0.21.5 (3.B6) цепочка импортов доходит до их хранилища онбординга,
// которое при загрузке модуля читает `window` — узловой среды уже мало.
// Задача 3E.13 (UR38): доска задач ДОСТИЖИМА, а не просто лежит в дереве.
//
// ЗАЧЕМ ЭТОТ ТЕСТ ВООБЩЕ НУЖЕН. Их плагин доски приезжает выключенным —
// `defaultEnabled: false`, и это их сознательное устройство: «it inventories in
// Settings ▸ Plugins and registers nothing until the user flips the switch».
// Значит между «файлы перенесены» и «доска открывается» стоит настоящий
// переключатель, и проверять надо именно его: включили — появился маршрут
// `/kanban` и строка в боковой панели; выключили — исчезли.
//
// ПОЧЕМУ НЕ ЧЕРЕЗ `discoverBundledPlugins`. Тот путь в конце открывает дисковую
// дверь загрузчика (HX5), которой у нас нет; здесь проверяется регистрация
// вклада, а не дверь. Контекст плагина берётся НАСТОЯЩИЙ — тот самый
// `createPluginContext`, которым его поднимает приложение, вместе с правкой [3]
// (без `socket`): если бы доска на нём падала, тест бы это и показал.

import { beforeEach, describe, expect, it } from 'vitest'

import { registry } from '@/contrib/registry'
import { createPluginContext } from '@/contrib/plugin'
import { $pluginDecisions, pluginActive, setPluginEnabled } from '@/contrib/plugins-store'
import { ROUTES_AREA, SIDEBAR_NAV_AREA } from '@/app/routes'
import kanban from '@/plugins/kanban/plugin'

function ids(area: string): string[] {
  return registry.getArea(area).map((c) => c.id)
}

beforeEach(() => {
  $pluginDecisions.set({})
})

describe('доска задач достижима', () => {
  it('без решения человека выключена, с решением — включена', async () => {
    // Их умолчание, перенесённое дословно: доска не появляется сама.
    expect(pluginActive(kanban.id, kanban.defaultEnabled ?? true)).toBe(false)

    await setPluginEnabled(kanban.id, true)

    expect(pluginActive(kanban.id, kanban.defaultEnabled ?? true)).toBe(true)
  })

  it('включённая доска даёт маршрут и строку в боковой панели', () => {
    const disposers: Array<() => void> = []
    kanban.register(createPluginContext(kanban.id, (dispose) => disposers.push(dispose)))

    const route = registry.getArea(ROUTES_AREA).find((c) => c.id === 'kanban:page')

    expect(route, 'маршрута доски нет — открывать нечего').toBeDefined()
    expect((route?.data as { path?: string } | undefined)?.path).toBe('/kanban')
    expect(ids(SIDEBAR_NAV_AREA), 'в боковую панель доска не попала').toContain('kanban:nav')

    // Переключатель работает в обе стороны: выключили — вкладов не осталось.
    disposers.forEach((dispose) => dispose())

    expect(ids(ROUTES_AREA)).not.toContain('kanban:page')
    expect(ids(SIDEBAR_NAV_AREA)).not.toContain('kanban:nav')
  })
})
