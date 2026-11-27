import { useEffect, useId, useRef, useState } from 'react'
import { Termed } from '../guide/Term'
import { announce, typedWords } from '../a11y/announce'
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

/** What takes focus when Esc leaves a box: the nearest form, panel or dialog round it that can hold focus. */
export function escOwner(box: Element): HTMLElement | null {
  const owner = box.parentElement?.closest<HTMLElement>('[data-esc-owner], [role="dialog"], .tab-panel')
  if (owner && owner.tabIndex < 0 && !owner.hasAttribute('tabindex')) owner.tabIndex = -1
  return owner ?? null
}

interface NumProps {
  label: string
  /** Value in metres (or degrees / RL when unit is not mm). */
  value: number
  unit: NumUnit
  onCommit: (v: number) => void
  min?: number
  max?: number
  /** Why a value in range still can't be used ("Must be above the bottom, RL 100.00"), or null: shown in red like the range. */
  check?: (v: number) => string | null
  /** The value is already in the unit shown (no metres to mm), shown to at most this many decimals. */
  decimals?: number
  /** Rewrites what was typed before it is read, for a box that takes more than one way of writing a value ("33.9 S", "-33.9"). */
  tidy?: (typed: string) => string
  /** The range in words, said instead of "Max 44 °" when the value is outside it. */
  range?: string
}

/**
 * A number box that commits on Enter (focus stays in it) or when it loses focus. Shows mm for lengths,
 * where a bare number is mm and "0.9" or "9m" are metres (said back as "= 900 mm" while typing). A value
 * that can't be used stays in the box, in red with a reason, until it's fixed or Esc puts the old one back.
 */
export function Num({ label, value, unit, onCommit, min, max, check, decimals, tidy, range }: NumProps) {
  const exact = decimals !== undefined
  const show = (v: number) =>
    exact
      ? String(Number(v.toFixed(decimals)))
      : unit === 'mm'
        ? Math.round(v * 1000).toString()
        : unit === '°'
          ? v.toFixed(1)
          : v.toFixed(2)
  const shown = show(value)
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
  const read = (typed: string) => {
    const r = readNumber(tidy ? tidy(typed) : typed, unit, exact, min, max, check)
    return !r.ok && range && /^(Min|Max) /.test(r.hint) ? { ok: false as const, hint: range } : r
  }
  const reading = editing === null ? null : read(editing)
  // A box still being typed in only says what it will do; once it's left (or Enter is pressed), a bad value is flagged.
  const bad = reading && !reading.ok && (!focused || tried)
  /** Keep what was typed, if it can be used. */
  const keep = (): boolean => {
    // Left as it was shown: nothing to read, and a value already out of range isn't flagged for a visit.
    if (editing === null || editing === shown) {
      setEditing(null)
      return true
    }
    const r = read(editing)
    // Unusable: keep the text and the reason showing.
    if (!r.ok) return false
    setEditing(null)
    if (Math.abs(r.value - value) > 1e-9) {
      onCommit(r.value)
      // The box shows the new value, but a screen reader isn't told the change was kept.
      announce(typedWords(label, show(r.value), unit))
    }
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
              const box = e.target as HTMLInputElement
              // Out of the box to what it belongs to (a form, the Selection panel), never to the page itself.
              const owner = escOwner(box)
              if (owner) owner.focus()
              else box.blur()
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

/** `selectOn`: when it changes to something other than 0, the box takes the cursor with its text selected. */
export function TextField({ label, value, onCommit, selectOn = 0 }: { label: string; value: string; onCommit: (v: string) => void; selectOn?: number }) {
  const [editing, setEditing] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!selectOn) return
    input.current?.focus()
    input.current?.select()
  }, [selectOn])
  return (
    <label className="num">
      <span>
        <Termed text={label} />
      </span>
      <input
        ref={input}
        className="text"
        // Nothing typed yet: Undo here is the app's, not the box's own (src/nav/keys.ts).
        data-settled={settled(editing, value)}
        value={editing ?? value}
        onChange={e => setEditing(e.target.value)}
        onBlur={() => {
          const t = editing?.trim()
          setEditing(null)
          if (t && t !== value) onCommit(t)
        }}
        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  )
}
