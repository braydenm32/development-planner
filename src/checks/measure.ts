// What the checks measure about the design, worked out once from the same helpers the
// rest of the app uses (CALM 8): floor areas from levelSummaries, the roof's height from
// roofAboveGround, distances to the boundary from boundaryClearances, retaining walls from
// retainingProfiles and the finished ground from the cut and fill.

import { groundSourceAt, type EarthworksResult, type PreparedEarthworks } from '../lib/earthworks'
import { bounds, pointInPolygon, signedArea, unionArea, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { buildingOutline, planarFaces } from '../plan/geometry'
import { levelSummaries, roofAboveGround, sideLabel } from '../plan/keyNumbers'
import { areaKind, earthworksOf, houseWalls, sortedLevels, toSite, type Plan } from '../plan/model'
import { driveLines, type DriveLine } from '../plan/crossing'
import { driveGround } from '../plan/driveway'
import { boundaryClearances, outsideLot, signedClearance, type BoundaryClearance } from '../plan/placement'
import { retainingProfiles } from '../plan/retaining'
import { roofGeometry } from '../plan/roof'
import { wallTopRL } from '../plan/roofline'
import type { SunFacts } from '../sun/facts'
import { checkSettingsOf } from './councils'
import { earthSource, worksNearBoundary, type EarthSource, type NearBoundary } from './earthSources'
import { isPadId } from '../plan/platforms'
import { worksOf, type Works, type WorksGround } from './trees'
import type { CheckSettings, CheckTree } from './types'

export type EdgeRole = 'front' | 'rear' | 'side'

export interface Edge {
  index: number
  /** "North side", as the Place panel names it. */
  label: string
  length: number
  role: EdgeRole
  a: Vec2
  b: Vec2
  /**
   * Shortest distance from the house (every level) to this edge (m); null with no house.
   * Negative by how far the house goes past the edge, out of the lot.
   */
  clearance: number | null
  /** The same from the upper floor: the levels that sit over a lower one (see stacking). */
  upperClearance: number | null
  /** Where that distance is measured: the house's closest point and the boundary's (site frame), so Checks can draw it on the plan. */
  near?: [Vec2, Vec2]
}

/** A spot on the changed ground (site frame), and what changed it there. */
export interface EarthSpot {
  at: Vec2
  /** How much the ground changes there (m): + fill, − cut. */
  dz: number
  source: EarthSource | null
}

export interface EarthNumbers {
  /** Deepest cut (m) by distance to the nearest boundary: within 1 m, 1 to 1.5 m, beyond 1.5 m. */
  cutNear: number
  cutMid: number
  cutFar: number
  /** Highest fill (m) outside the house's footprint. */
  fillOutside: number
  /** Deepest cut (m) outside the house's footprint (inside it, the house's walls retain it). */
  cutOutside: number
  /** Ground the works disturb: the cut and fill and the house's footprint (m²). */
  disturbed: number
  /** Closest any change to the ground (over 50 mm) comes to the boundary (m); null with none. */
  closestWorks: number | null
  /** Where that is, the nearest point on the boundary, and which boundary edge (by index). */
  closestAt: (EarthSpot & { boundary: Vec2; edge: number }) | null
  /** Where the highest fill outside the house is, and the deepest cut in each band from the boundary. */
  fillOutsideAt: EarthSpot | null
  cutNearAt: EarthSpot | null
  cutMidAt: EarthSpot | null
  cutFarAt: EarthSpot | null
  /** Each part of the design whose works come within 1 m of a side or rear boundary (the whole boundary when every edge counts), closest first. */
  nearBoundary: NearBoundary[]
  /** Whether the distances above leave out the front boundary (false: no street side set, or a battle-axe lot, so every boundary counts). */
  sideRearOnly: boolean
  maxCut: number
  maxFill: number
  cutBatter: number
  fillBatter: number
}

export interface WallNumbers {
  id: string
  /** Ground held back (m), and the closest the wall comes to the boundary (m). */
  height: number
  toBoundary: number
  /** Its ends (site frame), for the spacing between walls and the pins on the plan. */
  a: Vec2
  b: Vec2
}

export interface Measures {
  settings: CheckSettings
  /** Lot area inside the survey boundary (m²): what the Housing Code counts on a battle-axe lot. */
  lotArea: number
  edges: Edge[]
  /** The outside walls make a closed outline on some level: there's a house to measure. */
  hasHouse: boolean
  /** A roof that builds: the house's height is measured to its top, not the walls'. */
  hasRoof: boolean
  /** Rooms enclosed by walls, so the floor area inside the walls is known. */
  hasRooms: boolean
  /** The house reaches outside the lot: by how far (m), and whether none of it is inside. */
  outside: { by: number; all: boolean } | null
  /** Floor area to the outside of the walls, every level (m²). The rooms' own areas are a lower bound. */
  grossArea: number
  roomsArea: number
  /** Area the house covers in plan (m²). */
  footprint: number
  /** Area under the house, slabs, driveways and decks together (m²). */
  hardArea: number
  /** Highest point of the house above the natural ground under it (m). */
  height: number
  /**
   * Storeys as the Codes SEPP counts them: the most levels stacked over any one point, so split
   * levels side by side on a slope are one storey (see stacking).
   */
  storeys: number
  /** Levels that have walls. */
  levels: number
  /** Mean slope of the block (%). */
  slopePct: number
  earth: EarthNumbers | null
  walls: WallNumbers[]
  /** Ground-floor outline rings in the survey's local frame. */
  groundOutline: Vec2[][]
  /** Every level's outline rings, in the survey's local frame. */
  outlines: Vec2[][]
  /** What's built, named, in the survey's local frame (the house, slabs, decks, driveways, retaining walls): what a tree's zone is measured against. */
  works: Works[]
  /** The natural and finished ground once there's cut or fill, for the trees' zones too. */
  ground: WorksGround
  trees: CheckTree[]
  /** The sun on 21 June (src/sun/facts.ts), once worked out; the sun checks wait for it. */
  sun?: SunFacts | null
  /** Each driveway on the lowest level, out to where it meets the street (src/plan/crossing.ts). */
  drives: DriveLine[]
}

/** The nearest point to p on the segment a–b. */
function onSeg(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return [a[0] + t * dx, a[1] + t * dy]
}

function distToSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const q = onSeg(p, a, b)
  return Math.hypot(p[0] - q[0], p[1] - q[1])
}

/** Shortest distance from a point to a ring's edges. */
export function distToRing(p: Vec2, ring: Vec2[]): number {
  let d = Infinity
  for (let i = 0; i < ring.length; i++) d = Math.min(d, distToSeg(p, ring[i], ring[(i + 1) % ring.length]))
  return d
}

/** Grid step (m) for finding where levels stack, and how far inside an outline a point must be to count. */
const STACK_STEP = 0.25
const STACK_INSET = 0.5

/**
 * Storeys as the Codes SEPP counts them (a storey is the space between one floor and the next
 * above it): the most levels stacked over any one point of the plan, not how many levels there
 * are. Split levels beside each other on a slope are one storey; a level over part of another
 * makes two there. Also which levels sit over a lower one, which are the upper floor.
 *
 * `outlinesBy` is each level's outline rings, lowest level first. A point counts for a level
 * only STACK_INSET inside its outline, so the strip where two split levels share a wall line
 * doesn't count as stacked.
 */
export function stacking(outlinesBy: Vec2[][][]): { storeys: number; over: boolean[] } {
  const over = outlinesBy.map(() => false)
  const pts = outlinesBy.flat(2)
  if (!pts.length) return { storeys: 0, over }
  const b = bounds(pts)
  const within = (p: Vec2, rings: Vec2[][]) => rings.some(r => pointInPolygon(p[0], p[1], r) && distToRing(p, r) >= STACK_INSET)
  let storeys = 0
  for (let x = b.minX + STACK_STEP / 2; x < b.maxX; x += STACK_STEP) {
    for (let y = b.minY + STACK_STEP / 2; y < b.maxY; y += STACK_STEP) {
      const here: number[] = []
      outlinesBy.forEach((rings, i) => {
        if (rings.length && within([x, y], rings)) here.push(i)
      })
      if (here.length > storeys) storeys = here.length
      for (const i of here.slice(1)) over[i] = true
    }
  }
  // A house too slim for the inset anywhere is still one storey.
  return { storeys: Math.max(storeys, 1), over }
}

/** The rear edge: the one set, or the one facing most nearly away from the front. */
export function rearEdgeOf(sides: { inward: Vec2 }[], front: number | undefined, rear: number | undefined): number | undefined {
  if (rear !== undefined && rear < sides.length) return rear
  if (front === undefined || front >= sides.length) return undefined
  const f = sides[front].inward
  let best = -1
  let bestDot = Infinity
  sides.forEach((s, i) => {
    if (i === front) return
    const d = s.inward[0] * f[0] + s.inward[1] * f[1]
    if (d < bestDot) {
      bestDot = d
      best = i
    }
  })
  return best < 0 ? undefined : best
}

/**
 * The Housing Code's earthworks limits (cl 3.30) measure from the side and rear boundaries only, so
 * the front boundary is left out when it's known. Without a street side, or on a battle-axe lot (whose
 * access side isn't a road frontage), every boundary counts: the safer reading.
 */
function earthNumbers(plan: Plan, prep: PreparedEarthworks, result: EarthworksResult, boundary: Vec2[], footprint: Vec2[][], front: number | undefined): EarthNumbers {
  const n = prep.natural
  const f = result.grid
  const counted = boundary.map((_, i) => i).filter(i => i !== front)
  /** The nearest side or rear boundary edge to a point, and how far. */
  const nearestEdge = (p: Vec2) => counted.reduce((b, i) => {
    const d = distToSeg(p, boundary[i], boundary[(i + 1) % boundary.length])
    return d < b.d ? { d, i } : b
  }, { d: Infinity, i: -1 })
  const out = { cutNear: 0, cutMid: 0, cutFar: 0, fillOutside: 0, cutOutside: 0, closestWorks: null as number | null, disturbed: 0 }
  // The nodes (by index) of each worst spot; what changed the ground there is looked up once, at the end.
  let closestK = -1
  let closestEdge = -1
  let fillK = -1
  const cutK = [-1, -1, -1]
  const a = n.cell * n.cell
  const inHouse = (p: Vec2) => footprint.some(r => pointInPolygon(p[0], p[1], r))
  for (let j = 0; j < n.ny; j++) {
    for (let i = 0; i < n.nx; i++) {
      const k = j * n.nx + i
      if (!prep.inside[k]) continue
      const dz = f.z[k] - n.z[k]
      const p: Vec2 = [n.x0 + i * n.cell, n.y0 + j * n.cell]
      if (Math.abs(dz) <= 0.05) {
        if (inHouse(p)) out.disturbed += a
        continue
      }
      out.disturbed += a
      const near = nearestEdge(p)
      const d = near.d
      if (out.closestWorks === null || d < out.closestWorks) {
        out.closestWorks = d
        closestK = k
        closestEdge = near.i
      }
      if (dz < 0) {
        const c = -dz
        const band = d <= 1 ? 0 : d <= 1.5 ? 1 : 2
        const key = (['cutNear', 'cutMid', 'cutFar'] as const)[band]
        if (c > out[key]) {
          out[key] = c
          cutK[band] = k
        }
        if (!inHouse(p)) out.cutOutside = Math.max(out.cutOutside, c)
      } else if (!inHouse(p) && dz > out.fillOutside) {
        out.fillOutside = dz
        fillK = k
      }
    }
  }
  const spot = (k: number): EarthSpot | null => {
    if (k < 0) return null
    const i = k % n.nx
    const at: Vec2 = [n.x0 + i * n.cell, n.y0 + ((k - i) / n.nx) * n.cell]
    const src = groundSourceAt(prep, k)
    const pf = src ? prep.platforms[src.platform] : undefined
    // A pad is level a margin past the walls: outside the house, that's the margin, not the pad.
    const how = src?.how === 'level' && isPadId(pf?.id) && !inHouse(at) ? 'margin' : src?.how
    return { at, dz: f.z[k] - n.z[k], source: src && pf && how ? earthSource(plan, pf.id, how) : null }
  }
  const closest = spot(closestK)
  const e0 = boundary[closestEdge]
  const e1 = boundary[(closestEdge + 1) % boundary.length]
  const ew = earthworksOf(plan)
  return {
    ...out,
    closestAt: closest && e0 ? { ...closest, boundary: onSeg(closest.at, e0, e1), edge: closestEdge } : null,
    fillOutsideAt: spot(fillK),
    cutNearAt: spot(cutK[0]),
    cutMidAt: spot(cutK[1]),
    cutFarAt: spot(cutK[2]),
    nearBoundary: out.closestWorks !== null && out.closestWorks <= 1 ? worksNearBoundary(plan, prep, result, boundary, 1, counted) : [],
    sideRearOnly: front !== undefined,
    maxCut: result.maxCut,
    maxFill: result.maxFill,
    cutBatter: ew.cutBatter,
    fillBatter: ew.fillBatter,
  }
}

/** The highest point of the house above the natural ground: the roofs, and the tops of its walls. */
export function houseHeight(plan: Plan, survey: Survey, terrain: Terrain): number {
  let h = 0
  for (const r of plan.roofs) {
    const g = roofGeometry(r)
    if (!g.error) h = Math.max(h, roofAboveGround(plan, r, g, survey, terrain))
  }
  for (const w of houseWalls(plan.walls)) {
    const level = plan.levels.find(l => l.id === w.level)
    if (!level) continue
    const top = wallTopRL(plan, w)
    for (const p of [w.a, w.b]) {
      const s = toSite(p, plan.placement, survey.origin)
      h = Math.max(h, top - terrain.grid.sample(s[0], s[1]))
    }
  }
  return h
}

export interface MeasureInput {
  plan: Plan
  survey: Survey
  terrain: Terrain
  earth: { prep: PreparedEarthworks; result: EarthworksResult; platforms: unknown[] } | null
  trees?: CheckTree[]
  sun?: SunFacts | null
  /** The ground is the state's elevation data, not a survey, so it doesn't give the street's level at the boundary. */
  dem?: boolean
}

export function measure({ plan, survey, terrain, earth, trees = [], sun = null, dem = false }: MeasureInput): Measures {
  const settings = checkSettingsOf(plan.checks)
  const pl = plan.placement
  const site = (ring: Vec2[]) => ring.map(p => toSite(p, pl, survey.origin))
  const summaries = levelSummaries(plan)
  const levels = sortedLevels(plan)
  const outlinesBy = levels.map(l => buildingOutline(planarFaces(houseWalls(plan.walls).filter(w => w.level === l.id))).outlines)
  const all = outlinesBy.flat()
  const stack = stacking(outlinesBy)
  // The upper floor: levels over a lower one. A split level beside the others isn't one.
  const upper = outlinesBy.filter((_, i) => stack.over[i]).flat()
  const hardPolys = plan.areas.filter(a => areaKind(a) !== 'garden' && a.pts.length >= 3).map(a => a.pts)

  const clear = boundaryClearances(all, pl, survey)
  const clearUp = upper.length ? boundaryClearances(upper, pl, survey) : []
  // boundaryClearances gives every edge its inward normal even with no house, which the rear edge needs.
  const sides: BoundaryClearance[] = clear.length ? clear : boundaryClearances([[[0, 0], [0.001, 0]]], pl, survey)
  const front = settings.frontEdge !== undefined && settings.frontEdge < survey.boundary.length ? settings.frontEdge : undefined
  const rear = rearEdgeOf(sides, front, settings.rearEdge)
  const b = survey.boundary
  const edges: Edge[] = b.map((a, i) => {
    const q = b[(i + 1) % b.length]
    return {
      index: i,
      label: sides[i] ? sideLabel(sides, sides[i]) : `Side ${i + 1}`,
      length: Math.hypot(q[0] - a[0], q[1] - a[1]),
      role: i === front ? 'front' : i === rear ? 'rear' : 'side',
      a,
      b: q,
      clearance: clear[i] ? signedClearance(clear[i]) : null,
      upperClearance: clearUp[i] ? signedClearance(clearUp[i]) : null,
      ...(clear[i] ? { near: [clear[i].from, clear[i].to] as [Vec2, Vec2] } : {}),
    }
  })

  const groundOutline = (outlinesBy[0] ?? []).map(site)
  const ground = earth?.result.grid ?? terrain.grid
  const walls = retainingProfiles(plan, survey.origin, ground).map(p => {
    const a = toSite(p.wall.a, pl, survey.origin)
    const z = toSite(p.wall.b, pl, survey.origin)
    let d = Infinity
    const steps = Math.max(1, Math.ceil(p.length / 0.25))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      d = Math.min(d, distToRing([a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t], b))
    }
    // The wall's face is half its thickness nearer the boundary than its centreline.
    return { id: p.wall.id, height: p.maxHeight, toBoundary: Math.max(0, d - p.wall.thickness / 2), a, b: z }
  })

  const out = outsideLot(all, pl, survey)
  const roomsArea = summaries.reduce((t, s) => t + s.rooms.reduce((u, r) => u + (r.area ?? 0), 0), 0)
  return {
    settings,
    lotArea: Math.abs(signedArea(b)),
    edges,
    hasHouse: all.length > 0,
    hasRoof: plan.roofs.some(r => !roofGeometry(r).error),
    hasRooms: roomsArea > 0,
    outside: out.any ? { by: out.by, all: out.all } : null,
    grossArea: summaries.reduce((t, s) => t + s.gross.area, 0),
    roomsArea,
    footprint: all.length ? unionArea(all) : 0,
    hardArea: all.length || hardPolys.length ? unionArea([...all, ...hardPolys]) : 0,
    height: houseHeight(plan, survey, terrain),
    storeys: all.length ? stack.storeys : 0,
    levels: outlinesBy.filter(o => o.length > 0).length,
    slopePct: terrain.stats.meanSlopePct,
    // "Outside the house" is outside every level's outline: a split level's own slab is under the house too.
    earth: earth && earth.platforms.length ? earthNumbers(plan, earth.prep, earth.result, b, all.map(site), settings.battleAxe ? undefined : front) : null,
    walls,
    groundOutline,
    outlines: all.map(site),
    works: worksOf(plan, survey.origin),
    // The ground Site › Features measures the zones on (src/site/sync.ts), so the shares agree.
    ground: earth && earth.platforms.length ? { natural: terrain.grid, finished: earth.result.grid } : null,
    trees,
    sun,
    drives: driveLines(plan, survey.origin, b, driveGround(earth, terrain.grid), {
      frontEdge: front,
      battleAxe: settings.battleAxe,
      natural: dem ? undefined : p => terrain.grid.sample(p[0], p[1]),
    }),
  }
}
