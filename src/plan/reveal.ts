// Keeping what is selected in sight. The selection's card opens over the right of the plan; when
// the thing just picked lies under it, the plan slides left by just enough to show it (DB-21).
// The fitted view already keeps clear of the card; this is for a view the person has moved.

import type { Vec2 } from '../lib/geom'
import type { Plan } from './model'
import type { Selection } from './store'

/** The points (house frame) that say where a selection is: a wall's ends, a roof's corners, a room's label. */
export function selectionPoints(plan: Plan, sel: Selection): Vec2[] {
  switch (sel.type) {
    case 'wall': {
      const w = plan.walls.find(x => x.id === sel.id)
      return w ? [w.a, w.b] : []
    }
    case 'opening': {
      const o = plan.openings.find(x => x.id === sel.id)
      const w = o && plan.walls.find(x => x.id === o.wall)
      if (!o || !w) return []
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1
      const t = o.offset / len
      return [[w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t]]
    }
    case 'room':
      return plan.rooms.filter(x => x.id === sel.id).map(x => x.at)
    case 'area':
      return plan.areas.find(x => x.id === sel.id)?.pts ?? []
    case 'roof':
      return plan.roofs.find(x => x.id === sel.id)?.pts ?? []
    case 'stair':
      return plan.stairs.filter(x => x.id === sel.id).map(x => x.at)
    case 'furniture':
      return plan.furniture.filter(x => x.id === sel.id).map(x => x.at)
    default:
      return []
  }
}

/**
 * How far to slide the plan left (px) so points at these screen x's come out from under what
 * covers the canvas's right: enough to show the rightmost with `pad` to spare, but never so far
 * that the leftmost goes under what covers the left. 0 when nothing is hidden.
 */
export function revealShift(xs: number[], width: number, covered: { l: number; r: number }, pad = 32): number {
  if (!xs.length) return 0
  const hidden = Math.max(...xs) - (width - covered.r - pad)
  if (hidden <= 0) return 0
  const spare = Math.min(...xs) - (covered.l + pad)
  return Math.max(0, Math.min(hidden, spare))
}
