// Task 3M.1 (acceptance 46.6.1): sigma drew labels black on the dark theme.
// The canvas now takes the theme's colours and repaints when the theme changes.
// Task 3M.2 (acceptance 46.6.4): the drawing follows its box, not the window.
// Task T57: sigma 4 takes the colours as display fields from the node reducer.

import { renderHook, waitFor } from '@testing-library/react'
import Graph from 'graphology'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Reducer = (key: string, data: object, attributes: Record<string, unknown>) => object
type Drawn = {
  options: { nodeReducer: Reducer; settings: Record<string, unknown> }
  refresh: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
}
const created: Drawn[] = []

// jsdom has no ResizeObserver; this one lets the test say «the box changed».
const boxes: { callback: () => void; disconnected: boolean; target?: Element }[] = []
vi.stubGlobal(
  'ResizeObserver',
  class {
    entry: (typeof boxes)[number]
    constructor(callback: () => void) {
      this.entry = { callback, disconnected: false }
      boxes.push(this.entry)
    }
    observe(target: Element): void {
      this.entry.target = target
    }
    disconnect(): void {
      this.entry.disconnected = true
    }
  }
)

vi.mock('sigma', () => ({
  default: class {
    options: Drawn['options']
    resize = vi.fn()
    refresh = vi.fn()
    constructor(_graph: unknown, _container: unknown, options: Drawn['options']) {
      this.options = options
      created.push(this)
    }
    on(): void {}
    kill(): void {}
  }
}))

const { themeColors, themeDisplay, useGraphCanvas } = await import('./use-graph-canvas')

afterEach(() => {
  created.length = 0
  boxes.length = 0
  document.documentElement.className = ''
  document.body.innerHTML = ''
})

function canvasIn(background: string, color: string): HTMLDivElement {
  const page = document.createElement('div')
  page.style.backgroundColor = background
  const canvas = document.createElement('div')
  canvas.style.color = color
  page.append(canvas)
  document.body.append(page)
  return canvas
}

describe('цвета графа по теме (3M.1)', () => {
  it('текст — цвет холста, фон — первый непрозрачный вокруг него', () => {
    const canvas = canvasIn('rgb(13, 17, 23)', 'rgb(230, 237, 243)')
    expect(themeColors(canvas)).toEqual({
      background: 'rgb(13, 17, 23)',
      text: 'rgb(230, 237, 243)'
    })
  })

  it('под «стеклом» фон вокруг прозрачный — берётся фон темы `bg-background`, а не белый (47.1.2)', () => {
    const style = document.createElement('style')
    style.textContent = '.bg-background { background-color: rgb(13, 17, 23); }'
    document.head.append(style)
    const canvas = canvasIn('transparent', 'rgb(230, 237, 243)')
    expect(themeColors(canvas)).toEqual({
      background: 'rgb(13, 17, 23)',
      text: 'rgb(230, 237, 243)'
    })
    expect(canvas.querySelector('.bg-background')).toBeNull()
    style.remove()
  })

  it('плашка наведения — фоном темы, подпись — её текстом, а не белым и чёрным', () => {
    expect(themeDisplay({ background: '#0d1117', text: '#e6edf3' })).toEqual({
      backdropColor: '#0d1117',
      labelColor: '#e6edf3'
    })
  })

  it('холст получает цвета темы и перекрашивает их при смене темы', async () => {
    const canvas = canvasIn('rgb(255, 255, 255)', 'rgb(0, 0, 0)')
    const graph = new Graph()
    graph.addNode('a', { label: 'А', size: 4, x: 0, y: 0 })
    renderHook(() => useGraphCanvas({ current: canvas }, graph, '', {}))
    await waitFor(() => expect(created).toHaveLength(1))
    const node = () => created[0].options.nodeReducer('a', {}, graph.getNodeAttributes('a'))
    expect(node()).toMatchObject({
      backdropColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(0, 0, 0)'
    })

    canvas.style.color = 'rgb(230, 237, 243)'
    canvas.parentElement!.style.backgroundColor = 'rgb(13, 17, 23)'
    document.documentElement.classList.add('dark')
    await waitFor(() => expect(created[0].refresh).toHaveBeenCalled())
    expect(node()).toMatchObject({
      backdropColor: 'rgb(13, 17, 23)',
      labelColor: 'rgb(230, 237, 243)'
    })
  })

  it('совпадение поиска держит подпись и плашку, остальное гаснет (T57)', async () => {
    const canvas = canvasIn('rgb(255, 255, 255)', 'rgb(0, 0, 0)')
    const graph = new Graph()
    graph.addNode('a', { label: 'Плита', size: 4, x: 0, y: 0 })
    graph.addNode('b', { label: 'Колонна', size: 4, x: 1, y: 1 })
    renderHook(() => useGraphCanvas({ current: canvas }, graph, 'плит', {}))
    await waitFor(() => expect(created).toHaveLength(1))
    const reduce = created[0].options.nodeReducer
    expect(reduce('a', {}, graph.getNodeAttributes('a'))).toMatchObject({
      backdropVisibility: 'visible',
      highlighted: true,
      labelVisibility: 'visible'
    })
    expect(reduce('b', {}, graph.getNodeAttributes('b'))).toMatchObject({ label: '' })
    expect(created[0].options.settings.enableNodeDrag).toBe(false)
  })
})

describe('холст по своей рамке (3M.2)', () => {
  it('рамка изменилась — sigma пересчитывает размер и перерисовывает; ушёл — следить перестаёт', async () => {
    const canvas = canvasIn('rgb(255, 255, 255)', 'rgb(0, 0, 0)')
    const graph = new Graph()
    graph.addNode('a', { label: 'А', size: 4, x: 0, y: 0 })
    const view = renderHook(() => useGraphCanvas({ current: canvas }, graph, '', {}))
    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0].options.settings.allowInvalidContainer).toBe(true)
    expect(boxes[0].target).toBe(canvas)

    boxes[0].callback()
    expect(created[0].resize).toHaveBeenCalledTimes(1)
    expect(created[0].refresh).toHaveBeenCalled()

    view.unmount()
    expect(boxes[0].disconnected).toBe(true)
  })
})
