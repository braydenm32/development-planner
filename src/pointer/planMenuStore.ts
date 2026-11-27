// The plan's right-click menu: what is open, and opening it (src/pointer/PlanMenu.tsx draws it).

import { create } from 'zustand'
import type { Vec2 } from '../lib/geom'
import { selectedList } from '../plan/editing'
import { usePlan, type Selection } from '../plan/store'
import { menuItems, type MenuItem } from './menuItems'

export interface Open {
  /** Where it opens, in pixels from the plan's top left. */
  x: number
  y: number
  items: MenuItem[]
}

export const usePlanMenu = create<{ open: Open | null }>(() => ({ open: null }))
export const closePlanMenu = () => usePlanMenu.setState({ open: null })

/**
 * Open the menu at a point on the plan. `hit` is what's under it (null on bare ground, or with a
 * drawing tool): it becomes the selection, unless it's one of several things already picked,
 * which then stay picked so the menu acts on them all.
 */
export function openPlanMenu(hit: Selection | null, px: Vec2, at: Vec2) {
  const st = usePlan.getState()
  if (!st.plan) return
  if (st.tool === 'select') {
    const picked = selectedList(st)
    if (!hit) st.select(null)
    else if (!picked.some(s => s.type === hit.type && s.id === hit.id)) st.select(hit)
  }
  const now = usePlan.getState()
  const items = menuItems({ plan: now.plan!, sels: now.tool === 'select' ? selectedList(now) : [], tool: now.tool, at })
  usePlanMenu.setState({ open: items.length ? { x: px[0], y: px[1], items } : null })
}
