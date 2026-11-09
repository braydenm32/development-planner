import type { Barrier, Platform } from '../lib/earthworks'
import { pointInPolygon, type Vec2 } from '../lib/geom'
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

/**
 * RL of the levelled ground under a floor's slab: the house pad. With no level given (or one that
 * isn't in the plan), the lowest floor's.
 */
export const housePadRL = (plan: Plan, levelId?: string) => floorRL(plan, levelId !== undefined && levelById(plan, levelId) ? levelId : undefined) - FLOOR_STRUCTURE

/**
 * The RL a side of a retaining wall is levelled to. 'pad' is the pad of the wall's own level, so a
 * wall beside an upper split level is levelled to that level's floor, not the lowest one's.
 */
export const sideRL = (plan: Plan, level: SideLevel, wallLevel?: string) => (level === 'pad' ? housePadRL(plan, wallLevel) : level)

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
        level: sideRL(plan, level, w.level),
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

/** How far past a retaining wall's face the house has to carry on for the wall to stand in its wall line (m). */
const PAD_STOP_DEPTH = 0.5

/**
 * Where a retaining wall stands in the house's own wall line, the pad stops at the wall. The house's
 * outline runs to the outside of its walls, so without this the strip of pad just past the wall's
 * line (the house wall's outer skin) would level the open side too, and the wall would hold nothing.
 * One strip for each such wall: from its centreline out past its face, on the side away from the house.
 */
function padStops(plan: Plan, level: string, outlines: Vec2[][]): Vec2[][] {
  const inHouse = (p: Vec2) => outlines.some(r => pointInPolygon(p[0], p[1], r))
  const out: Vec2[][] = []
  for (const w of plan.walls) {
    if (!isRetaining(w) || w.level !== level) continue
    const d = wallDir(w)
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])
    if (len < 1e-3) continue
    const reaches = (side: 'left' | 'right', reach: number) => {
      const n: Vec2 = side === 'left' ? [-d[1], d[0]] : [d[1], -d[0]]
      return [0.25, 0.5, 0.75].some(f => inHouse([w.a[0] + d[0] * len * f + n[0] * reach, w.a[1] + d[1] * len * f + n[1] * reach]))
    }
    const deep = w.thickness / 2 + PAD_STOP_DEPTH
    const left = reaches('left', deep)
    // Both sides in the house: it's inside the house, and holds nothing. Neither: it's clear of the house.
    if (left === reaches('right', deep)) continue
    const away = left ? 'right' : 'left'
    // Only where the pad does run on past the wall's line: a wall just clear of the house changes nothing.
    if (!reaches(away, 0.01)) continue
    out.push(benchRing(w, away, PAD_STOP_DEPTH))
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
      const stops = padStops(plan, ground.id, outlines)
      out.push({ id: PAD_ID, include: outlines.map(site), exclude: [...piers, ...stops].map(site), level: floor - FLOOR_STRUCTURE, fill: true })
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

/** Grid spacing (m) that cutUnderPiers reads the ground at. */
const PIER_PROBE = 0.5

/**
 * How deep the ground has to be dug out under a floor on piers inside `rings` (house frame, on
 * the lowest level) to keep the gap under its framing: the most the natural ground rises above
 * the floor, less the framing and the gap. 0 when it's clear everywhere.
 */
export function cutUnderPiers(plan: Plan, rings: Vec2[][], origin: Vec2, ground: { sample: (x: number, y: number) => number }): number {
  const ew = earthworksOf(plan)
  const keep = floorRL(plan) - FLOOR_STRUCTURE - ew.subfloor
  let deepest = 0
  for (const ring of rings) {
    if (ring.length < 3) continue
    const xs = ring.map(p => p[0])
    const ys = ring.map(p => p[1])
    for (let x = Math.min(...xs) + PIER_PROBE / 2; x < Math.max(...xs); x += PIER_PROBE)
      for (let y = Math.min(...ys) + PIER_PROBE / 2; y < Math.max(...ys); y += PIER_PROBE) {
        if (!pointInPolygon(x, y, ring)) continue
        const s = toSite([x, y], plan.placement, origin)
        deepest = Math.max(deepest, ground.sample(s[0], s[1]) - keep)
      }
  }
  return deepest
}
