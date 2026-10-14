// Task 3M.1 (acceptance 46.6.1): sigma drew labels black on the dark theme.
// The canvas now takes the theme's colours and repaints when the theme changes.
// Task 3M.2 (acceptance 46.6.4): the drawing follows its box, not the window.

import { renderHook, waitFor } from '@testing-library/react'
import Graph from 'graphology'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Drawn = {
  refresh: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  setSetting: ReturnType<typeof vi.fn>
  settings: Record<string, unknown>
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
    settings: Record<string, unknown>
    setSetting = vi.fn()
    resize = vi.fn()
    refresh = vi.fn()
    constructor(_graph: unknown, _container: unknown, settings: Record<string, unknown>) {
      this.settings = settings
      created.push(this)
    }
    on(): void {}
    kill(): void {}
  }
}))

const { drawHover, themeColors, useGraphCanvas } = await import('./use-graph-canvas')

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
    const fills: string[] = []
    const context = {
      arc: vi.fn(),
      beginPath: vi.fn(),
      fill: vi.fn(() => fills.push(context.fillStyle)),
      fillRect: vi.fn(() => fills.push(context.fillStyle)),
      fillStyle: '',
      fillText: vi.fn(() => fills.push(context.fillStyle)),
      font: '',
      measureText: () => ({ width: 40 }),
      shadowBlur: 0,
      shadowColor: ''
    }
    const draw = drawHover(() => ({ background: '#0d1117', text: '#e6edf3' }))
    draw(
      context as unknown as CanvasRenderingContext2D,
      { color: '#f80', label: 'КР', size: 5, x: 10, y: 10 },
      { labelFont: 'sans', labelSize: 12, labelWeight: 'normal' } as never
    )
    expect(fills).toEqual(['#0d1117', '#0d1117', '#e6edf3'])
    expect(context.fillText).toHaveBeenCalledWith('КР', 18, 14)
  })

  it('холст получает цвет подписей темы и перекрашивает их при смене темы', async () => {
    const canvas = canvasIn('rgb(255, 255, 255)', 'rgb(0, 0, 0)')
    const graph = new Graph()
    graph.addNode('a', { label: 'А', size: 4, x: 0, y: 0 })
    renderHook(() => useGraphCanvas({ current: canvas }, graph, '', {}))
    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0].settings.labelColor).toEqual({ color: 'rgb(0, 0, 0)' })

    canvas.style.color = 'rgb(230, 237, 243)'
    document.documentElement.classList.add('dark')
    await waitFor(() =>
      expect(created[0].setSetting).toHaveBeenCalledWith('labelColor', {
        color: 'rgb(230, 237, 243)'
      })
    )
  })
})

describe('холст по своей рамке (3M.2)', () => {
  it('рамка изменилась — sigma пересчитывает размер и перерисовывает; ушёл — следить перестаёт', async () => {
    const canvas = canvasIn('rgb(255, 255, 255)', 'rgb(0, 0, 0)')
    const graph = new Graph()
    graph.addNode('a', { label: 'А', size: 4, x: 0, y: 0 })
    const view = renderHook(() => useGraphCanvas({ current: canvas }, graph, '', {}))
    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0].settings.allowInvalidContainer).toBe(true)
    expect(boxes[0].target).toBe(canvas)

    boxes[0].callback()
    expect(created[0].resize).toHaveBeenCalledTimes(1)
    expect(created[0].refresh).toHaveBeenCalled()

    view.unmount()
    expect(boxes[0].disconnected).toBe(true)
  })
})
