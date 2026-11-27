import { useEffect, useId, useRef, useState } from 'react'
import { Termed } from '../guide/Term'
import './editing.css'
import { settled } from './fieldKeys'
import { readNumber, type NumUnit } from './readNumber'

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <label className="num">
      <span>
        <Termed text={label} />
      </span>
      <select
        value={String(value)}
        onChange={e => {
          const o = options.find(x => String(x.id) === e.target.value)
          if (o) onChange(o.id)
        }}
      >
        {options.map(o => (
          <option key={String(o.id)} value={String(o.id)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

interface NumProps {
  label: string
  /** Value in metres (or degrees / RL when unit is not mm). */
  value: number
  unit: NumUnit
  onCommit: (v: number) => void
  min?: number
  max?: number
  /** The value is already in the unit shown (no metres to mm), shown to at most this many decimals. */
  decimals?: number
}

/**
 * A number box that commits on Enter (focus stays in it) or when it loses focus. Shows mm for lengths, where "0.9" or
 * "0.9m" mean 900 mm. A value that can't be used stays in the box, in red with a reason, until it's
 * fixed or Esc puts the old one back.
 */
export function Num({ label, value, unit, onCommit, min, max, decimals }: NumProps) {
  const exact = decimals !== undefined
  const shown = exact
    ? String(Number(value.toFixed(decimals)))
    : unit === 'mm'
      ? Math.round(value * 1000).toString()
      : unit === '°'
        ? value.toFixed(1)
        : value.toFixed(2)
  // Once something is typed, the box shows that; until then the current value, so an Undo made
  // from the box shows in it, and leaving it untouched changes nothing.
  const [editing, setEditing] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  // Enter was pressed on a value that can't be used: it's flagged though the box still has focus.
  const [tried, setTried] = useState(false)
  const cancelled = useRef(false)
  // The box to select the text of once Enter's value has been drawn.
  const kept = useRef<HTMLInputElement | null>(null)
  const hintId = useId()
  const reading = editing === null ? null : readNumber(editing, unit, exact, min, max)
  // A box still being typed in only says what it will do; once it's left (or Enter is pressed), a bad value is flagged.
  const bad = reading && !reading.ok && (!focused || tried)
  /** Keep what was typed, if it can be used. */
  const keep = (): boolean => {
    if (editing === null) return true
    const r = readNumber(editing, unit, exact, min, max)
    // Unusable: keep the text and the reason showing.
    if (!r.ok) return false
    setEditing(null)
    if (Math.abs(r.value - value) > 1e-9) onCommit(r.value)
    return true
  }
  const commit = () => {
    setFocused(false)
    setTried(false)
    if (cancelled.current) {
      cancelled.current = false
      setEditing(null)
      return
    }
    keep()
  }
  // Enter keeps the value and stays in the box, its text selected ready for the next one.
  useEffect(() => {
    if (!kept.current) return
    kept.current.select()
    kept.current = null
  })
  return (
    <label className="num">
      <span>
        <Termed text={label} />
      </span>
      <span className="num-input">
        {unit === 'RL' && <em>RL</em>}
        <input
          inputMode="decimal"
          className={bad ? 'invalid' : undefined}
          aria-invalid={bad ? true : undefined}
          aria-describedby={reading && (reading.ok ? reading.said : bad) ? hintId : undefined}
          value={editing ?? shown}
          onFocus={() => setFocused(true)}
          // Nothing typed since the value was kept: Undo here is the app's, not the box's own (src/nav/keys.ts).
          data-settled={settled(editing, shown)}
          onChange={e => {
            setEditing(e.target.value)
            setTried(false)
          }}
          onBlur={commit}
          onKeyDown={e => {
            // Focus stays put, so the next key typed goes in the box and never picks a tool.
            if (e.key === 'Enter') {
              if (keep()) kept.current = e.target as HTMLInputElement
              else setTried(true)
            }
            if (e.key === 'Escape') {
              cancelled.current = true
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        {unit !== 'RL' && <em>{unit}</em>}
      </span>
      {reading && reading.ok && reading.said && (
        <small id={hintId} className="num-hint">
          {reading.said}
        </small>
      )}
      {bad && (
        <small id={hintId} className="num-hint bad" role="alert">
          {reading.hint}
        </small>
      )}
    </label>
  )
}

export function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <label className="num">
      <span>
        <Termed text={label} />
      </span>
      <input
        className="text"
        value={editing ?? value}
        onChange={e => setEditing(e.target.value)}
        onBlur={() => {
          const t = editing?.trim()
          setEditing(null)
          if (t && t !== value) onCommit(t)
        }}
        // Nothing typed yet: Undo here is the app's, not the box's own (src/nav/keys.ts).
        data-settled={settled(editing, value)}
        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  )
}
