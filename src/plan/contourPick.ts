// Setting a floor's level from a contour on the plan: the nearest contour line to a click, natural
// or finished, and the floor level that puts a level's floor at its RL.

import type { Vec2 } from '../lib/geom'
import { levelById, sortedLevels, type Plan } from './model'

/** A contour as a line in the survey's local frame, at one RL. */
export interface ContourLine {
  z: number
  pts: readonly (readonly number[])[]
  /** One of the finished ground's contours, not the survey's. */
  finished?: boolean
}

export interface ContourHit {
  z: number
  finished: boolean
  /** Distance from the point to the line (m). */
  dist: number
  /** The line, in the local frame, to highlight. */
  pts: Vec2[]
}

function segDist(p: Vec2, a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** The contour line nearest `p` (local frame) within `tol` metres, or null. Finished lines win a tie. */
export function nearestContour(p: Vec2, lines: readonly ContourLine[], tol: number): ContourHit | null {
  let best: ContourHit | null = null
  for (const c of lines) {
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const d = segDist(p, c.pts[i], c.pts[i + 1])
      if (d > tol) continue
      if (!best || d < best.dist - 1e-9 || (Math.abs(d - best.dist) <= 1e-9 && c.finished && !best.finished)) {
        best = { z: c.z, finished: !!c.finished, dist: d, pts: c.pts.map(q => [q[0], q[1]] as Vec2) }
      }
    }
  }
  return best
}

/** The ground floor: the level the others are measured from (height 0 above it), else the lowest. */
export function groundFloor(plan: Plan) {
  return plan.levels.find(l => Math.abs(l.elevation) < 1e-9) ?? sortedLevels(plan)[0]
}

/**
 * Put a level's floor at `rl`: for the ground floor that's the plan's FFL (every other floor moves
 * with it); for another floor, its height above the ground floor (RL − FFL). To the millimetre.
 */
export function floorFromContour(plan: Plan, levelId: string, rl: number): Plan {
  const level = levelById(plan, levelId)
  if (!level || !Number.isFinite(rl)) return plan
  const mm = (v: number) => Math.round(v * 1000) / 1000
  if (level.id === groundFloor(plan)?.id) return { ...plan, placement: { ...plan.placement, ffl: mm(rl - level.elevation) } }
  return { ...plan, levels: plan.levels.map(l => (l.id === level.id ? { ...l, elevation: mm(rl - plan.placement.ffl) } : l)) }
}
