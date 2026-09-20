// Задача 3F.5, D-96: настоящий правый клик останавливается до их слушателя и
// проигрывается заново через паузу; факты орфографии, пришедшие в паузу,
// вкладываются в открытое меню; их поле ввода получает проверку орфографии.
//
// Чужие слушатели изображает счётчик на окне; любое событие не из нашего
// списка копий считается настоящим жестом.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $contextMenu, openDomContextMenu } from '../../donor/app/context-menu/store'

import { enableComposerSpellcheck, installContextMenuHitTestGuard } from './hit-test-guard'

type Facts = { misspelledWord: string; suggestions: string[] }

let uninstall: (() => void) | undefined
let deliverFacts: ((facts: Facts) => void) | undefined
let seenByTheirs: MouseEvent[] = []

function gesture(x: number, y: number): MouseEvent {
  return new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 2
  })
}

const theirs = (event: Event): void => {
  seenByTheirs.push(event as MouseEvent)
}

beforeEach(() => {
  vi.useFakeTimers()
  seenByTheirs = []
  deliverFacts = undefined
  window.aecpilot = {
    onContextMenuSpellcheck: (cb: (facts: Facts) => void) => {
      deliverFacts = cb
      return () => {
        deliverFacts = undefined
      }
    }
  } as unknown as typeof window.aecpilot
  // Наш слушатель ставится первым — как из тела `main.tsx`; их — после.
  uninstall = installContextMenuHitTestGuard()
  window.addEventListener('contextmenu', theirs, true)
})

afterEach(() => {
  window.removeEventListener('contextmenu', theirs, true)
  uninstall?.()
  $contextMenu.set(null)
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('installContextMenuHitTestGuard', () => {
  it('настоящий клик до их слушателя не доходит, копия приходит через паузу на ту же цель', () => {
    const field = document.createElement('div')
    document.body.appendChild(field)
    const event = gesture(120, 340)

    field.dispatchEvent(event)
    expect(seenByTheirs).toHaveLength(0)
    expect(event.defaultPrevented).toBe(false)

    vi.advanceTimersByTime(30)
    expect(seenByTheirs).toHaveLength(1)
    const replay = seenByTheirs[0]
    expect(replay).not.toBe(event)
    expect(replay.target).toBe(field)
    expect([replay.clientX, replay.clientY, replay.button]).toEqual([120, 340, 2])
    // Копия не перехватывается повторно.
    vi.advanceTimersByTime(100)
    expect(seenByTheirs).toHaveLength(1)
  })

  it('факты, пришедшие в паузу, вкладываются в открытое меню', () => {
    const field = document.createElement('div')
    field.contentEditable = 'true'
    document.body.appendChild(field)
    // Их слушатель открывает меню на копии — как настоящий `AppContextMenu`.
    const opener = (): void => {
      openDomContextMenu(1, 1, { editable: field } as never)
    }
    window.addEventListener('contextmenu', opener, true)

    field.dispatchEvent(gesture(10, 10))
    deliverFacts?.({ misspelledWord: 'привт', suggestions: ['привет'] })
    vi.advanceTimersByTime(30)

    const open = $contextMenu.get()
    expect(open?.kind).toBe('dom')
    expect(open?.kind === 'dom' && open.spellcheck).toEqual({
      misspelledWord: 'привт',
      suggestions: ['привет']
    })
    window.removeEventListener('contextmenu', opener, true)
  })

  it('факты прошлого клика не попадают в следующее меню', () => {
    const field = document.createElement('div')
    field.contentEditable = 'true'
    document.body.appendChild(field)
    const opener = (): void => {
      openDomContextMenu(1, 1, { editable: field } as never)
    }
    window.addEventListener('contextmenu', opener, true)

    field.dispatchEvent(gesture(10, 10))
    deliverFacts?.({ misspelledWord: 'привт', suggestions: ['привет'] })
    vi.advanceTimersByTime(30)
    $contextMenu.set(null)

    field.dispatchEvent(gesture(10, 10))
    vi.advanceTimersByTime(30)
    const open = $contextMenu.get()
    expect(open?.kind === 'dom' && open.spellcheck).toBeNull()
    window.removeEventListener('contextmenu', opener, true)
  })
})

describe('enableComposerSpellcheck', () => {
  it('их поле ввода получает spellcheck после монтирования', async () => {
    const stop = enableComposerSpellcheck()
    const input = document.createElement('div')
    input.setAttribute('data-slot', 'composer-rich-input')
    input.setAttribute('spellcheck', 'false')
    document.body.appendChild(input)
    // MutationObserver отдаёт записи микрозадачей.
    await Promise.resolve()
    expect(input.getAttribute('spellcheck')).toBe('true')
    stop()
  })
})
