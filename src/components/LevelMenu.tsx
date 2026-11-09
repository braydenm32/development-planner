// The plan's "Drawing on …" chip, as a menu of the levels: each with its floor RL and how its floor
// is built, a click to draw on it, and an eye that shows or hides its walls faintly under the
// level being drawn on (its ghost). Page Up and Page Down step through the levels too.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../nav/icons'
import { setGhost, type LevelRow } from '../plan/levelMenu'
import { usePlan } from '../plan/store'
import './levels.css'

/** Close the menu on a click outside it, or on Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

/** The level being drawn on, as a menu of every level; `action` is a small control after it (Pick a contour). */
export function LevelMenu({ rows, action }: { rows: LevelRow[]; action?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const on = rows.find(r => r.active)
  const many = rows.length > 1
  const ghosts = rows.filter(r => r.ghost).length
  if (!on) return null
  return (
    <div className={`level-chip level-menu${open ? ' open' : ''}`} ref={ref}>
      <span className="level-menu-line">
        <button
          type="button"
          className="level-menu-button"
          onClick={() => many && setOpen(!open)}
          aria-haspopup={many ? 'menu' : undefined}
          aria-expanded={many ? open : undefined}
          title={many ? 'Change level (Page Up, Page Down)' : undefined}
        >
          Drawing on <b>{on.name}</b> · floor RL {on.rl.toFixed(2)}
          {many && <Icon name={open ? 'chevU' : 'chevD'} size={13} />}
        </button>
        {action}
      </span>
      {many && !open && ghosts > 0 && <span className="muted">Faint dashed lines: walls on {ghosts === 1 ? rows.find(r => r.ghost)!.name : `${ghosts} other levels`}</span>}
      {open && (
        <ul className="level-menu-list" role="menu" aria-label="Levels">
          {rows.map(r => (
            <li key={r.id} className={r.active ? 'on' : ''}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={r.active}
                className="level-menu-pick"
                onClick={() => {
                  usePlan.getState().setActiveLevel(r.id)
                  setOpen(false)
                }}
              >
                <span className="level-menu-name">{r.name}</span>
                <span className="muted small">
                  RL {r.rl.toFixed(2)} · {r.floorText}
                </span>
              </button>
              {r.active ? (
                <span className="level-menu-here muted small">drawing</span>
              ) : (
                <button
                  type="button"
                  className={`level-menu-ghost${r.ghost ? '' : ' off'}`}
                  aria-pressed={r.ghost}
                  aria-label={`Show ${r.name} faintly`}
                  title={r.ghost ? `Hide ${r.name}’s walls` : `Show ${r.name}’s walls faintly`}
                  onClick={() => setGhost(r.id, !r.ghost)}
                >
                  <Icon name="eye" size={16} />
                </button>
              )}
            </li>
          ))}
          <li className="level-menu-foot muted small">Page Up and Page Down change level. The eye shows a level’s walls faintly, to line up with and snap to.</li>
        </ul>
      )}
    </div>
  )
}
