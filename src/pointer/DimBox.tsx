// The box a wall's length is typed in, on the plan (see src/pointer/useDimLabels.tsx).

import { useEffect, useId, useRef, useState } from 'react'
import { readNumber } from '../components/readNumber'
import { wallLength, type Plan, type Wall } from '../plan/model'
import { setWallLength } from '../plan/ops'
import { usePlan } from '../plan/store'
import { MIN_WALL, stillerEnd, wallLengthProblem } from '../plan/wallJoins'
import { closeDimEdit } from './dimStore'
import './pointer.css'

/** The longest a wall can be typed (m), as its card allows. */
const MAX_WALL = 200

export function DimBox({ plan, wall: w, x, y }: { plan: Plan; wall: Wall; x: number; y: number }) {
  const shown = Math.round(wallLength(w) * 1000).toString()
  const [text, setText] = useState(shown)
  const [tried, setTried] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  const hintId = useId()
  // The end that disturbs less of the plan moves; the plan rings it while the box is open (useDimLabels).
  const end = stillerEnd(plan, w.id)
  // After the press that opened it has finished (a press moves the focus itself, and would take it straight back).
  useEffect(() => {
    const soon = requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.select()
    })
    return () => cancelAnimationFrame(soon)
  }, [])
  const reading = readNumber(text, 'mm', false, MIN_WALL, MAX_WALL, len => wallLengthProblem(plan, w.id, len, end))
  const bad = !reading.ok && tried
  /** Keep what was typed if it can be used; true when the box can close. */
  const keep = (): boolean => {
    if (text.trim() === shown) return true
    if (!reading.ok) return false
    if (Math.abs(reading.value - wallLength(w)) > 1e-9) usePlan.getState().commit(p => setWallLength(p, w.id, reading.value, end))
    return true
  }
  const close = () => {
    done.current = true
    closeDimEdit()
  }
  return (
    <div className="dim-edit" style={{ left: x, top: y }} onPointerDown={e => e.stopPropagation()}>
      <span className="num-input">
        <input
          ref={input}
          inputMode="decimal"
          aria-label="Wall length in millimetres"
          className={bad ? 'invalid' : undefined}
          aria-invalid={bad ? true : undefined}
          aria-describedby={bad || (reading.ok && reading.said) ? hintId : undefined}
          value={text}
          onChange={e => {
            setText(e.target.value)
            setTried(false)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              if (keep()) close()
              else setTried(true)
            }
            if (e.key === 'Escape') {
              // Esc here only shuts the box: the wall stays selected.
              e.stopPropagation()
              close()
            }
          }}
          // Clicking away keeps a length that can be used, as leaving a number box does; one that can't is dropped.
          onBlur={() => {
            if (done.current) return
            keep()
            close()
          }}
        />
        <em>mm</em>
      </span>
      {reading.ok && reading.said && (
        <small id={hintId} className="num-hint">
          {reading.said}
        </small>
      )}
      {bad && (
        <small id={hintId} className="num-hint bad" role="alert">
          {reading.hint}
        </small>
      )}
    </div>
  )
}
