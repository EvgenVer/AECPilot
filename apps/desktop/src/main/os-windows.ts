// Окно ОС под нашим (задача 3E.8, UR30; отменённый SPEC HX12).
//
// ЧТО ЭТО ДАЁТ АГЕНТУ. Инструмент `read_window_below` отвечает на вопрос «что
// у человека открыто прямо под этим окном»: чертёж в другом приложении,
// таблица, чужая программа. Без него управление компьютером (UR30) слепое —
// нажимать некуда, потому что неизвестно, что на экране.
//
// КОНТРАКТ ПРИВАТНОСТИ ЗАПИСАН В САМОМ HX12 И ОСТАЁТСЯ В СИЛЕ ПОСЛЕ ЕГО
// ОТМЕНЫ — это условие возврата, а не то, что вместе с ним отменилось:
//   1. ТОЛЬКО МЕТАДАННЫЕ: приложение, заголовок, границы. Никогда пиксели.
//      Снимок экрана — это другой разговор и другое разрешение; здесь его нет
//      ни в одном пути, и `get-windows` его и не умеет.
//   2. НА macOS РАЗРЕШЕНИЕ Screen Recording НЕ ЗАПРАШИВАЕТСЯ. У `get-windows`
//      заголовок окна на macOS доступен только с этим разрешением, и её
//      `requestPermissions: true` вызвал бы системный диалог. Мы зовём её без
//      него: разрешение уже есть — заголовок придёт, нет — придёт пустой, и мы
//      скажем об этом словами. Диалог, которого человек не просил, — это не
//      «мы предложили», это «мы полезли».
//
// ПОЧЕМУ ОТВЕТ ВСЕГДА ЕСТЬ. Пустой ответ инструмента ядро ждёт все свои 30
// секунд, и «агент завис» — самое дорогое, чем можно ответить. Отказ обязан
// быть быстрым и назвать причину в `note`.

import { platform } from 'node:os'

/** Их форма ответа (`global.d.ts::readWindowBelow`). Повторена здесь, а не
 * импортирована: тип живёт в зоне донора и уедет при следующем переносе, а
 * контракт главного процесса — наш. */
export interface WindowBelow {
  frontmost: { app: string; title: string } | null
  note?: string
  platform: string
  window: {
    app: string
    bounds: { height: number; width: number; x: number; y: number }
    id: number
    title: string
  } | null
}

/** Всё, что нам нужно от `get-windows`, — одна функция. Вынесено параметром,
 * чтобы решение проверялось без нативного модуля. */
export interface ActiveWindowLike {
  id?: number
  title?: string
  owner?: { name?: string; processId?: number }
  bounds?: { x?: number; y?: number; width?: number; height?: number }
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Переводит ответ `get-windows` в наш контракт.
 *
 * НАШЕ СОБСТВЕННОЕ ОКНО ОТСЕИВАЕТСЯ. Инструмент называется «окно ПОД нашим»;
 * отдать своё же значило бы показать агенту его собственный интерфейс и выдать
 * это за рабочий стол человека.
 */
export function describeWindowBelow(
  active: ActiveWindowLike | null | undefined,
  ourPids: number[],
  host: string = platform()
): WindowBelow {
  if (!active) {
    return {
      frontmost: null,
      platform: host,
      window: null,
      note:
        host === 'darwin'
          ? 'окно не определено: на macOS для заголовков нужно разрешение Screen Recording, а запрашивать его мы не будем'
          : 'окно не определено: сверху нет ни одного окна, которое система готова назвать'
    }
  }

  const app = text(active.owner?.name)
  const title = text(active.title)
  const pid = active.owner?.processId

  if (typeof pid === 'number' && ourPids.includes(pid)) {
    return {
      frontmost: { app, title },
      platform: host,
      window: null,
      note: 'сверху окно самого приложения — под ним ничего не видно, переключитесь на нужное окно'
    }
  }

  return {
    frontmost: { app, title },
    platform: host,
    window: {
      app,
      title,
      id: num(active.id),
      bounds: {
        x: num(active.bounds?.x),
        y: num(active.bounds?.y),
        width: num(active.bounds?.width),
        height: num(active.bounds?.height)
      }
    }
  }
}

/** Загружается лениво и один раз: нативный модуль стоит времени запуска, а
 * нужен он ровно тогда, когда агент спросит. */
let loaded: { activeWindow: () => Promise<ActiveWindowLike | undefined> } | null | undefined

async function loadGetWindows(): Promise<typeof loaded> {
  if (loaded !== undefined) return loaded
  try {
    loaded = (await import('get-windows')) as unknown as {
      activeWindow: () => Promise<ActiveWindowLike | undefined>
    }
  } catch (error: unknown) {
    console.error('aecpilot: get-windows unavailable', error)
    loaded = null
  }
  return loaded
}

export async function readWindowBelow(ourPids: number[]): Promise<WindowBelow> {
  const module = await loadGetWindows()
  if (!module) {
    return {
      frontmost: null,
      platform: platform(),
      window: null,
      note: 'перечисление окон недоступно в этой сборке'
    }
  }

  try {
    // БЕЗ `requestPermissions`: см. пункт 2 в шапке.
    const active = await module.activeWindow()
    return describeWindowBelow(active ?? null, ourPids)
  } catch (error: unknown) {
    console.error('aecpilot: read_window_below failed', error)
    return {
      frontmost: null,
      platform: platform(),
      window: null,
      note: 'окно не прочитано: система отказала в перечислении'
    }
  }
}
