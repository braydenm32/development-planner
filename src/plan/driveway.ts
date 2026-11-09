// A driveway's own levels: the street end from the kerb, a surveyed spot level or a typed RL, and
// the garage end from the garage's slab or a typed RL. The cut and fill grades the ground under
// it between them (drivewayPlatforms), and its grade is read back off that finished ground by
// the same helper as the grade of any ground along it (drivewayGrade), written by gradeText.

import { driveEnds, drivewayGrade, MAX_DRIVE_GRADE, type DriveGrade, type Surface } from '../lib/drape'
import { otherGroundAt, setsGroundAt, type EarthworksResult, type Platform, type PreparedEarthworks } from '../lib/earthworks'
import { pointInPolygon, type Vec2 } from '../lib/geom'
import type { SurveyPoint } from '../lib/survey'
import { buildingOutline, planarFaces } from './geometry'
import { areaKind, floorRL, houseWalls, toSite, type Area, type DriveLevels, type Plan } from './model'

export { MAX_DRIVE_GRADE }

/** Closest point to `p` on segment ab. */
function onSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return [a[0] + t * dx, a[1] + t * dy]
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** How far a point is from a set of outlines: 0 inside one, else to the nearest edge. */
export function distToRings(p: Vec2, rings: Vec2[][]): number {
  let best = Infinity
  for (const r of rings) {
    if (r.length >= 3 && pointInPolygon(p[0], p[1], r)) return 0
    for (let i = 0; i < r.length; i++) best = Math.min(best, dist(p, onSegment(p, r[i], r[(i + 1) % r.length])))
  }
  return best
}

/**
 * The house's outline on every level, in the survey's local frame. On a split level the garage a
 * drive serves can be on any of them, and each sits on its own part of the ground.
 */
export function houseRings(plan: Plan, origin: Vec2): Vec2[][] {
  return plan.levels.flatMap(l =>
    buildingOutline(planarFaces(houseWalls(plan.walls.filter(w => w.level === l.id)))).outlines.map(r => r.map(p => toSite(p, plan.placement, origin))),
  )
}

export interface DriveEndPoints {
  /** The drive's outline in the survey's local frame. */
  poly: Vec2[]
  /** The middle of each end, in the survey's local frame. */
  street: Vec2
  garage: Vec2
  /** Which end of driveEnds(poly) the street end is. */
  streetIsA: boolean
  /** Along the drive (m). */
  length: number
}

/**
 * The drive's two ends: the garage end is the one nearer the house, the street end the other.
 * With no house yet, the street end is the one nearer the block's boundary.
 */
export function driveEndPoints(plan: Plan, area: Area, origin: Vec2, boundary: Vec2[]): DriveEndPoints | null {
  const poly = area.pts.map(p => toSite(p, plan.placement, origin))
  const ends = driveEnds(poly)
  if (!ends) return null
  const house = houseRings(plan, origin)
  let streetIsA: boolean
  if (house.length) streetIsA = distToRings(ends.a, house) >= distToRings(ends.b, house)
  else {
    const edge = (p: Vec2) => Math.min(...boundary.map((q, i) => dist(p, onSegment(p, q, boundary[(i + 1) % boundary.length]))))
    streetIsA = boundary.length < 2 || edge(ends.a) <= edge(ends.b)
  }
  return { poly, street: streetIsA ? ends.a : ends.b, garage: streetIsA ? ends.b : ends.a, streetIsA, length: ends.length }
}

/** The garage's slab: the floor of the level a room called Garage is on, or the ground floor's. */
export function garageSlab(plan: Plan): { rl: number; name: string } {
  const garage = plan.rooms.find(r => /garage|carport/i.test(r.name))
  return garage ? { rl: floorRL(plan, garage.level), name: `${garage.name} slab` } : { rl: floorRL(plan), name: 'Ground floor slab' }
}

/** The level an end is built to, or null where it follows the ground. */
export function streetRL(levels: DriveLevels | undefined): number | null {
  return levels?.street ? levels.street.rl : null
}

export function garageRL(plan: Plan, levels: DriveLevels | undefined): number | null {
  const g = levels?.garage
  return g === 'slab' ? garageSlab(plan).rl : typeof g === 'number' ? g : null
}

/**
 * The ground a drive's levels are read against: the finished ground, with every drive that has
 * levels graded into it by the cut and fill.
 */
export interface DriveGround {
  /** The finished ground, which the grade is read off. */
  finished: Surface
  /** The finished ground an end without a level follows: the other platforms', without the drives. */
  follow: (p: Vec2) => number
  /** Whether the drive (by area id) is built to its own levels at a point, not given way to the house pad, say. */
  own: (id: string, p: Vec2) => boolean
}

/** The ground for drives from the cut and fill, or from the natural ground before there is any. */
export function driveGround(earth: { prep: PreparedEarthworks; result: EarthworksResult } | null, natural: Surface): DriveGround {
  if (!earth) return { finished: natural, follow: p => natural.sample(p[0], p[1]), own: () => true }
  return {
    finished: earth.result.grid,
    follow: p => otherGroundAt(earth.prep, p),
    // A drive without levels isn't in the cut and fill: all of it follows the ground.
    own: (id, p) => !earth.prep.platforms.some(q => q.id === id) || setsGroundAt(earth.prep, id, p),
  }
}

/**
 * The ground to grade for each driveway with a level at either end, whichever level it's drawn
 * on (a drive is always on the ground; its ends' levels set it): a ramp
 * between its ends' levels along its long axis, flat across, with batters to the natural ground
 * at its edges. It gives way to the house pad and the level ground beside retaining walls.
 * An end without a level follows the finished ground there. In the survey's local frame.
 */
export function drivewayPlatforms(plan: Plan, origin: Vec2, boundary: Vec2[]): Platform[] {
  const out: Platform[] = []
  for (const area of plan.areas) {
    if (areaKind(area) !== 'driveway') continue
    const street = streetRL(area.drive)
    const garage = garageRL(plan, area.drive)
    if (street === null && garage === null) continue
    const ends = driveEndPoints(plan, area, origin, boundary)
    const axis = ends && driveEnds(ends.poly)
    if (!ends || !axis) continue
    // An end at the garage's slab rises and falls with the floor when cut and fill is balanced.
    const slab = area.drive?.garage === 'slab' ? 1 : 0
    const [za, zb] = ends.streetIsA ? [street, garage] : [garage, street]
    out.push({
      id: area.id,
      include: [ends.poly],
      exclude: [],
      level: za ?? zb ?? 0,
      fill: true,
      margin: 0,
      softer: true,
      ramp: { a: axis.a, b: axis.b, u: axis.u, za, zb, followA: ends.streetIsA ? 0 : slab, followB: ends.streetIsA ? slab : 0 },
    })
  }
  return out
}

export interface DriveDesign {
  /** RL at each end: its own level, or the finished ground's there. */
  street: number
  garage: number
  /** Read off the finished ground along the drive, where it is built to its own levels. */
  grade: DriveGrade
  /** Steeper than the app's limit for a driveway (1 in 4). */
  tooSteep: boolean
}

/**
 * The drive as built to its own levels, measured by drivewayGrade on the finished ground the
 * cut and fill grades between them. Null until at least one end has a level.
 */
export function driveDesign(plan: Plan, area: Area, ends: DriveEndPoints, ground: DriveGround): DriveDesign | null {
  const s = streetRL(area.drive)
  const g = garageRL(plan, area.drive)
  if (s === null && g === null) return null
  const street = s ?? ground.follow(ends.street)
  const garage = g ?? ground.follow(ends.garage)
  const grade = drivewayGrade(ground.finished, ends.poly, p => ground.own(area.id, p))
  if (!grade) return null
  return { street, garage, grade, tooSteep: grade.steepest > MAX_DRIVE_GRADE }
}

/** A spot level further than this (m) to one side of the drive's line isn't its street end's level. */
export const SPOT_OFF_LINE = 1.2

/**
 * Surveyed spot levels nearest the street end, closest first. Given the garage end too, only
 * those on the drive's line, out past the street end or along the drive: not ones metres to one side.
 */
export function nearSpotLevels(levels: SurveyPoint[], at: Vec2, n = 4, within = 15, garage?: Vec2): { rl: number; at: Vec2; dist: number }[] {
  const onLine = (q: Vec2) => {
    if (!garage) return true
    const ux = garage[0] - at[0]
    const uy = garage[1] - at[1]
    const l = Math.hypot(ux, uy)
    if (!l) return true
    const along = ((q[0] - at[0]) * ux + (q[1] - at[1]) * uy) / l
    const off = Math.abs((q[0] - at[0]) * uy - (q[1] - at[1]) * ux) / l
    return off <= SPOT_OFF_LINE && along <= l
  }
  return levels
    .map(p => ({ rl: p.z, at: [p.x, p.y] as Vec2, dist: dist([p.x, p.y], at) }))
    .filter(p => p.dist <= within && onLine(p.at))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n)
}

/** Where a kerb line (survey local frame) passes closest to the street end, and how far away. */
export function nearestKerbPoint(kerbs: Vec2[][], at: Vec2): { at: Vec2; dist: number } | null {
  let best: { at: Vec2; dist: number } | null = null
  for (const line of kerbs) {
    for (let i = 0; i + 1 < line.length; i++) {
      const q = onSegment(at, line[i], line[i + 1])
      const d = dist(q, at)
      if (!best || d < best.dist) best = { at: q, dist: d }
    }
  }
  return best
}
