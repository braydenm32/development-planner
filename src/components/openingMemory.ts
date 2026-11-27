// The Door and Window tools remember the last size used (src/components/OpeningKind.tsx shows it on their cards).

import { stylesFor } from '../plan/openingStyles'
import { usePlan } from '../plan/store'

/**
 * The tool draws the next door or window the way the last one was left: its size, sill and kind.
 * Called after a door's or window's size or kind is changed on its card.
 */
export function rememberOpening(id: string) {
  const st = usePlan.getState()
  const o = st.plan?.openings.find(x => x.id === id)
  if (!o) return
  const style = stylesFor(o.kind).find(s => s.id === o.style)?.id
  st.setOpeningDefaults(o.kind, { width: o.width, height: o.height, sill: o.kind === 'window' ? o.sill : 0, ...(style ? { style } : {}) })
}
