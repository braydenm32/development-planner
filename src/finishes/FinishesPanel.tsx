// Design › Finishes: what the outside walls and roof are clad in and their colours, the inside
// wall colour, and the floors by kind of room. Each pick is one undo step; dragging round the
// custom colour picker is one step too (the store's nudge run). The 3D button "Finishes" opens it.

import { Select } from '../components/fields'
import { usePlan } from '../plan/store'
import { navigate, useRouter } from '../nav/router'
import { tabRoute } from '../nav/route'
import { Icon } from '../nav/icons'
import { useLoaded } from '../shell/useSite'
import { Waiting } from '../shell/tabs/Waiting'
import {
  FLOOR_FINISHES,
  FLOOR_ZONES,
  INSIDE_COLOURS,
  ROOF_COLOURS,
  ROOF_FINISHES,
  WALL_COLOURS,
  WALL_FINISHES,
  colourName,
  pickFloorFinish,
  pickRoofFinish,
  pickWallFinish,
  resolveFinishes,
  withFinishes,
  type Finishes,
  type Swatch,
} from './model'
import type { Plan } from '../plan/model'
import './finishes.css'

const commit = (fn: (p: Plan) => Plan) => usePlan.getState().commit(fn)

function Kinds<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: { id: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="segmented finish-kinds" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onPick(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A short row of named colours and a custom one. `value` undefined marks none (the default look). */
function Swatches({ label, palette, value, onPick, field }: { label: string; palette: Swatch[]; value: string | undefined; onPick: (hex: string | undefined) => void; field: keyof Finishes }) {
  const custom = !!value && !palette.some(s => s.hex === value)
  return (
    <div className="finish-colours">
      <div className="swatches" role="radiogroup" aria-label={label}>
        {palette.map(s => (
          <button
            key={s.hex}
            type="button"
            role="radio"
            aria-checked={value === s.hex}
            aria-label={s.name}
            title={s.name}
            className={`swatch${value === s.hex ? ' on' : ''}`}
            style={{ background: s.hex }}
            onClick={() => onPick(s.hex)}
          />
        ))}
        <label className={`swatch custom${custom ? ' on' : ''}`} title="Pick any colour">
          <input
            type="color"
            aria-label={`${label}: custom colour`}
            value={value ?? palette[0].hex}
            // A drag round the picker sends many changes: they make one undo step.
            onChange={e => usePlan.getState().nudge(`finish-${field}`, p => withFinishes(p, { [field]: e.target.value }))}
          />
          <span aria-hidden="true" style={custom ? { background: value } : undefined}>
            <Icon name="plus" size={14} />
          </span>
        </label>
      </div>
      <span className="muted small">{value ? colourName(value, palette) : 'Plain'}</span>
    </div>
  )
}

export function FinishesPanel({ plan }: { plan: Plan }) {
  const r = resolveFinishes(plan.finishes)
  const f = plan.finishes
  return (
    <div className="finishes">
      <p className="muted small">Finishes change only the picture: the drawings, numbers and costs stay as they are.</p>

      <h3>Outside walls</h3>
      <Kinds label="Outside wall finish" value={r.walls} options={WALL_FINISHES} onPick={k => commit(p => pickWallFinish(p, k))} />
      <Swatches label="Outside wall colour" palette={WALL_COLOURS} value={r.wallColour} field="wallColour" onPick={hex => commit(p => withFinishes(p, { wallColour: hex }))} />

      <h3>Roof</h3>
      <Kinds label="Roof finish" value={r.roof} options={ROOF_FINISHES} onPick={k => commit(p => pickRoofFinish(p, k))} />
      <Swatches label="Roof colour" palette={ROOF_COLOURS} value={r.roofColour} field="roofColour" onPick={hex => commit(p => withFinishes(p, { roofColour: hex }))} />

      <h3>Inside walls</h3>
      <Swatches label="Inside wall colour" palette={INSIDE_COLOURS} value={f?.insideColour} field="insideColour" onPick={hex => commit(p => withFinishes(p, { insideColour: hex }))} />
      {f?.insideColour && (
        <button type="button" className="link small" onClick={() => commit(p => withFinishes(p, { insideColour: undefined }))}>
          Back to plain
        </button>
      )}

      <h3>Floors</h3>
      <p className="muted small">Seen from inside: turn the roof off under Show in 3D.</p>
      <div className="tool-options">
        {FLOOR_ZONES.map(z => (
          <Select key={z.id} label={z.label} value={r.floors[z.id]} options={FLOOR_FINISHES} onChange={v => commit(p => pickFloorFinish(p, z.id, v))} />
        ))}
      </div>
    </div>
  )
}

export function FinishesTab() {
  const d = useLoaded()
  return d ? <FinishesPanel plan={d.plan} /> : <Waiting />
}

/** On the 3D view's bar: opens Design › Finishes beside the 3D. */
export function FinishesButton({ phone }: { phone: boolean }) {
  const open = useRouter(s => s.route.kind === 'app' && s.route.area === 'design' && s.route.tab === 'finishes')
  return (
    <button
      type="button"
      className={`preset-done show-button finishes-button${open ? ' on' : ''}`}
      aria-label={phone ? 'Finishes' : undefined}
      aria-pressed={open}
      title="Wall cladding, roof and colours in 3D (Design › Finishes)"
      onClick={() => {
        const r = useRouter.getState().route
        navigate({ ...tabRoute(r, 'design', 'finishes'), view: '3d' })
      }}
    >
      <Icon name="swatch" size={17} />
      {!phone && <span>Finishes</span>}
    </button>
  )
}
