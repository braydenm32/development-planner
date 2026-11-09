// How a plan lines up with a block: whether it sits on it, and how to move it onto another
// block (a new survey, or a sketch) keeping its turn to the block and its height above ground.
// Placement itself comes from the same helpers the Place panel uses.

import { houseOutline } from '../components/planNumbers'
import { centroidOf, pointInPolygon, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { placementInfo } from '../plan/keyNumbers'
import { fflForGroundRL, floorRL, toSite, type Placement, type Plan } from '../plan/model'
import { planBounds } from '../plan/ops'
import { centredPlacement, defaultPlacement } from '../plan/placement'

export interface Site {
  survey: Survey
  terrain: Terrain
}

/** Where the plan sits on a block: all of it on the block, part of it, none of it, or nothing drawn. */
export type Fit = 'inside' | 'partly' | 'outside' | 'empty'

const middleOf = (b: NonNullable<ReturnType<typeof planBounds>>): Vec2 => [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]

/** The points that say where the house is: wall ends, and the corners of areas and roofs (house frame). */
function drawnPoints(plan: Plan): Vec2[] {
  return [...plan.walls.flatMap(w => [w.a, w.b]), ...plan.areas.flatMap(a => a.pts), ...plan.roofs.flatMap(r => r.pts)]
}

/** Whether the plan, at `placement`, sits on the block, and how far its middle is from the block's (m). */
export function fitOnBlock(plan: Plan, survey: Survey, placement: Placement = plan.placement): { fit: Fit; distance: number } {
  const b = planBounds(plan)
  const pts = drawnPoints(plan)
  if (!b || !pts.length) return { fit: 'empty', distance: 0 }
  const inside = pts.filter(p => {
    const s = toSite(p, placement, survey.origin)
    return pointInPolygon(s[0], s[1], survey.boundary)
  }).length
  const mid = toSite(middleOf(b), placement, survey.origin)
  const c = centroidOf(survey.boundary)
  return { fit: inside === pts.length ? 'inside' : inside > 0 ? 'partly' : 'outside', distance: Math.hypot(mid[0] - c[0], mid[1] - c[1]) }
}

/** Natural ground at the middle of the house, as the Place panel reads it ("Floor at ground level"). */
export function groundAtHouse(plan: Plan, site: Site, placement: Placement = plan.placement): number | null {
  const info = placementInfo(houseOutline(plan).rings, placement, site.survey, site.terrain)
  if (info) return info.centreRL
  const b = planBounds(plan)
  if (!b) return null
  const p = toSite(middleOf(b), placement, site.survey.origin)
  return site.terrain.grid.sample(p[0], p[1])
}

/** The ground under the house's outline, lowest to highest, as the Place panel shows it. */
export function groundUnder(plan: Plan, site: Site, placement: Placement = plan.placement): { min: number; max: number } | null {
  const info = placementInfo(houseOutline(plan).rings, placement, site.survey, site.terrain)
  return info ? { min: info.minRL, max: info.maxRL } : null
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

/** Move every level the plan sets as an RL (retaining walls' tops and finished ground) by `dz`, with the floor. */
export function shiftLevels(plan: Plan, dz: number): Plan {
  if (Math.abs(dz) < 1e-9 || !plan.walls.some(w => w.retain)) return plan
  const move = <T,>(v: T): T => (typeof v === 'number' ? (r3(v + dz) as T) : v)
  return {
    ...plan,
    walls: plan.walls.map(w =>
      w.retain ? { ...w, retain: { ...w.retain, top: move(w.retain.top), highLevel: move(w.retain.highLevel), lowLevel: move(w.retain.lowLevel) } } : w,
    ),
  }
}

/** Degrees in (-180, 180]. */
const turn = (deg: number) => {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return Math.round(d * 10) / 10
}

/** How far (m) a floor may sit beyond the block's own range of levels before it reads as another site's. */
const FAR_LEVEL = 3

/**
 * How high the floor sits above the ground at the house's middle on `from`, to carry to another
 * block; null when there's no old block, or the floor is so far off the ground there (more than
 * FAR_LEVEL) that it can't have been meant, so it goes to ground level instead.
 */
export function heightToKeep(plan: Plan, from: Site | null): number | null {
  const before = from ? groundAtHouse(plan, from) : null
  if (before === null) return null
  const above = floorRL(plan) - before
  return Math.abs(above) > FAR_LEVEL ? null : above
}

/**
 * The plan moved onto another block: turned square to it as it was to the old block, centred on
 * it (as Centre on block does), and with its floor the same height above the ground at its middle
 * (rounded to 50 mm, as a new plan's floor is). Levels set as RLs move with the floor. With no old
 * block to compare with, the house keeps its turn and its floor goes to ground level.
 */
export function moveOntoBlock(plan: Plan, to: Site, from: Site | null): Plan {
  const start = defaultPlacement(to.survey, to.terrain)
  const b = planBounds(plan)
  // Nothing drawn: start where a new plan would.
  if (!b) return { ...plan, placement: start }
  const rotation = from ? turn(start.rotation + plan.placement.rotation - defaultPlacement(from.survey, from.terrain).rotation) : plan.placement.rotation
  let pl = centredPlacement({ ...plan.placement, rotation }, middleOf(b), to.survey)
  const above = heightToKeep(plan, from) ?? 0
  const ground = groundAtHouse(plan, to, pl) ?? start.ffl
  pl = { ...pl, ffl: fflForGroundRL(plan, Math.round((ground + above) * 20) / 20) }
  const next = { ...plan, placement: pl }
  return shiftLevels(next, floorRL(next) - floorRL(plan))
}

/** A plan opened without a survey, set square and centred on its sketch block with its floor at ground level. */
export function placeOnSketch(plan: Plan, sketch: Site): Plan {
  return moveOntoBlock({ ...plan, placement: { ...plan.placement, rotation: 0 } }, sketch, null)
}

/** A floor that belongs to another site's levels: how far below (negative) or above this block's ground, or 0. */
export function levelsOff(floor: number, stats: { minRL: number; maxRL: number }): number {
  if (floor < stats.minRL - FAR_LEVEL) return floor - stats.minRL
  if (floor > stats.maxRL + FAR_LEVEL) return floor - stats.maxRL
  return 0
}

/**
 * Centre on block, for a plan from a file: centred as the Place panel's Centre on block does.
 * A floor level that clearly belongs to another site (more than FAR_LEVEL beyond this block's
 * levels) goes to ground level, and levels set as RLs move with it.
 */
export function centreOnBlock(plan: Plan, site: Site): Plan {
  const b = planBounds(plan)
  if (!b) return plan
  let pl = centredPlacement(plan.placement, middleOf(b), site.survey)
  const floor = floorRL(plan)
  const { minRL, maxRL } = site.terrain.stats
  const ground = groundAtHouse(plan, site, pl)
  if (ground !== null && levelsOff(floor, { minRL, maxRL })) pl = { ...pl, ffl: fflForGroundRL(plan, Math.round(ground * 20) / 20) }
  const next = { ...plan, placement: pl }
  return shiftLevels(next, floorRL(next) - floor)
}
