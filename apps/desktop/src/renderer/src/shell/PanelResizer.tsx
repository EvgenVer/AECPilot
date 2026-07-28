import { useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { clamp } from './panel-sizes-pure'

/** Draggable separator between two shell panels (task 1.5.9, extended to the
 * vertical axis by batch L of Phase 1.6 — SPEC UR12: every panel border can be
 * dragged). VS Code-style: zero-size in layout — a `::before` pseudo-element
 * (see shell.css `.panel-resizer`) provides the hit area straddling the border
 * and the hover/focus accent, so inserting a resizer never shifts the panels.
 * Drag maths and persistence are the parent's (Shell.tsx); this only turns
 * pointer/keyboard input into clamped size values.
 *
 * `orientation` is the separator line's own orientation: 'vertical' for a
 * vertical line between side-by-side panels (drag left/right, Arrow Left and
 * Right), 'horizontal' for a horizontal line between stacked panels (drag
 * up/down, Arrow Up and Down).
 *
 * `direction` is +1 when dragging right/down should GROW the panel (the panel
 * is above/to the left of the resizer, e.g. the sidebar) and -1 when it should
 * SHRINK it (the panel is below/to the right, e.g. the chat dock, the sources
 * section, the bottom panel), so `onResize` always receives the panel's own
 * new size regardless of side.
 *
 * Double-clicking restores `defaultSize` (task 1.6.L3), as in VS Code. The
 * two mousedown/mouseup pairs a double-click also fires are zero-delta drags,
 * so they leave the size untouched before the reset lands. */
export default function PanelResizer({
  label,
  size,
  min,
  max,
  defaultSize,
  direction,
  orientation = 'vertical',
  onResize,
  onCommit
}: {
  label: string
  size: number
  min: number
  max: number
  /** Size restored on double-click. */
  defaultSize: number
  direction: 1 | -1
  orientation?: 'vertical' | 'horizontal'
  /** Live size during a drag / keyboard nudge (parent updates state). */
  onResize: (size: number) => void
  /** Drag/nudge/reset finished — parent persists the current size. */
  onCommit: () => void
}) {
  // Start of the active drag; a ref (not state) so the window listeners read
  // it without re-subscribing, and so a mid-drag re-render can't disturb it.
  const dragStart = useRef<{ pos: number; size: number } | null>(null)
  const isVertical = orientation === 'vertical'
  const draggingClass = isVertical ? 'resizing-col' : 'resizing-row'

  /** Pointer coordinate along the axis this separator moves on. */
  function axisPos(event: { clientX: number; clientY: number }): number {
    return isVertical ? event.clientX : event.clientY
  }

  function handleMouseDown(event: ReactMouseEvent<HTMLDivElement>): void {
    event.preventDefault()
    // `preventDefault` above suppresses the drag's text selection — and, in
    // Chromium, the default focus along with it. Without this explicit focus
    // a click never focuses the separator, so `handleKeyDown` below never
    // receives anything and the keyboard control of UR12 is dead on arrival
    // (task 1.6.L4; the defect shipped with 1.5.9 and survived to batch L).
    event.currentTarget.focus()
    dragStart.current = { pos: axisPos(event), size }
    document.body.classList.add(draggingClass)

    function handleMove(moveEvent: MouseEvent): void {
      const start = dragStart.current
      if (!start) return
      const delta = (axisPos(moveEvent) - start.pos) * direction
      onResize(clamp(start.size + delta, min, max))
    }
    function handleUp(): void {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      document.body.classList.remove(draggingClass)
      dragStart.current = null
      onCommit()
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  function handleKeyDown(event: ReactKeyboardEvent): void {
    const grow = isVertical ? 'ArrowRight' : 'ArrowDown'
    const shrink = isVertical ? 'ArrowLeft' : 'ArrowUp'
    if (event.key !== grow && event.key !== shrink) return
    event.preventDefault()
    const step = (event.shiftKey ? 24 : 8) * (event.key === grow ? 1 : -1)
    onResize(clamp(size + step * direction, min, max))
    onCommit()
  }

  function handleDoubleClick(): void {
    onResize(defaultSize)
    onCommit()
  }

  return (
    <div
      className={`panel-resizer panel-resizer--${orientation}`}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(size)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    />
  )
}
