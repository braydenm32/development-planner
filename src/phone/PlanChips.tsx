// The plan's corner pieces, made small for a phone: the level chip on one short line that
// opens the list of floors, and the ground key folded into a "Key" chip.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../nav/icons'
import { sortedLevels, type Plan } from '../plan/model'
import { levelFloorRL } from '../plan/groundOverlay'
import { usePlan } from '../plan/store'

/** Close a small popover on a tap outside it, or on Escape. */
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

/** "Ground floor · RL 12.34", and a tap opens the other floors. */
export function PhoneLevelChip({ plan, level, rl }: { plan: Plan; level: string; rl: number }) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const levels = sortedLevels(plan)
  const name = levels.find(l => l.id === level)?.name ?? ''
  const many = levels.length > 1
  return (
    <div className="level-chip phone-level" ref={ref}>
      <button
        className="level-chip-button"
        onClick={() => many && setOpen(!open)}
        aria-haspopup={many ? 'listbox' : undefined}
        aria-expanded={many ? open : undefined}
        aria-label={`${name}, floor RL ${rl.toFixed(2)}${many ? '. Change floor' : ''}`}
      >
        <span className="level-chip-text">
          <b>{name}</b> · RL {rl.toFixed(2)}
        </span>
        {many && <Icon name={open ? 'chevU' : 'chevD'} size={15} />}
      </button>
      {open && (
        <ul className="level-pick" role="listbox" aria-label="Floors">
          {[...levels].reverse().map(l => (
            <li key={l.id}>
              <button
                role="option"
                aria-selected={l.id === level}
                className={l.id === level ? 'on' : ''}
                onClick={() => {
                  usePlan.getState().setActiveLevel(l.id)
                  setOpen(false)
                }}
              >
                <span>{l.name}</span>
                <span className="muted">RL {levelFloorRL(plan, l.id).toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** On a phone, the ground key folds into a small "Key" chip; elsewhere it shows as it is. */
export function KeyChip({ collapse, children }: { collapse: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  if (!collapse) return <>{children}</>
  return (
    <div className={`key-chip${open ? ' open' : ''}`} ref={ref}>
      {open && <div className="key-pop">{children}</div>}
      <button className="key-chip-button" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="key-swatches" aria-hidden="true">
          <i className="fill" />
          <i className="cut" />
        </span>
        Key
      </button>
    </div>
  )
}
