// A driveway drawn as a concrete slab: the Driveway tab and the driveway checks only know areas of
// kind Driveway, so a slab named for one, or one that reaches the street side, is offered as one.

import { checkSettingsOf } from '../checks/councils'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import { areaKind, toSite, type Area, type Plan } from './model'
import { updateArea } from './ops'

/** A slab this close to the street side's boundary (m) reaches the street. */
export const STREET_NEAR = 1.5

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

/** Why a slab looks like a driveway: its name, or it reaches the street side. Null when it doesn't. */
export function driveReason(a: Area, plan: Plan, survey: Pick<Survey, 'origin' | 'boundary'>): 'name' | 'street' | null {
  if (areaKind(a) !== 'slab' || a.pts.length < 3) return null
  if (/drive/i.test(a.name)) return 'name'
  const front = checkSettingsOf(plan.checks).frontEdge
  const b = survey.boundary
  if (front === undefined || front >= b.length) return null
  const e0 = b[front]
  const e1 = b[(front + 1) % b.length]
  const near = a.pts.some(p => distToSegment(toSite(p, plan.placement, survey.origin), e0, e1) < STREET_NEAR)
  return near ? 'street' : null
}

/** The slabs that look like driveways, named ones first. */
export function driveSlabs(plan: Plan, survey: Pick<Survey, 'origin' | 'boundary'>): { area: Area; why: 'name' | 'street' }[] {
  const out = plan.areas.flatMap(a => {
    const why = driveReason(a, plan, survey)
    return why ? [{ area: a, why }] : []
  })
  return out.sort((x, y) => (x.why === y.why ? 0 : x.why === 'name' ? -1 : 1))
}

/** The plan with a slab made a driveway, its outline and name kept. */
export const asDriveway = (plan: Plan, id: string): Plan => updateArea(plan, id, { kind: 'driveway' })
