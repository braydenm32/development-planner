import { useRef, useState } from 'react'
import { Termed } from '../guide/Term'

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
  unit: 'mm' | 'm' | '°' | 'RL' | 'm²' | ':1'
  onCommit: (v: number) => void
  min?: number
  max?: number
  /** The value is already in the unit shown (no metres to mm), shown to at most this many decimals. */
  decimals?: number
}

/** A number box that commits on Enter or when it loses focus. Shows mm for lengths. */
export function Num({ label, value, unit, onCommit, min, max, decimals }: NumProps) {
  const exact = decimals !== undefined
  const shown = exact
    ? String(Number(value.toFixed(decimals)))
    : unit === 'mm'
      ? Math.round(value * 1000).toString()
      : unit === '°'
        ? value.toFixed(1)
        : value.toFixed(2)
  // While the box has focus, it shows what is being typed; otherwise the current value.
  const [editing, setEditing] = useState<string | null>(null)
  const cancelled = useRef(false)
  const commit = () => {
    const text = editing
    setEditing(null)
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (text === null) return
    const n = parseFloat(text)
    if (!Number.isFinite(n)) return
    const v = unit === 'mm' && !exact ? n / 1000 : n
    if (min !== undefined && v < min) return
    if (max !== undefined && v > max) return
    if (Math.abs(v - value) > 1e-9) onCommit(v)
  }
  return (
    <label className="num">
      <span>
        <Termed text={label} />
      </span>
      <span className="num-input">
        {unit === 'RL' && <em>RL</em>}
        <input
          inputMode="decimal"
          value={editing ?? shown}
          onFocus={() => setEditing(shown)}
          onChange={e => setEditing(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              cancelled.current = true
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        {unit !== 'RL' && <em>{unit}</em>}
      </span>
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
        onFocus={() => setEditing(value)}
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
