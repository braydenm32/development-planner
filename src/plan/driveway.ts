// A driveway's direction and its own levels. The direction is one for the whole app: from the
// garage end (the garage door, or the house edge the drive touches) out to the street end
// (driveEndPoints); Levels, the grades, the cut and fill's ramp, the PDF and the crossing checks
// all run along it. The levels: the street end from the kerb, a surveyed spot level or a typed RL,
// and the garage end from the garage's slab or a typed RL. The cut and fill grades the ground under
// it between them (drivewayPlatforms), and its grade is read back off that finished ground by
// the same helper as the grade of any ground along it (drivewayGrade), written by gradeText.

import { driveEnds, drivewayGrade, longAxis, MAX_DRIVE_GRADE, type DriveGrade, type Surface } from '../lib/drape'
import { otherGroundAt, setsGroundAt, type EarthworksResult, type Platform, type PreparedEarthworks } from '../lib/earthworks'
import { pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import type { SurveyPoint } from '../lib/survey'
import { floorTypeInfo, levelBuildsAs, roomFloorType } from './floorTypes'
import { buildingOutline, planarFaces } from './geometry'
import { areaKind, earthworksOf, floorRL, houseWalls, pointOnWall, sortedLevels, toSite, type Area, type DriveLevels, type Plan } from './model'
import { roomIsGarage } from './roomTypes'

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
  /** Which end of driveEnds(poly, along) the street end is. */
  streetIsA: boolean
  /** Along the drive, garage end to street end (m). */
  length: number
  /** The line the drive runs along (a unit vector, either way round): what driveEnds, drivewayGrade and driveWidth measure along. */
  along: Vec2
  /** It runs across its outline's long side: a drive wider than it is long. */
  crosswise: boolean
  /** Whether the garage end is at the house, where the ground is the pad levelled under the slab. */
  atHouse: boolean
}

/** A garage end within this (m) of the house, past the pad's margin, is at the house. */
const AT_HOUSE = 0.75
/** A garage door within this (m) of the drive's outline is the one the drive leads to. */
const DOOR_NEAR = 1
/** With this much drive (m) straight out of it, a garage door is one a car drives square into: the drive runs out from it. Less, and it opens onto the side of a drive running past. */
const DOOR_DEPTH = 4.5

/** How far a point is from the nearest side of the block. */
function distToBoundary(p: Vec2, boundary: Vec2[]): number {
  if (boundary.length < 2) return 0
  return Math.min(...boundary.map((q, i) => dist(p, onSegment(p, q, boundary[(i + 1) % boundary.length]))))
}

/** Garage doors (or wide openings at floor level, as older plans drew them): each one's middle and the way its wall runs, in the survey's local frame. */
function garageDoors(plan: Plan, origin: Vec2): { at: Vec2; dir: Vec2 }[] {
  const out: { at: Vec2; dir: Vec2 }[] = []
  for (const o of plan.openings) {
    if (!(o.kind === 'garage' || (o.kind === 'opening' && o.width >= 2.1 && (o.sill ?? 0) <= 0.01))) continue
    const w = plan.walls.find(x => x.id === o.wall)
    if (!w) continue
    const a = toSite(w.a, plan.placement, origin)
    const b = toSite(w.b, plan.placement, origin)
    const l = dist(a, b)
    if (l < 1e-9) continue
    out.push({ at: toSite(pointOnWall(w, o.offset), plan.placement, origin), dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] })
  }
  return out
}

/**
 * The drive's two ends and the one direction everything about it runs along: from the garage end
 * out to the street end. A drive runs along its outline's long side unless its ends say it runs
 * across it, as a double garage's drive does (wider than it is long): the garage end is the one at
 * the house, the street end the one nearest the block's edge, and a garage door on the drive's
 * outline, with room for a car straight out of it, settles it. Along the long side, the garage
 * end is the one nearer the house (with no house yet, the street end is the one nearer the
 * block's boundary). `area.swapEnds` turns the ends round and `area.turned` turns it a quarter.
 */
export function driveEndPoints(plan: Plan, area: Area, origin: Vec2, boundary: Vec2[]): DriveEndPoints | null {
  const poly = area.pts.map(p => toSite(p, plan.placement, origin))
  const long = driveEnds(poly)
  if (!long) return null
  const house = houseRings(plan, origin)
  let streetIsA: boolean
  if (house.length) streetIsA = distToRings(long.a, house) >= distToRings(long.b, house)
  else streetIsA = boundary.length < 2 || distToBoundary(long.a, boundary) <= distToBoundary(long.b, boundary)

  const axes = longAxis(poly)
  const short = driveEnds(poly, axes.v)
  let crosswise = false
  // The door the drive leads to: the nearest one on its outline, with room for a car straight out of it.
  const door = garageDoors(plan, origin)
    .map(d => ({ ...d, d: distToRings(d.at, [poly]) }))
    .filter(d => d.d <= DOOR_NEAR)
    .sort((p, q) => p.d - q.d)[0]
  let out: Vec2 | null = null
  if (door) {
    // Out of the door, towards the drive: square to its wall, on the drive's side.
    const centre: Vec2 = [poly.reduce((t, p) => t + p[0], 0) / poly.length, poly.reduce((t, p) => t + p[1], 0) / poly.length]
    const side = Math.sign((centre[0] - door.at[0]) * -door.dir[1] + (centre[1] - door.at[1]) * door.dir[0]) || 1
    const n: Vec2 = [-door.dir[1] * side, door.dir[0] * side]
    if (Math.max(...poly.map(p => (p[0] - door.at[0]) * n[0] + (p[1] - door.at[1]) * n[1])) >= DOOR_DEPTH) out = n
  }
  if (out && short) {
    // It runs out of the garage door: along whichever side of its outline that is.
    crosswise = Math.abs(out[0] * axes.v[0] + out[1] * axes.v[1]) > Math.abs(out[0] * axes.u[0] + out[1] * axes.u[1])
    if (crosswise) streetIsA = (short.a[0] - short.b[0]) * out[0] + (short.a[1] - short.b[1]) * out[1] > 0
  } else if (short && (house.length || boundary.length >= 2)) {
    // No door to say: the garage end is the one at the house, the street end the one nearest the
    // block's edge. Smaller is better.
    const score = (garage: Vec2, street: Vec2) => (house.length ? distToRings(garage, house) : 0) + distToBoundary(street, boundary)
    const ab = score(short.a, short.b)
    const ba = score(short.b, short.a)
    const lengthwise = streetIsA ? score(long.b, long.a) : score(long.a, long.b)
    // The longer it is than it's wide, the more its ends have to say before it runs crosswise.
    if (Math.min(ab, ba) + (long.length - short.length) / 2 < lengthwise - 1e-9) {
      crosswise = true
      streetIsA = ba < ab
    }
  }
  // The person's own say: turned a quarter (Earthworks › Driveway › Turn it), and its ends swapped.
  if (area.turned && short) {
    crosswise = !crosswise
    const e = crosswise ? short : long
    streetIsA = house.length ? distToRings(e.a, house) >= distToRings(e.b, house) : distToBoundary(e.a, boundary) <= distToBoundary(e.b, boundary)
  }
  if (area.swapEnds) streetIsA = !streetIsA
  let along = crosswise ? axes.v : axes.u
  let ends = crosswise ? short! : long
  // A drive that leaves the garage at an angle, its two ends parallel: it runs square to its ends,
  // so each end is level across and its middle is the middle of that end, not a corner.
  const toStreet = streetIsA ? -1 : 1
  const square = squareToEnds(poly, [along[0] * toStreet, along[1] * toStreet])
  const skewed = square && driveEnds(poly, square)
  if (square && skewed) {
    along = square
    ends = skewed
    streetIsA = false
  }
  const garage = streetIsA ? ends.b : ends.a
  const atHouse = house.length > 0 && distToRings(garage, house) <= earthworksOf(plan).margin + AT_HOUSE
  return { poly, street: streetIsA ? ends.a : ends.b, garage, streetIsA, length: ends.length, along, crosswise, atHouse }
}

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]

/** The longest side of an outline that faces a direction within 35°: its outward normal (unit). */
function sideFacing(poly: Vec2[], d: Vec2): Vec2 | null {
  const ccw = signedArea(poly) > 0
  const l = Math.hypot(d[0], d[1]) || 1
  let best: { n: Vec2; len: number } | null = null
  for (let i = 0; i < poly.length; i++) {
    const e = sub(poly[(i + 1) % poly.length], poly[i])
    const len = Math.hypot(e[0], e[1])
    if (len < 1e-6) continue
    const n: Vec2 = ccw ? [e[1] / len, -e[0] / len] : [-e[1] / len, e[0] / len]
    if ((n[0] * d[0] + n[1] * d[1]) / l > Math.cos((35 * Math.PI) / 180) && (!best || len > best.len)) best = { n, len }
  }
  return best ? best.n : null
}

/**
 * For a drive running from its garage end towards `d`: the direction square to its two ends, when
 * they are parallel to each other and the drive leaves them at an angle (more than 2°: a drive
 * square to its ends already runs along its outline's side). Null otherwise.
 */
function squareToEnds(poly: Vec2[], d: Vec2): Vec2 | null {
  const street = sideFacing(poly, d)
  const garage = sideFacing(poly, [-d[0], -d[1]])
  if (!street || !garage) return null
  // Parallel ends: their outward normals point opposite ways, within 5°.
  if (street[0] * garage[0] + street[1] * garage[1] > -Math.cos((5 * Math.PI) / 180)) return null
  // Out of the garage end, square to it: the garage door's threshold is what has to be level.
  const out: Vec2 = [-garage[0], -garage[1]]
  const l = Math.hypot(d[0], d[1]) || 1
  return (out[0] * d[0] + out[1] * d[1]) / l < Math.cos((2 * Math.PI) / 180) ? out : null
}

/** The garage's slab: the floor of the level the garage (by its type, or a room called Garage) is on, or the ground floor's. */
export function garageSlab(plan: Plan): { rl: number; name: string } {
  const garage = plan.rooms.find(roomIsGarage)
  return garage ? { rl: floorRL(plan, garage.level), name: `${garage.name} slab` } : { rl: floorRL(plan), name: 'Ground floor slab' }
}

/** Whether the garage's floor is a slab on a levelled pad: the room called Garage's, or the lowest level's. */
function garageOnPad(plan: Plan): boolean {
  const garage = plan.rooms.find(r => /garage|carport/i.test(r.name))
  const lowest = sortedLevels(plan)[0]
  const type = garage ? roomFloorType(plan, garage) : lowest ? levelBuildsAs(plan, lowest.id) : 'framed'
  return type !== 'framed' && floorTypeInfo(type).ground === 'pad'
}

/**
 * The levels a drive is built to. Left alone, its garage end meets the garage's slab where the
 * drive runs up to a house on a slab: the ground there is the pad levelled 300 mm under the slab,
 * which no car drives on, so it is never the drive's level. Elsewhere a missing end follows the ground.
 */
export function driveLevelsOf(plan: Plan, area: Area, ends: Pick<DriveEndPoints, 'atHouse'> | null): DriveLevels {
  const levels = area.drive ?? {}
  return levels.garage === undefined && ends?.atHouse && garageOnPad(plan) ? { ...levels, garage: 'slab' } : levels
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
 * between its ends' levels along its direction, flat across, with batters to the natural ground
 * at its edges. It gives way to the house pad and the level ground beside retaining walls.
 * An end without a level follows the finished ground there. In the survey's local frame.
 */
export function drivewayPlatforms(plan: Plan, origin: Vec2, boundary: Vec2[]): Platform[] {
  const out: Platform[] = []
  for (const area of plan.areas) {
    if (areaKind(area) !== 'driveway') continue
    const ends = driveEndPoints(plan, area, origin, boundary)
    const axis = ends && driveEnds(ends.poly, ends.along)
    if (!ends || !axis) continue
    const levels = driveLevelsOf(plan, area, ends)
    const street = streetRL(levels)
    const garage = garageRL(plan, levels)
    if (street === null && garage === null) continue
    // An end at the garage's slab rises and falls with the floor when cut and fill is balanced.
    const slab = levels.garage === 'slab' ? 1 : 0
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
  const levels = driveLevelsOf(plan, area, ends)
  const s = streetRL(levels)
  const g = garageRL(plan, levels)
  if (s === null && g === null) return null
  const street = s ?? ground.follow(ends.street)
  const garage = g ?? ground.follow(ends.garage)
  const grade = drivewayGrade(ground.finished, ends.poly, p => ground.own(area.id, p), ends.along)
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
