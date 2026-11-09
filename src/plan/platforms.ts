import type { Barrier, Platform } from '../lib/earthworks'
import type { Vec2 } from '../lib/geom'
import type { WallStrip } from '../lib/terrainMesh'
import { onNaturalGround } from './floorTypes'
import { buildingOutline, faceAround, offsetPolygon, planarFaces } from './geometry'
import {
  areaKind,
  DEFAULT_BENCH,
  earthworksOf,
  FLOOR_STRUCTURE,
  floorRL,
  isRetaining,
  levelById,
  SLAB_THICKNESS,
  sortedLevels,
  toSite,
  wallDir,
  type Earthworks,
  type Plan,
  type SideLevel,
  type Wall,
} from './model'

/** Outline of each room on the lowest level that sits on piers (or another floor that leaves the ground natural), out to the outside of its walls. */
export function pierOutlines(plan: Plan): Vec2[][] {
  const ground = sortedLevels(plan)[0]
  if (!ground) return []
  const faces = planarFaces(plan.walls.filter(w => w.level === ground.id))
  return plan.rooms
    .filter(r => r.level === ground.id && onNaturalGround(plan, r))
    .flatMap(r => {
      const f = faceAround(r.at, faces)
      return f
        ? [
            offsetPolygon(
              f.pts,
              f.thickness.map(t => -t / 2),
            ),
          ]
        : []
    })
}

/** The earthworks' names for the house's own levelled ground, so it can be told from the rest. */
export const PAD_ID = 'pad'
export const PIERS_ID = 'piers'
export const BENCH_PREFIX = 'bench:'
export const slabPlatformId = (areaId: string) => `slab:${areaId}`

/** RL of the levelled ground under the lowest floor's slab: the house pad. */
export const housePadRL = (plan: Plan) => floorRL(plan) - FLOOR_STRUCTURE

/** The RL a side of a retaining wall is levelled to. */
export const sideRL = (plan: Plan, level: SideLevel) => (level === 'pad' ? housePadRL(plan) : level)

/**
 * The level ground beside one face of a retaining wall, in the house frame: from the wall's
 * centreline out past its face by `bench`, along its whole length.
 */
export function benchRing(w: Pick<Wall, 'a' | 'b' | 'thickness'>, side: 'left' | 'right', bench: number): Vec2[] {
  const d = wallDir(w)
  const s = side === 'left' ? 1 : -1
  const n: Vec2 = [-d[1] * s, d[0] * s]
  const out = w.thickness / 2 + bench
  const at = (p: Vec2, o: number): Vec2 => [p[0] + n[0] * o, p[1] + n[1] * o]
  const ring = [at(w.a, 0), at(w.b, 0), at(w.b, out), at(w.a, out)]
  // Counter-clockwise, like the other outlines.
  return side === 'left' ? ring : ring.reverse()
}

/** Level ground beside retaining walls that have a level set for a side, in the survey's local frame. */
export function retainingBenches(plan: Plan, origin: Vec2): Platform[] {
  const out: Platform[] = []
  for (const w of plan.walls) {
    const r = w.retain
    if (!isRetaining(w) || !r) continue
    const low = r.high === 'left' ? 'right' : 'left'
    for (const [side, level, bench] of [
      [r.high, r.highLevel, r.highBench],
      [low, r.lowLevel, r.lowBench],
    ] as const) {
      if (level === undefined) continue
      out.push({
        id: `${BENCH_PREFIX}${w.id}:${side}`,
        include: [benchRing(w, side, Math.max(bench ?? DEFAULT_BENCH, MIN_BENCH)).map(p => toSite(p, plan.placement, origin))],
        exclude: [],
        level: sideRL(plan, level),
        fill: true,
        margin: 0,
        // The house pad wins where they meet; a bench at the pad follows the floor when it's balanced.
        soft: true,
        fixed: level !== 'pad',
      })
    }
  }
  return out
}

/** Narrowest level ground beside a retaining wall (m): enough to measure the wall's height on it. */
export const MIN_BENCH = 0.5

/**
 * The ground to level for the house: under slab-on-ground floors and concrete slabs,
 * plus enough clearance under floors on piers, and beside retaining walls given a level.
 * In the survey's local frame.
 */
export function earthworksPlatforms(plan: Plan, origin: Vec2): Platform[] {
  const pl = plan.placement
  const ew = earthworksOf(plan)
  const site = (ring: Vec2[]) => ring.map(p => toSite(p, pl, origin))
  const out: Platform[] = []
  const ground = sortedLevels(plan)[0]
  if (ground) {
    const floor = floorRL(plan, ground.id)
    const outlines = buildingOutline(planarFaces(plan.walls.filter(w => w.level === ground.id))).outlines
    const piers = pierOutlines(plan)
    if (outlines.length) {
      out.push({ id: PAD_ID, include: outlines.map(site), exclude: piers.map(site), level: floor - FLOOR_STRUCTURE, fill: true })
    }
    if (piers.length) {
      out.push({ id: PIERS_ID, include: piers.map(site), exclude: [], level: floor - FLOOR_STRUCTURE - ew.subfloor, fill: false })
    }
  }
  for (const a of plan.areas) {
    if (areaKind(a) !== 'slab' || a.pts.length < 3) continue
    const lv = levelById(plan, a.level)
    if (!lv) continue
    out.push({ id: slabPlatformId(a.id), include: [site(a.pts)], exclude: [], level: floorRL(plan, lv.id) + (a.top ?? 0) - SLAB_THICKNESS, fill: true })
  }
  out.push(...retainingBenches(plan, origin))
  return out
}

/** What a floor on piers does to the ground, in words; the gap is the one earthworksPlatforms cuts to. */
export function piersGroundNote(ew: Earthworks): string {
  return `A floor on piers leaves the ground as it is, except where it's less than ${Math.round(ew.subfloor * 1000)} mm under the floor framing; that ground is cut back to leave room underneath.`
}

/** Retaining walls, as lines in the survey's local frame that cut and fill stops at. */
export function earthworksBarriers(plan: Plan, origin: Vec2): Barrier[] {
  return plan.walls.filter(isRetaining).map(w => [toSite(w.a, plan.placement, origin), toSite(w.b, plan.placement, origin)])
}

/** Retaining walls' footprints in the survey's local frame, so the 3D ground keeps each wall's step inside it. */
export function retainingStrips(plan: Plan, origin: Vec2): WallStrip[] {
  return plan.walls.filter(isRetaining).map(w => ({ a: toSite(w.a, plan.placement, origin), b: toSite(w.b, plan.placement, origin), half: w.thickness / 2 }))
}
