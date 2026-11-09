// The live section strip's arithmetic, kept apart from React so it can be tested: where its cut
// runs by default, how a cut on the plan maps onto the strip so the two line up, which levels and
// roofs it shows, and what dragging a level band or a roof's eaves does to the plan.

import type { Vec2 } from '../lib/geom'
import { houseWalls, levelById, sortedLevels, type Plan, type Roof } from '../plan/model'
import { setLevelRL } from '../plan/ops'
import { ceilingRL, matchRoofline, roofEavesRL, roofName, setEavesRL } from '../plan/roofline'
import { roofGeometry } from '../plan/roof'
import { stairJoins } from '../plan/stairs'
import { roofProfile, type SectionDrawing } from '../sections/section'
import type { Cut } from './store'

/** How far past the block's boundary the default cut reaches (m), so the boundary shows in the strip. */
const PAST_BOUNDARY = 1.5

/** Where segment-free line p + t·d crosses the edges of a ring, as values of t. */
function lineCrossings(p: Vec2, d: Vec2, ring: Vec2[]): number[] {
  const ts: number[] = []
  for (let i = 0; i < ring.length; i++) {
    const q = ring[i]
    const r = ring[(i + 1) % ring.length]
    const ex = r[0] - q[0]
    const ey = r[1] - q[1]
    const den = d[0] * ey - d[1] * ex
    if (Math.abs(den) < 1e-12) continue
    const t = ((q[0] - p[0]) * ey - (q[1] - p[1]) * ex) / den
    const u = ((q[0] - p[0]) * d[1] - (q[1] - p[1]) * d[0]) / den
    if (u >= -1e-9 && u <= 1 + 1e-9) ts.push(t)
  }
  return ts
}

/**
 * The cut the strip starts with: through the middle of the house, along its long side, reaching a
 * little past the block's boundary at both ends. Without a house yet, across the middle of the
 * block. `boundary` is the block in the house frame.
 */
export function defaultCut(plan: Plan, boundary: Vec2[]): Cut {
  const walls = houseWalls(plan.walls)
  const pts = walls.length ? walls.flatMap(w => [w.a, w.b]) : boundary
  if (!pts.length) return { a: [-10, 0], b: [10, 0] }
  const xs = pts.map(p => p[0])
  const ys = pts.map(p => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const c: Vec2 = [(x0 + x1) / 2, (y0 + y1) / 2]
  const along = x1 - x0 >= y1 - y0
  const d: Vec2 = along ? [1, 0] : [0, 1]
  const half = (along ? x1 - x0 : y1 - y0) / 2
  const ts = boundary.length >= 3 ? lineCrossings(c, d, boundary) : []
  const t0 = Math.min(-half - 3, ...ts.map(t => t - PAST_BOUNDARY))
  const t1 = Math.max(half + 3, ...ts.map(t => t + PAST_BOUNDARY))
  const r = (n: number) => Math.round(n * 1000) / 1000
  return { a: [r(c[0] + d[0] * t0), r(c[1] + d[1] * t0)], b: [r(c[0] + d[0] * t1), r(c[1] + d[1] * t1)] }
}

/** Within this angle of level on the screen (degrees), the strip lines up with the plan. */
export const LINED_UP_DEG = 3

/** How a cut sits on the screen, and so on the strip. */
export interface StripFrame {
  /** The cut, its ends swapped if need be so it runs left to right on the screen as the strip does. */
  cut: Cut
  /** Length of the cut (m). */
  len: number
  /** Screen x of the cut's left end on the strip (px), at the plan's scale. */
  x0: number
  /** How far the cut leans off level on the screen (degrees, 0 to 90). */
  tilt: number
  /** Level enough that each thing in the strip sits right under it on the plan. */
  linedUp: boolean
}

/**
 * The strip at the plan's scale `k` (px per m): a cut that runs across the screen lines up exactly
 * with the plan above it; one at an angle is centred under the cut's middle, at the same scale.
 */
export function stripFrame(cut: Cut, S: (p: Vec2) => Vec2, k: number): StripFrame {
  let pa = S(cut.a)
  let pb = S(cut.b)
  let c = cut
  if (pb[0] < pa[0]) {
    c = { a: cut.b, b: cut.a }
    ;[pa, pb] = [pb, pa]
  }
  const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1])
  const tilt = (Math.atan2(Math.abs(pb[1] - pa[1]), Math.abs(pb[0] - pa[0])) * 180) / Math.PI
  const mid = (pa[0] + pb[0]) / 2
  return { cut: c, len, x0: mid - (len * k) / 2, tilt, linedUp: tilt <= LINED_UP_DEG }
}

/**
 * The plan's top-of-view bearing that lays a cut level across the screen, reading left to right
 * from `a` to `b`. The house's own y axis points at bearing −rotation (see src/lib/orientation).
 */
export function bearingToLineUp(cut: Cut, rotation: number): number {
  const ang = (Math.atan2(cut.b[1] - cut.a[1], cut.b[0] - cut.a[0]) * 180) / Math.PI
  // The cut's direction as a compass bearing, then a quarter turn back: that way is up.
  const bearing = 90 - ang - rotation
  const up = bearing - 90
  return Math.round((((up % 360) + 360) % 360) * 10) / 10
}

/** A roof the cut passes through: which roof, its eaves RL and where along the strip it's cut. */
export interface RoofCut {
  id: string
  name: string
  eaves: number
  s0: number
  s1: number
}

/** The roofs the cut passes through, with where along it each is cut (m from the cut's `a`). */
export function roofCuts(plan: Plan, cut: Cut): RoofCut[] {
  const out: RoofCut[] = []
  for (const r of plan.roofs) {
    if (!levelById(plan, r.level)) continue
    const g = roofGeometry(r)
    if (g.error) continue
    const runs = roofProfile(g.mesh, cut.a, cut.b)
    if (!runs.length) continue
    const ss = runs.flat().map(p => p[0])
    out.push({ id: r.id, name: roofName(plan, r), eaves: roofEavesRL(plan, r), s0: Math.min(...ss), s1: Math.max(...ss) })
  }
  return out
}

/**
 * The heights the strip keeps in view (RLs): from a little under the lowest floor to a little over
 * the highest roof or ceiling it cuts. With no floors cut, the ground along the cut.
 */
export function heightRange(d: SectionDrawing): { lo: number; hi: number } {
  const floors = d.floors.flatMap(f => [f.rl, f.ceiling])
  const roofs = d.roofs.flat().map(p => p[1])
  if (floors.length) return { lo: Math.min(...floors) - 1.2, hi: Math.max(...floors, ...roofs) + 0.6 }
  const ground = [...d.natural.flat(), ...d.finished.flat()].map(p => p[1])
  if (ground.length) return { lo: Math.min(...ground) - 0.5, hi: Math.max(...ground) + 2 }
  return { lo: d.zMin, hi: d.zMax }
}

/**
 * The RL at the top of the strip's drawing (`h` px tall at `k` px per m). The whole range fits
 * when it can, centred; otherwise the drawing keeps `focus` (the level being drawn on) in the
 * middle without running past the range. `pan` (m) moves it up or down from there.
 */
export function topRL(range: { lo: number; hi: number }, focus: number, h: number, k: number, pan = 0): number {
  const tall = h / k
  if (range.hi - range.lo <= tall) return (range.lo + range.hi) / 2 + tall / 2 + pan
  const want = focus + tall / 2
  return Math.min(range.hi, Math.max(range.lo + tall, want)) + pan
}

/** A floor RL for a level band dragged `dy` px down from where it started, to the 10 mm. */
export function draggedRL(startRL: number, dy: number, k: number): number {
  return Math.round((startRL - dy / k) * 100) / 100
}

/** Stairs that start or arrive on a level, in words, as a drag re-counts them: "Living 43.00 → Entry 44.50 · 9 risers of 167 mm". */
export function stairsOnLevel(plan: Plan, levelId: string): string[] {
  return plan.stairs
    .filter(s => s.level === levelId || s.toLevel === levelId)
    .map(s => {
      const j = stairJoins(plan, s)
      return `${j.from} → ${j.to} · ${j.risers}`
    })
}

/** The plan with a level's floor at `rl`, as a band drag leaves it. */
export const moveLevel = (plan: Plan, levelId: string, rl: number): Plan => setLevelRL(plan, levelId, rl)

/** Something a roof's eaves line can snap to as it's dragged: another level's ceiling, or another roof's eaves. */
export interface EavesTarget {
  /** The roofline key matchRoofline takes: `level:<id>` or `roof:<id>`. */
  key: string
  rl: number
  /** "Bedrooms ceiling", "Roof over Bedrooms". */
  label: string
}

/** Where a roof's eaves can snap to: every other level's ceiling and every other roof's eaves. */
export function eavesTargets(plan: Plan, roof: Roof): EavesTarget[] {
  const out: EavesTarget[] = []
  for (const l of sortedLevels(plan)) if (l.id !== roof.level) out.push({ key: `level:${l.id}`, rl: ceilingRL(plan, l.id), label: `${l.name} ceiling` })
  for (const r of plan.roofs) if (r.id !== roof.id) out.push({ key: `roof:${r.id}`, rl: roofEavesRL(plan, r), label: `${roofName(plan, r)} roofline` })
  return out
}

/**
 * Where a dragged eaves line lands: on a target within `snapPx` on the screen (a roof wins over a
 * ceiling at the same height, since it shares a whole roof plane), its own walls, or else the
 * dragged RL to the 10 mm.
 */
export function snapEaves(plan: Plan, roof: Roof, rl: number, k: number, snapPx = 8): { rl: number; target: EavesTarget | null; own: boolean } {
  const own: EavesTarget = { key: '', rl: ceilingRL(plan, roof.level), label: 'its own walls' }
  const near = [own, ...eavesTargets(plan, roof)].filter(t => Math.abs(t.rl - rl) * k <= snapPx)
  if (!near.length) return { rl: Math.round(rl * 100) / 100, target: null, own: false }
  const off = (t: EavesTarget) => Math.abs(t.rl - rl)
  const isRoof = (t: EavesTarget) => t.key.startsWith('roof:')
  const best = near.reduce((p, q) => (off(q) < off(p) - 1e-6 || (Math.abs(off(q) - off(p)) <= 1e-6 && isRoof(q) && !isRoof(p)) ? q : p))
  return best === own ? { rl: own.rl, target: null, own: true } : { rl: best.rl, target: best, own: false }
}

/** The plan with a roof's eaves where a drag left them: matched to a target, back on its walls, or at an RL. */
export function placeEaves(plan: Plan, roofId: string, landing: { rl: number; target: EavesTarget | null; own: boolean }): Plan {
  if (landing.target) return matchRoofline(plan, roofId, landing.target.key)
  if (landing.own) return matchRoofline(plan, roofId, '')
  return setEavesRL(plan, roofId, landing.rl)
}
