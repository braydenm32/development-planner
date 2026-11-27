// The kind of door or window (hinged, sliding, bifold, awning…): picked on the Door and Window
// tools' cards for the next one, and on a door's or window's own card. The kinds are in
// src/plan/openingStyles.ts.

import { onOutsideWall } from '../basix/basix'
import type { Opening, OpeningKind, Plan } from '../plan/model'
import { updateOpening } from '../plan/ops'
import { isGlassDoor, openingStyle, setOpeningStyle, styleSize, stylesFor, type OpeningStyle } from '../plan/openingStyles'
import { usePlan } from '../plan/store'
import { Select } from './fields'
import { rememberOpening } from './openingMemory'

/** The list's line for a window that isn't said to be any kind (every window drawn before kinds). */
const NOT_SET = ''

const choices = (kind: OpeningKind) => [...(kind === 'window' ? [{ id: NOT_SET, label: 'Not set' }] : []), ...stylesFor(kind).map(s => ({ id: s.id as string, label: s.label }))]
const label = (kind: OpeningKind) => (kind === 'window' ? 'Kind of window' : 'Kind of door')

/** On the Door or Window tool's card: the kind the next one is, which also sets its usual size. */
export function ToolOpeningKind({ kind }: { kind: OpeningKind }) {
  const defaults = usePlan(s => s.openingDefaults[kind])
  if (!stylesFor(kind).length) return null
  const now = openingStyle({ kind, style: defaults.style })
  return (
    <Select
      label={label(kind)}
      value={now ?? NOT_SET}
      options={choices(kind)}
      onChange={id => {
        const style = stylesFor(kind).find(s => s.id === id)?.id
        const size = styleSize(kind, style)
        if (size) usePlan.getState().setOpeningDefaults(kind, { ...size, ...(style ? { style } : {}) })
      }}
    />
  )
}

/** On a door's or window's card: its kind. Changing it is one undo step, and the tool draws the next one the same. */
export function OpeningKindField({ opening: o }: { opening: Opening }) {
  if (!stylesFor(o.kind).length) return null
  return (
    <Select
      label={label(o.kind)}
      value={openingStyle(o) ?? NOT_SET}
      options={choices(o.kind)}
      onChange={id => {
        usePlan.getState().commit(p => setOpeningStyle(p, o.id, (id || undefined) as OpeningStyle | undefined))
        rememberOpening(o.id)
      }}
    />
  )
}

/**
 * On a door's or garage door's card, in an outside wall: whether it's glass, so its width × height
 * counts in the BASIX glazing. Unset goes by its kind (sliding, bifold and double doors are glass);
 * a tick is the person's own and stays when the kind changes. Inside the house a door never counts,
 * so the tick isn't shown there.
 */
export function GlassDoorField({ plan, opening: o }: { plan: Plan; opening: Opening }) {
  if ((o.kind !== 'door' && o.kind !== 'garage') || !onOutsideWall(plan, o.id)) return null
  const on = isGlassDoor(o)
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={on} onChange={e => usePlan.getState().commit(p => updateOpening(p, o.id, { glazed: e.target.checked }))} />
        Glass door (counts as glazing)
      </label>
      <p className="muted small">{on ? `Its ${(o.width * o.height).toFixed(2)} m² counts towards the glass area under Approvals › BASIX.` : 'Tick it if this door is mostly glass: it then counts towards the glass area under Approvals › BASIX.'}</p>
    </>
  )
}
