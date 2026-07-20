import { useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { clamp } from './panel-sizes-pure'

/** Draggable vertical separator between two shell panels (task 1.5.9,
 * VS Code-style). Zero-width in layout — a `::before` pseudo-element (see
 * shell.css `.panel-resizer`) provides the hit area straddling the border
 * and the hover/focus accent, so inserting a resizer never shifts the
 * panels. Drag maths and persistence are the parent's (Shell.tsx); this only
 * turns pointer/keyboard input into clamped width values.
 *
 * `direction` is +1 when dragging right should GROW the panel (the panel is
 * to the resizer's left, e.g. the sidebar) and -1 when dragging right should
 * SHRINK it (the panel is to the resizer's right, e.g. the chat dock), so
 * `onResize` always receives the panel's own new width regardless of side. */
export default function PanelResizer({
  label,
  width,
  min,
  max,
  direction,
  onResize,
  onCommit
}: {
  label: string
  width: number
  min: number
  max: number
  direction: 1 | -1
  /** Live width during a drag / keyboard nudge (parent updates state). */
  onResize: (width: number) => void
  /** Drag/nudge finished — parent persists the current width. */
  onCommit: () => void
}) {
  // Start of the active drag; a ref (not state) so the window listeners read
  // it without re-subscribing, and so a mid-drag re-render can't disturb it.
  const dragStart = useRef<{ x: number; width: number } | null>(null)

  function handleMouseDown(event: ReactMouseEvent): void {
    event.preventDefault()
    dragStart.current = { x: event.clientX, width }
    document.body.classList.add('resizing-col')

    function handleMove(moveEvent: MouseEvent): void {
      const start = dragStart.current
      if (!start) return
      const delta = (moveEvent.clientX - start.x) * direction
      onResize(clamp(start.width + delta, min, max))
    }
    function handleUp(): void {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      document.body.classList.remove('resizing-col')
      dragStart.current = null
      onCommit()
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  function handleKeyDown(event: ReactKeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = (event.shiftKey ? 24 : 8) * (event.key === 'ArrowRight' ? 1 : -1)
    onResize(clamp(width + step * direction, min, max))
    onCommit()
  }

  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
    />
  )
}
