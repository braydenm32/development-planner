// Which roof a click on the plan picks: anywhere inside its outline, not just the eave strip.

import { pointInPolygon, type Vec2 } from '../lib/geom'
import { closestOnSegment } from './geometry'
import type { Roof } from './model'
import { roofGeometry } from './roof'

/**
 * The roof under a point (house frame): the top one (drawn last) whose outline holds it, or
 * whose edge is within `edge` metres of it.
 */
export function roofAtPoint(roofs: Roof[], p: Vec2, edge: number): Roof | undefined {
  return [...roofs].reverse().find(r => {
    const g = roofGeometry(r)
    if (g.outline.length < 3) return false
    if (pointInPolygon(p[0], p[1], g.outline)) return true
    return g.outline.some((a, i) => closestOnSegment(p, a, g.outline[(i + 1) % g.outline.length]).dist < edge)
  })
}
