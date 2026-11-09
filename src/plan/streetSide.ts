// Which side of the block faces the street: one setting, kept with the plan as the checks' front
// edge (plan.checks.frontEdge). The checks measure the front setback from it, and the 3D view's
// Street view looks from it. It used to be two: the 3D view kept its own N/E/S/W on this device
// only, which older projects may still have (migrateStoredStreetSide brings it across once).

import type { Vec2 } from '../lib/geom'
import type { SavedProject } from '../lib/storage'
import { loadStreetSide, projectKey, saveStreetSide, streetBearing, type StreetSide } from '../phone/camera'
import { checkSettingsOf } from '../checks/councils'
import type { Plan } from './model'
import { usePlan } from './store'

export type Compass = 'N' | 'E' | 'S' | 'W'
const BEARING: Record<Compass, number> = { N: 0, E: 90, S: 180, W: 270 }

/** The bearing (degrees from north) straight out of each side of the block, by its index; null for a side with no length. */
export function edgeBearings(boundary: Vec2[]): (number | null)[] {
  let area = 0
  boundary.forEach(([x1, y1], i) => {
    const [x2, y2] = boundary[(i + 1) % boundary.length]
    area += x1 * y2 - x2 * y1
  })
  return boundary.map(([x1, y1], i) => {
    const [x2, y2] = boundary[(i + 1) % boundary.length]
    const dx = x2 - x1
    const dy = y2 - y1
    if (Math.hypot(dx, dy) < 1e-6) return null
    // Outward: to the right of the way round for an anticlockwise boundary, to the left otherwise.
    const nx = area > 0 ? dy : -dy
    const ny = area > 0 ? -dx : dx
    return ((Math.atan2(nx, ny) * 180) / Math.PI + 360) % 360
  })
}

/** The side of the block that faces most nearly `bearing`. */
export function edgeFacing(boundary: Vec2[], bearing: number): number {
  let best = 0
  let bestCos = -Infinity
  edgeBearings(boundary).forEach((b, i) => {
    if (b === null) return
    const c = Math.cos(((b - bearing) * Math.PI) / 180)
    if (c > bestCos) {
      bestCos = c
      best = i
    }
  })
  return best
}

/** The compass point a bearing is nearest. */
export const compassOf = (bearing: number): Compass => (['N', 'E', 'S', 'W'] as const)[Math.round((((bearing % 360) + 360) % 360) / 90) % 4]

/** The plan's street side, by the boundary's index, when one is set and still on the block. */
export function frontEdgeOf(plan: Plan | null, boundary: Vec2[]): number | undefined {
  const f = plan?.checks?.frontEdge
  return f !== undefined && f >= 0 && f < boundary.length ? f : undefined
}

/** The street side as the 3D view's picker shows it: a compass point, or 'auto' (the low side) when it isn't set. */
export function streetSideOf(plan: Plan | null, boundary: Vec2[]): StreetSide {
  const f = frontEdgeOf(plan, boundary)
  const b = f === undefined ? null : edgeBearings(boundary)[f]
  return b === null || b === undefined ? 'auto' : compassOf(b)
}

/** The bearing from the house towards the street: straight out of the street side, or out of the low side until one is set. */
export function streetBearingOf(plan: Plan | null, boundary: Vec2[], fallBearing: number): number {
  const f = frontEdgeOf(plan, boundary)
  const b = f === undefined ? null : edgeBearings(boundary)[f]
  return b === null || b === undefined ? streetBearing(boundary, fallBearing, 'auto') : b
}

/** The plan with its street side set to an edge (or cleared), the rear going back to the side opposite. */
export function withFrontEdge(plan: Plan, edge: number | undefined): Plan {
  return { ...plan, checks: { ...checkSettingsOf(plan.checks), frontEdge: edge, rearEdge: undefined } }
}

/** The plan with its street side set to the side facing a compass point, or cleared ('auto'). */
export function withStreetSide(plan: Plan, boundary: Vec2[], side: StreetSide): Plan {
  return withFrontEdge(plan, side === 'auto' ? undefined : edgeFacing(boundary, BEARING[side]))
}

/**
 * A plan whose street side isn't set takes the one this device's 3D view kept for the project
 * (by its id, or by its survey's key from before there were projects). Returns null when there's
 * nothing to bring across.
 */
export function migratedStreetSide(plan: Plan, boundary: Vec2[], stored: StreetSide[]): Plan | null {
  if (plan.checks?.frontEdge !== undefined) return null
  const side = stored.find(s => s !== 'auto')
  return side ? withStreetSide(plan, boundary, side) : null
}

/** Bring an older project's 3D street side across to its plan, once: no undo step, and the old setting is let go. */
export function migrateStoredStreetSide(id: string, survey: SavedProject, boundary: Vec2[]): void {
  const plan = usePlan.getState().plan
  if (!plan || plan.checks?.frontEdge !== undefined) return
  const keys = [id, projectKey(survey)]
  const next = migratedStreetSide(plan, boundary, keys.map(k => loadStreetSide(k)))
  if (!next) return
  usePlan.setState({ plan: next })
  for (const k of keys) saveStreetSide(k, 'auto')
}
