/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/hooks/use-grab-scroll.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { type MouseEvent as ReactMouseEvent, type RefObject, useState } from 'react'

// Grab-to-pan for overflow containers — the shared primitive behind "scrub the
// board/timeline by dragging its background" (kanban lanes, trace waterfalls,
// wide tables). Sibling of lib/trackpad-gestures.ts: that file classifies
// wheel gestures, this one owns pointer-drag panning, so surfaces stop
// re-deriving the same interaction (the dashboard kanban and the agent-traces
// waterfall each hand-rolled a copy).
//
// Behavior contract:
//  - drags translate scrollLeft/scrollTop (both axes, whichever overflow);
//  - interactive targets never start a pan (buttons, inputs, links,
//    [draggable] cards keep their own drag semantics);
//  - the native scrollbar gutters stay untouched as the fallback affordance;
//  - selection can't start mid-pan (preventDefault on move), and window
//    blur/mouseup always end it.

const BLOCKED_TARGETS = 'button,input,textarea,select,a,[role="button"],[draggable="true"]'
const SCROLLBAR_GUTTER_PX = 16

export interface GrabScroll {
  /** True while a pan is in flight — drive `cursor-grabbing` styling. */
  grabbing: boolean
  /** Spread onto the scroll container. */
  onMouseDown: (event: ReactMouseEvent) => void
}

export function useGrabScroll(ref: RefObject<HTMLElement | null>): GrabScroll {
  const [grabbing, setGrabbing] = useState(false)

  const onMouseDown = (event: ReactMouseEvent) => {
    const el = ref.current

    if (event.button !== 0 || !el) {
      return
    }

    const canX = el.scrollWidth > el.clientWidth
    const canY = el.scrollHeight > el.clientHeight

    if ((!canX && !canY) || (event.target as HTMLElement).closest(BLOCKED_TARGETS)) {
      return
    }

    const rect = el.getBoundingClientRect()

    if (
      (canX && event.clientY >= rect.bottom - SCROLLBAR_GUTTER_PX) ||
      (canY && event.clientX >= rect.right - SCROLLBAR_GUTTER_PX)
    ) {
      return
    }

    const start = { left: el.scrollLeft, top: el.scrollTop, x: event.clientX, y: event.clientY }
    setGrabbing(true)

    const onMove = (move: MouseEvent) => {
      el.scrollLeft = start.left - (move.clientX - start.x)
      el.scrollTop = start.top - (move.clientY - start.y)
      move.preventDefault()
    }

    const stop = () => {
      setGrabbing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('blur', stop)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', stop, { once: true })
    window.addEventListener('blur', stop, { once: true })
    event.preventDefault()
  }

  return { grabbing, onMouseDown }
}
