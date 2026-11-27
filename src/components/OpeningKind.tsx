// The kind of door or window (hinged, sliding, bifold, awning…): picked on the Door and Window
// tools' cards for the next one, and on a door's or window's own card. The kinds are in
// src/plan/openingStyles.ts.

import type { Opening, OpeningKind } from '../plan/model'
import { openingStyle, setOpeningStyle, styleSize, stylesFor, type OpeningStyle } from '../plan/openingStyles'
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
