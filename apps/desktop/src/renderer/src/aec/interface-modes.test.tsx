// С ядра 0.22.2 у донора два режима окна: «простой» прячет инструменты
// разработчика, «расширенный» показывает всё (задача T20.7). Решение владельца
// 2026-10-15: режимы берём, по умолчанию — расширенный, а наши строки боковой
// панели («Проект», «Индекс», «Память агента») видны в обоих. Их боковая панель
// пропускает строку через `shownInMode`, и строка с `tier: 'advanced'` из
// простого режима исчезла бы — тест держит именно это.

import { beforeAll, describe, expect, it } from 'vitest'

import { SIDEBAR_NAV_AREA, type SidebarNavContribution } from '../donor/app/routes'
import { registry } from '../donor/contrib/registry'
import { DEFAULT_INTERFACE_MODE, INTERFACE_MODES, shownInMode } from '../donor/store/interface-mode'

import { registerIndexPage } from './index-page/register'
import { registerMemoryScreen } from './memory/register'
import { registerProjectPage } from './project/register'

const ourNavRows = () =>
  registry
    .getArea(SIDEBAR_NAV_AREA)
    .filter((c) => c.id.startsWith('aec-'))
    .map((c) => ({ id: c.id, ...(c.data as SidebarNavContribution) }))

beforeAll(() => {
  // Мост без данных: подписки возвращают отписку, запросы — пустой ответ.
  // Регистрации трогают его при старте, строкам боковой панели он не нужен.
  const bridge = new Proxy(
    {},
    { get: (_, name) => (String(name).startsWith('on') ? () => () => {} : async () => null) }
  )
  Object.assign(window, { aecpilot: bridge })
})

describe('режимы окна (0.22.2): по умолчанию расширенный, наши строки видны в обоих', () => {
  it('без выбора человека окно открывается в расширенном режиме', () => {
    expect(DEFAULT_INTERFACE_MODE).toBe('advanced')
    expect(INTERFACE_MODES).toEqual(['simple', 'advanced'])
  })

  it('строки «Проект», «Индекс» и «Память агента» проходят фильтр обоих режимов', () => {
    registerProjectPage()
    registerIndexPage()
    registerMemoryScreen()

    const rows = ourNavRows()
    expect(rows.length).toBeGreaterThanOrEqual(3)

    for (const mode of INTERFACE_MODES) {
      const shown = rows.filter(shownInMode(mode)).map((r) => r.id)
      expect(shown, `режим ${mode}`).toEqual(rows.map((r) => r.id))
    }
  })
})
