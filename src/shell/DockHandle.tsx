// The docked panel's edge: drag it, or use the arrow keys on it, to make the panel wider or
// narrower (DB-21). Home puts it back to the tab's own width. The width is kept per device.

import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { DOCK_EXTRA, setDockExtra, useDock } from './dock'

export function DockHandle({ base, width }: { base: number; width: number }) {
  const extra = useDock(s => s.extra)
  const drag = useRef<{ x: number; extra: number } | null>(null)

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const by = e.shiftKey ? DOCK_EXTRA.step * 4 : DOCK_EXTRA.step
    const next = e.key === 'ArrowRight' ? extra + by : e.key === 'ArrowLeft' ? extra - by : e.key === 'Home' ? 0 : null
    if (next === null) return
    e.preventDefault()
    e.stopPropagation()
    setDockExtra(next)
  }
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, extra }
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) setDockExtra(drag.current.extra + e.clientX - drag.current.x)
  }
  const onUp = () => {
    drag.current = null
  }
  return (
    <div
      className="dock-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Panel width"
      aria-valuenow={width}
      aria-valuemin={base + DOCK_EXTRA.min}
      aria-valuemax={base + DOCK_EXTRA.max}
      aria-valuetext={`${width} pixels wide`}
      title="Drag to make the panel wider or narrower (or use the arrow keys; Home puts it back)"
      tabIndex={0}
      data-owns-keys
      onKeyDown={onKey}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={() => setDockExtra(0)}
    />
  )
}
