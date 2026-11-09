// Keeps the route's level and selection and the plan store in step, so reload and Back
// restore what was being drawn on and what was selected.
//   route → store: once the plan loads, and whenever Back, Forward or a typed link changes them
//   store → route: replaceState as the level or selection changes (no new history entry)

import { useEffect, useRef } from 'react'
import { navigate, useRouter } from '../nav/router'
import { usePlan } from '../plan/store'
import { findSelection } from './selection'

export function useRouteSync() {
  const route = useRouter(s => s.route)
  const loaded = usePlan(s => !!s.plan)
  // Until the route has been applied to a freshly loaded plan, the store's defaults mustn't overwrite it.
  const applied = useRef(false)

  useEffect(() => {
    if (!loaded) {
      applied.current = false
      return
    }
    if (route.kind !== 'app') return
    const st = usePlan.getState()
    const plan = st.plan!
    const found = route.sel ? findSelection(plan, route.sel) : null
    const level = found?.level ?? (route.level && plan.levels.some(l => l.id === route.level) ? route.level : st.activeLevel)
    if (level !== st.activeLevel) st.setActiveLevel(level)
    if ((usePlan.getState().selection?.id ?? null) !== (found?.sel.id ?? null)) st.select(found?.sel ?? null)
    applied.current = true
    // Tidy the address: the level always shows, and a level or selection the plan doesn't have drops out.
    const s = usePlan.getState()
    if (route.level !== s.activeLevel || route.sel !== s.selection?.id) navigate({ ...route, level: s.activeLevel, sel: s.selection?.id }, { replace: true })
  }, [route, loaded])

  useEffect(
    () =>
      usePlan.subscribe((s, prev) => {
        if (!applied.current || !s.plan) return
        if (s.activeLevel === prev.activeLevel && s.selection === prev.selection) return
        const r = useRouter.getState().route
        if (r.kind !== 'app') return
        if (r.level === s.activeLevel && r.sel === s.selection?.id) return
        navigate({ ...r, level: s.activeLevel, sel: s.selection?.id }, { replace: true })
      }),
    [],
  )
}
