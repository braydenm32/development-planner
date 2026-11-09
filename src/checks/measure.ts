// What the checks measure about the design, worked out once from the same helpers the
// rest of the app uses (CALM 8): floor areas from levelSummaries, the roof's height from
// roofAboveGround, distances to the boundary from boundaryClearances, retaining walls from
// retainingProfiles and the finished ground from the cut and fill.

import type { EarthworksResult, PreparedEarthworks } from '../lib/earthworks'
import { bounds, pointInPolygon, signedArea, unionArea, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { buildingOutline, planarFaces } from '../plan/geometry'
import { levelSummaries, roofAboveGround, sideLabel } from '../plan/keyNumbers'
import { areaKind, earthworksOf, floorRL, houseWalls, sortedLevels, toSite, type Plan } from '../plan/model'
import { driveLines, type DriveLine } from '../plan/crossing'
import { driveGround } from '../plan/driveway'
import { boundaryClearances, outsideLot, signedClearance, type BoundaryClearance } from '../plan/placement'
import { retainingProfiles } from '../plan/retaining'
import { roofGeometry } from '../plan/roof'
import type { SunFacts } from '../sun/facts'
import { checkSettingsOf } from './councils'
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
  /** Hard areas (slabs, driveways, decks) in the survey's local frame. */
  hard: Vec2[][]
  trees: CheckTree[]
  /** Whether the cut and fill changes the ground at a point by more than 50 mm. */
  changedAt: ((p: Vec2) => boolean) | null
  /** The sun on 21 June (src/sun/facts.ts), once worked out; the sun checks wait for it. */
  sun?: SunFacts | null
  /** Each driveway on the lowest level, out to where it meets the street (src/plan/crossing.ts). */
  drives: DriveLine[]
}

function distToSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
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

function earthNumbers(plan: Plan, prep: PreparedEarthworks, result: EarthworksResult, boundary: Vec2[], footprint: Vec2[][]): EarthNumbers {
  const n = prep.natural
  const f = result.grid
  const out = { cutNear: 0, cutMid: 0, cutFar: 0, fillOutside: 0, cutOutside: 0, closestWorks: null as number | null, disturbed: 0 }
  const a = n.cell * n.cell
  for (let j = 0; j < n.ny; j++) {
    for (let i = 0; i < n.nx; i++) {
      const k = j * n.nx + i
      if (!prep.inside[k]) continue
      const dz = f.z[k] - n.z[k]
      const p: Vec2 = [n.x0 + i * n.cell, n.y0 + j * n.cell]
      if (Math.abs(dz) <= 0.05) {
        if (footprint.some(r => pointInPolygon(p[0], p[1], r))) out.disturbed += a
        continue
      }
      out.disturbed += a
      const d = distToRing(p, boundary)
      out.closestWorks = out.closestWorks === null ? d : Math.min(out.closestWorks, d)
      if (dz < 0) {
        const c = -dz
        if (d <= 1) out.cutNear = Math.max(out.cutNear, c)
        else if (d <= 1.5) out.cutMid = Math.max(out.cutMid, c)
        else out.cutFar = Math.max(out.cutFar, c)
        if (!footprint.some(r => pointInPolygon(p[0], p[1], r))) out.cutOutside = Math.max(out.cutOutside, c)
      } else if (!footprint.some(r => pointInPolygon(p[0], p[1], r))) {
        out.fillOutside = Math.max(out.fillOutside, dz)
      }
    }
  }
  const ew = earthworksOf(plan)
  return { ...out, maxCut: result.maxCut, maxFill: result.maxFill, cutBatter: ew.cutBatter, fillBatter: ew.fillBatter }
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
    const top = floorRL(plan, w.level) + level.height
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
    return { id: p.wall.id, height: p.maxHeight, toBoundary: Math.max(0, d - p.wall.thickness / 2) }
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
    earth: earth && earth.platforms.length ? earthNumbers(plan, earth.prep, earth.result, b, groundOutline) : null,
    walls,
    groundOutline,
    outlines: all.map(site),
    hard: hardPolys.map(site),
    trees,
    changedAt:
      earth && earth.platforms.length
        ? p => Math.abs(earth.result.grid.sample(p[0], p[1]) - earth.prep.natural.sample(p[0], p[1])) > 0.05 && pointInPolygon(p[0], p[1], b)
        : null,
    sun,
    drives: driveLines(plan, survey.origin, b, driveGround(earth, terrain.grid), {
      frontEdge: front,
      battleAxe: settings.battleAxe,
      natural: dem ? undefined : p => terrain.grid.sample(p[0], p[1]),
    }),
  }
}
