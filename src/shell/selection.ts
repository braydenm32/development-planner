import type { Plan } from '../plan/model'
import type { Selection } from '../plan/store'

/** The item with this id, as a selection, and the level it is on; null if the plan has no such item. */
export function findSelection(plan: Plan, id: string): { sel: Selection; level: string } | null {
  const lists = [
    ['wall', plan.walls],
    ['room', plan.rooms],
    ['area', plan.areas],
    ['roof', plan.roofs],
    ['stair', plan.stairs],
    ['furniture', plan.furniture],
  ] as const
  for (const [type, items] of lists) {
    const item = (items as readonly { id: string; level: string }[]).find(x => x.id === id)
    if (item) return { sel: { type, id }, level: item.level }
  }
  const o = plan.openings.find(x => x.id === id)
  const w = o && plan.walls.find(x => x.id === o.wall)
  return o && w ? { sel: { type: 'opening', id }, level: w.level } : null
}
