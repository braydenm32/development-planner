import { useState } from 'react'

const CHOICES: { id: string; label: string; bearing: number | null }[] = [
  { id: 'house', label: 'Square to the house', bearing: null },
  { id: 'n', label: 'North', bearing: 0 },
  { id: 'e', label: 'East', bearing: 90 },
  { id: 's', label: 'South', bearing: 180 },
  { id: 'w', label: 'West', bearing: 270 },
]

/** Picks what sits at the top of the view: square to the house, a compass point, or any bearing. */
export function OrientationControl({ value, onChange }: { value: 'house' | number; onChange: (v: 'house' | number) => void }) {
  const preset = CHOICES.find(c => (c.bearing === null ? value === 'house' : value === c.bearing))
  const [custom, setCustom] = useState(!preset)
  // While the bearing box has focus it shows what is typed; otherwise the current bearing.
  const shown = typeof value === 'number' ? String(value) : '0'
  const [editing, setEditing] = useState<string | null>(null)

  const commit = () => {
    const n = parseFloat(editing ?? '')
    setEditing(null)
    if (!Number.isFinite(n)) return
    onChange(Math.round((((n % 360) + 360) % 360) * 10) / 10)
  }

  return (
    <div className="orientation">
      <label>
        <span>Top of view</span>
        <select
          value={custom ? 'custom' : (preset?.id ?? 'custom')}
          onChange={e => {
            const c = CHOICES.find(x => x.id === e.target.value)
            if (c) {
              setCustom(false)
              onChange(c.bearing === null ? 'house' : c.bearing)
            } else setCustom(true)
          }}
        >
          {CHOICES.map(c => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
          <option value="custom">Another bearing…</option>
        </select>
      </label>
      {custom && (
        <label className="bearing">
          <span>Bearing</span>
          <input
            inputMode="decimal"
            value={editing ?? shown}
            onFocus={() => setEditing(shown)}
            onChange={e => setEditing(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          <em>°</em>
        </label>
      )}
    </div>
  )
}
