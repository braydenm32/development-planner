// The plan's right-click menu (src/pointer/menuItems.ts says what's in it). A right-click that
// doesn't move opens it on what is under the pointer, which it selects first so the card and the
// menu agree; a right-drag still pans. The Menu key (or Shift+F10) opens it for the selection.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Vec2 } from '../lib/geom'
import { shortcutAllowed, shortcutText } from '../nav/keys'
import { useModal } from '../nav/useModal'
import { usePlan } from '../plan/store'
import { closePlanMenu, openPlanMenu, usePlanMenu, type Open } from './planMenuStore'
import './pointer.css'

/** The menu itself, inside the plan; and the Menu key, which opens it for what is selected. */
export function PlanMenu({ on, middle, toHouse }: { on: boolean; middle: Vec2; toHouse: (px: Vec2) => Vec2 }) {
  const open = usePlanMenu(s => s.open)
  // What the key handler needs of the latest drawing.
  const live = useRef({ on, middle, toHouse })
  useLayoutEffect(() => {
    live.current = { on, middle, toHouse }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return
      const l = live.current
      if (!l.on || !shortcutAllowed(e)) return
      e.preventDefault()
      const st = usePlan.getState()
      openPlanMenu(st.selection, l.middle, l.toHouse(l.middle))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // Leaving the plan (another tab, the 3D view) shuts it.
  useEffect(() => closePlanMenu, [])
  useEffect(() => {
    if (!on) closePlanMenu()
  }, [on])
  return open && on ? <Menu key={`${open.x},${open.y}`} open={open} /> : null
}

function Menu({ open }: { open: Open }) {
  const box = useRef<HTMLDivElement>(null)
  // Focus starts on the first item and Tab stays inside; Esc closes it and nothing else (src/nav/useModal.ts).
  useModal(box, true, closePlanMenu)
  // Kept inside the plan: opened near its right or bottom edge, it opens the other way. (Unseen until placed,
  // but never `visibility: hidden`, which would refuse the focus the menu opens with.)
  const [pos, setPos] = useState({ left: open.x, top: open.y, placed: false })
  useLayoutEffect(() => {
    const el = box.current
    const host = el?.offsetParent as HTMLElement | null
    if (!el || !host) return
    const left = Math.max(4, open.x + el.offsetWidth > host.clientWidth - 4 ? open.x - el.offsetWidth : open.x)
    const top = Math.max(4, open.y + el.offsetHeight > host.clientHeight - 4 ? open.y - el.offsetHeight : open.y)
    setPos({ left, top, placed: true })
  }, [open.x, open.y])
  // A press anywhere else closes it (and goes on to do what it would have done).
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) closePlanMenu()
    }
    document.addEventListener('pointerdown', away, true)
    window.addEventListener('blur', closePlanMenu)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      window.removeEventListener('blur', closePlanMenu)
    }
  }, [])
  const step = (by: number) => {
    const items = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    items[(at + by + items.length) % items.length]?.focus()
  }
  return (
    <div
      ref={box}
      className="plan-menu"
      role="menu"
      aria-label="Actions for this"
      style={{ left: pos.left, top: pos.top, opacity: pos.placed ? undefined : 0 }}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          step(e.key === 'ArrowDown' ? 1 : -1)
        }
      }}
    >
      {open.items.map(it => (
        <button
          key={it.id}
          type="button"
          role="menuitem"
          className={`${it.danger ? 'danger' : ''}${it.rule ? ' rule' : ''}`}
          onClick={() => {
            closePlanMenu()
            it.run()
          }}
        >
          <span>{it.label}</span>
          {it.keys && <kbd>{shortcutText(it.keys)}</kbd>}
        </button>
      ))}
    </div>
  )
}
