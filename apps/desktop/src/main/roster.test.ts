// Задачи 3C.1 и 3D.6 (SPEC UR27, контракт — docs/history/specs/agent-roster.md §Р6).
//
// Ядро подменяется: предмет проверки — что именно мы у него просим для снимка
// роестра. Проверок создания, правки, дубля, удаления, расширенных возможностей
// и постоянного чата здесь больше нет — эти обращения идут путём их плагина с
// задачи 3D.3, а наши удалены задачей 3D.6.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { configureRoster, listRoster } from './roster'

const request = vi.fn()

beforeEach(() => {
  request.mockReset()
  configureRoster({ request })
})

describe('список специалистов', () => {
  it('спрашивается без сессий: последняя реплика нужна была строке списка', async () => {
    request.mockResolvedValue({ profiles: [] })

    await listRoster()

    expect(request).toHaveBeenCalledWith('profiles.list')
  })

  it('разбирается в строки снимка', async () => {
    request.mockResolvedValue({
      profiles: [{ name: 'smeta', ui_meta: { 'hermes-bots': { title: 'Смета' } } }]
    })

    expect(await listRoster()).toEqual([{ name: 'smeta', title: 'Смета' }])
  })

  it('без подключения к ядру — внятный отказ, а не падение по undefined', async () => {
    configureRoster(undefined as never)

    await expect(listRoster()).rejects.toThrow('роестр не подключён к ядру')
  })
})
