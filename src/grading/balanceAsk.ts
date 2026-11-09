// Balance asks first: the strip's Balance, ⌘K and the Overview open Earthworks › Cut & fill with
// Balance's preview showing what would move, and only its own button moves the floor.

import { create } from 'zustand'
import { tabRoute } from '../nav/route'
import { navigate, useRouter } from '../nav/router'
import { usePlan } from '../plan/store'

export const useBalanceAsk = create<{ open: boolean }>(() => ({ open: false }))

/** Open Cut & fill on the plan with Balance's preview. */
export function askBalance() {
  const r = useRouter.getState().route
  if (!(r.kind === 'app' && r.area === 'earthworks' && r.tab === 'cut-fill' && r.view === 'plan')) navigate({ ...tabRoute(r, 'earthworks', 'cut-fill'), view: 'plan' })
  useBalanceAsk.setState({ open: true })
}

export const closeBalance = () => useBalanceAsk.setState({ open: false })

// Another plan (or an undo) makes the preview stale: it goes.
usePlan.subscribe((s, prev) => {
  if (s.plan !== prev.plan && useBalanceAsk.getState().open) closeBalance()
})
