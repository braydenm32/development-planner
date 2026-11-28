// Design › Finishes: what the outside walls and roof are clad in and their colours, the inside
// wall colour, and the floors by kind of room. Each pick is one undo step; dragging round the
// custom colour picker is one step too (the store's nudge run). The 3D button "Finishes" opens it.

import { Num, Select } from '../components/fields'
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
  clearWallFinishes,
  DEFAULT_SPLIT,
  houseLower,
  MIN_BAND,
  pickLowerFinish,
  wallsWithOwnFinish,
  band,
  type WallFinish,
  pickFloorFinish,
  pickRoofFinish,
  pickWallFinish,
  resolveFinishes,
  withFinishes,
  type Finishes,
  type Swatch,
} from './model'
import { floorRL, type Plan } from '../plan/model'
import { wallTopRL } from '../plan/roofline'
import './finishes.css'

const commit = (fn: (p: Plan) => Plan) => usePlan.getState().commit(fn)

export function Kinds<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: { id: T; label: string }[]; onPick: (v: T) => void }) {
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

/**
 * A short row of named colours and a custom one. `value` undefined marks none (the default look).
 * A drag round the custom picker changes `field` of the finishes, or runs `drag` (a wall's).
 */
export function Swatches({ label, palette, value, onPick, field, drag }: { label: string; palette: Swatch[]; value: string | undefined; onPick: (hex: string | undefined) => void; field?: keyof Finishes; drag?: { key: string; apply: (p: Plan, hex: string) => Plan } }) {
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
            onChange={e => {
              const hex = e.target.value
              if (drag) usePlan.getState().nudge(drag.key, p => drag.apply(p, hex))
              else if (field) usePlan.getState().nudge(`finish-${field}`, p => withFinishes(p, { [field]: hex }))
            }}
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
      <LowerWalls plan={plan} />
      <OwnFinishWalls plan={plan} />

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

const NO_LOWER = 'none'
const LOWER_OPTIONS: { id: WallFinish | typeof NO_LOWER; label: string }[] = [{ id: NO_LOWER, label: 'The same all the way up' }, ...WALL_FINISHES]

/** "Lower part of the walls: brick up to 1000 mm": a base in another finish all round the house. */
function LowerWalls({ plan }: { plan: Plan }) {
  const f = plan.finishes
  const lower = houseLower(f)
  // The lowest outside wall: the height has to leave some of the upper finish on every one.
  const heights = plan.walls.filter(w => w.kind === 'external').map(w => wallTopRL(plan, w) - floorRL(plan, w.level))
  const high = heights.length ? Math.min(...heights) : Infinity
  const mm = (m: number) => Math.round(m * 1000)
  return (
    <div className="tool-options finish-lower">
      <Select label="Lower part of the walls" value={lower?.walls ?? NO_LOWER} options={LOWER_OPTIONS} onChange={v => commit(p => pickLowerFinish(p, v === NO_LOWER ? undefined : v))} />
      {lower && (
        <>
          <Swatches label="Lower part colour" palette={WALL_COLOURS} value={band(lower).colour} field="lowerColour" onPick={hex => commit(p => withFinishes(p, { lowerColour: hex }))} />
          <Num
            label="Up to"
            unit="mm"
            value={f?.lowerTo ?? DEFAULT_SPLIT}
            min={MIN_BAND}
            check={v => (v > high - MIN_BAND + 1e-9 ? `Max ${mm(high - MIN_BAND)} mm: the lowest outside wall is ${mm(high)} mm high` : null)}
            onCommit={lowerTo => commit(p => withFinishes(p, { lowerTo }))}
          />
          <p className="muted small">Above each floor, on every outside wall that doesn’t have its own finish.</p>
        </>
      )}
    </div>
  )
}

/** Says how many walls have a finish of their own (set on a wall's card), with a way to put them all back. */
function OwnFinishWalls({ plan }: { plan: Plan }) {
  const n = wallsWithOwnFinish(plan).length
  if (!n) return <p className="muted small">To give one wall its own finish, or two finishes, select it on the plan.</p>
  return (
    <p className="small own-finish-walls">
      {n === 1 ? '1 wall has its own finish.' : `${n} walls have their own finish.`}{' '}
      <button type="button" className="link small" onClick={() => commit(clearWallFinishes)}>
        Set {n === 1 ? 'it' : 'them all'} back to the house finish
      </button>
    </p>
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
