// Walk-through's controls outside the canvas: the view bar's button, a room's "Walk through from
// here", and while walking, the panel (where you are, how to move, Go up or down, Leave) and, on a
// touch screen, a pad of forward, back and turn buttons sized for thumbs.

import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
import { Icon } from '../nav/icons'
import { forTouch, isTouch, withKey } from '../phone/words'
import { walkThrough } from './start'
import { held, taps, useWalk, type WalkMove } from './walkStore'
import './walk.css'

/** How to move, as written for a mouse and keys (src/phone/words.ts rewords it for a finger). */
export const WALK_HINT = 'Drag to look round. Click the floor to walk there. Arrow keys or W A S D walk and step sideways, Q and E turn, and the wheel changes the pace.'

const PACE = ['slow', 'walking', 'quick']

/** The view bar's Walk through: on, or off again. */
export function WalkButton() {
  const active = useWalk(s => s.active)
  const label = 'Walk through'
  return (
    <button
      onClick={() => (active ? useWalk.getState().leave() : walkThrough())}
      aria-pressed={active}
      aria-label={label}
      title={active ? 'Leave the walk-through (Esc)' : 'Walk through the house at eye height'}
    >
      <Icon name="walk" size={16} />
      <span>{label}</span>
    </button>
  )
}

/** A room's card: walk through, starting in it. */
export function WalkFromHere({ room }: { room: string }) {
  return (
    <button type="button" onClick={() => walkThrough(room)} title="Open the 3D view standing in this room, at eye height">
      Walk through from here
    </button>
  )
}

/** Held down, it keeps going; pressed from the keyboard, one stride or turn. */
function PadButton({ move, label, className, icon }: { move: WalkMove; label: string; className?: string; icon: 'chevU' | 'chevD' | 'chevL' | 'chevR' }) {
  const stop = () => held.delete(move)
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        held.add(move)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={e => e.preventDefault()}
      // A click from a pointer was the press above; Enter or Space (detail 0) is a single step.
      onClick={(e: ReactMouseEvent) => e.detail === 0 && taps.push(move)}
    >
      <Icon name={icon} size={22} />
    </button>
  )
}

/** While walking: where you are, how to move, and the ways out. */
export function WalkPanel() {
  const active = useWalk(s => s.active)
  const place = useWalk(s => s.place)
  const up = useWalk(s => s.up)
  const down = useWalk(s => s.down)
  const speed = useWalk(s => s.speed)
  if (!active) return null
  const touch = isTouch()
  const st = useWalk.getState()
  return (
    <>
      <section className="walk-panel" aria-label="Walk-through">
        <p className="walk-place">{place}</p>
        <p className="walk-hint">
          {forTouch(WALK_HINT, touch)}
          {touch ? ' Hold the arrows to walk and turn.' : ` Pace: ${PACE[speed] ?? 'walking'}.`}
        </p>
        <div className="walk-actions">
          {up && (
            <button type="button" onClick={() => st.goLevel(1)}>
              Go up
            </button>
          )}
          {down && (
            <button type="button" onClick={() => st.goLevel(-1)}>
              Go down
            </button>
          )}
          <button type="button" className="primary" onClick={() => st.leave()} aria-label={withKey('Leave walk-through', 'Esc', touch)}>
            Leave walk-through
          </button>
        </div>
      </section>
      {touch && (
        <div className="walk-pad" role="group" aria-label="Walk">
          <PadButton move="turnLeft" label="Turn left" icon="chevL" className="tl" />
          <PadButton move="forward" label="Forward" icon="chevU" className="fwd" />
          <PadButton move="turnRight" label="Turn right" icon="chevR" className="tr" />
          <PadButton move="back" label="Back" icon="chevD" className="back" />
        </div>
      )}
    </>
  )
}
