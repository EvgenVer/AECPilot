// Task 3M.1 (acceptance 46.6.1): sigma drew labels black on the dark theme.
// The canvas now takes the theme's colours and repaints when the theme changes.

import { renderHook, waitFor } from '@testing-library/react'
import Graph from 'graphology'
import { afterEach, describe, expect, it, vi } from 'vitest'

const created: { settings: Record<string, unknown>; setSetting: ReturnType<typeof vi.fn> }[] = []

vi.mock('sigma', () => ({
  default: class {
    settings: Record<string, unknown>
    setSetting = vi.fn()
    constructor(_graph: unknown, _container: unknown, settings: Record<string, unknown>) {
      this.settings = settings
      created.push(this)
    }
    on(): void {}
    kill(): void {}
    refresh(): void {}
  }
}))

const { drawHover, themeColors, useGraphCanvas } = await import('./use-graph-canvas')

afterEach(() => {
  created.length = 0
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
