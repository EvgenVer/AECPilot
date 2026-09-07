// Задача 3E.8 (UR30, отменённый HX12). Проверяется НЕ «работает ли
// `get-windows`» (она работает), а наш контракт вокруг неё — тот самый, который
// был условием возврата исключения.

import { describe, expect, it } from 'vitest'

import { describeWindowBelow } from './os-windows'

const CHERTEZH = {
  id: 4242,
  title: 'АР-12 План этажа.dwg',
  owner: { name: 'AutoCAD', processId: 9001 },
  bounds: { x: 100, y: 50, width: 1280, height: 800 }
}

describe('describeWindowBelow', () => {
  it('отдаёт приложение, заголовок и границы', () => {
    const seen = describeWindowBelow(CHERTEZH, [777], 'win32')

    expect(seen.window).toEqual({
      app: 'AutoCAD',
      title: 'АР-12 План этажа.dwg',
      id: 4242,
      bounds: { x: 100, y: 50, width: 1280, height: 800 }
    })
  })

  it('пикселей в ответе нет ни под каким именем', () => {
    // Главное обещание HX12, и проверяется оно по ВСЕМУ ответу, а не по списку
    // полей: появится картинка под любым ключом — тест упадёт.
    const seen = JSON.stringify(describeWindowBelow(CHERTEZH, [], 'win32'))

    expect(seen).not.toMatch(/data:image|base64|screenshot|thumbnail|pixels/i)
  })

  it('своё окно не выдаётся за рабочий стол человека', () => {
    // Инструмент называется «окно ПОД нашим». Отдать своё значило бы показать
    // агенту его собственный интерфейс.
    const ours = { ...CHERTEZH, owner: { name: 'AECPilot', processId: 777 } }
    const seen = describeWindowBelow(ours, [777, 778], 'win32')

    expect(seen.window).toBeNull()
    expect(seen.frontmost).toEqual({ app: 'AECPilot', title: 'АР-12 План этажа.dwg' })
    expect(seen.note ?? '').toContain('самого приложения')
  })

  it('окна нет — отказ назван словами, а не пустотой', () => {
    // Пустой ответ ядро ждёт все свои 30 секунд: «агент завис» дороже отказа.
    const seen = describeWindowBelow(null, [], 'win32')

    expect(seen.window).toBeNull()
    expect(seen.note ?? '').not.toBe('')
  })

  it('на macOS отказ объясняет, что разрешения мы не просим', () => {
    const seen = describeWindowBelow(null, [], 'darwin')

    expect(seen.note ?? '').toContain('Screen Recording')
    expect(seen.platform).toBe('darwin')
  })

  it('битые числа не превращаются в NaN в ответе агенту', () => {
    const broken = { title: 'Без границ', owner: { name: 'Блокнот' } }
    const seen = describeWindowBelow(broken, [], 'win32')

    expect(seen.window?.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(JSON.stringify(seen)).not.toContain('null,')
  })
})
