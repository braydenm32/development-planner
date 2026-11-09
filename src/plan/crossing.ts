// A driveway from the garage floor out to the gutter: where its centreline meets the street
// boundary, the ground along it, and the long section across the footpath and down the kerb's
// layback to the gutter. Then a car on it: the ground clearance template run along the long
// section (does it scrape?), and a car turning in from the road at full lock (does it fit the
// crossing?). The numbers these use (the council's crossing, the design cars) come from
// src/checks/crossing.ts, which turns the results into checks; docs/research has the sources.

import { driveWidth } from '../lib/drape'
import { pointInPolygon, type Vec2 } from '../lib/geom'
import { distToRings, driveEndPoints, garageRL, houseRings, type DriveGround } from './driveway'
import { areaKind, earthworksOf, pointOnWall, toSite, wallDir, type Area, type CrossingFacts, type Plan } from './model'

/** Samples along the drive (m). */
export const STEP = 0.25
/** How far past the drive's street end its centreline may run to reach the street boundary (m). */
const REACH = 8

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1]
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0]
const len = (a: Vec2) => Math.hypot(a[0], a[1])
const at = (p: Vec2, u: Vec2, s: number): Vec2 => [p[0] + u[0] * s, p[1] + u[1] * s]

/** A garage door the drive leads to: how wide, and how square and central it is to the drive. */
export interface DoorFacts {
  width: number
  /** Angle between the drive's line and straight in through the door (degrees). */
  skew: number
  /** How far the door's middle is from the drive's centreline (m). */
  offset: number
}

/** A driveway as the crossing checks measure it, in the survey's local frame. */
export interface DriveLine {
  id: string
  name: string
  /** The middle of the garage end. */
  garage: Vec2
  /** Where the centreline meets the street boundary; null when it doesn't reach it. */
  boundary: Vec2 | null
  /** Out of the lot, square to the street boundary (unit). */
  out: Vec2 | null
  /** The street boundary edge, and whether it was guessed because no street side is set. */
  edge: number | null
  guessed: boolean
  /** Why the crossing can't be checked: a battle-axe lot (the crossing is at the end of the handle), or the drive doesn't run to the street. */
  why?: 'battle-axe' | 'not-to-street'
  /** The finished ground down the centreline from the garage end (x = 0) to the boundary, or to the drive's street end when it doesn't reach. */
  along: { x: number; z: number }[]
  /** The drive's own level at its garage end (the garage's slab, or typed); null when it follows the ground, so the step to the floor isn't known. */
  floor: number | null
  /** The natural ground at the boundary crossing, from a real survey (null on rough state data or with no crossing). */
  natural: number | null
  /** The drive's width: narrowest, and at the street end. */
  width: { min: number; street: number }
  door: DoorFacts | null
  facts: CrossingFacts
}

/** The outward normal of a boundary edge. */
function outward(boundary: Vec2[], i: number): Vec2 {
  const a = boundary[i]
  const b = boundary[(i + 1) % boundary.length]
  const e = sub(b, a)
  const l = len(e) || 1
  const n: Vec2 = [e[1] / l, -e[0] / l]
  const mid: Vec2 = [(a[0] + b[0]) / 2 + n[0] * 0.01, (a[1] + b[1]) / 2 + n[1] * 0.01]
  return pointInPolygon(mid[0], mid[1], boundary) ? [-n[0], -n[1]] : n
}

/** Where a ray from p along u first meets edge i, as the distance along the ray; null if it misses. */
function hitEdge(p: Vec2, u: Vec2, boundary: Vec2[], i: number): number | null {
  const a = boundary[i]
  const e = sub(boundary[(i + 1) % boundary.length], a)
  const d = cross(u, e)
  if (Math.abs(d) < 1e-9) return null
  const ap = sub(a, p)
  const t = cross(ap, e) / d
  const s = cross(ap, u) / d
  return s >= -0.02 && s <= 1.02 && t >= 0 ? t : null
}

/**
 * The garage door nearest the drive's garage end, within 3 m, on any level (a split level's
 * garage can be on an upper one): its width and how it sits to the drive.
 */
function doorFor(plan: Plan, origin: Vec2, garage: Vec2, u: Vec2): DoorFacts | null {
  let best: { d: number; door: DoorFacts } | null = null
  for (const o of plan.openings) {
    const w = plan.walls.find(x => x.id === o.wall)
    if (!w) continue
    // A garage door, or a wide opening at floor level (older plans drew them that way).
    if (!(o.kind === 'garage' || (o.kind === 'opening' && o.width >= 2.1 && (o.sill ?? 0) <= 0.01))) continue
    const c = toSite(pointOnWall(w, o.offset), plan.placement, origin)
    const d = len(sub(c, garage))
    if (d > 3 || (best && best.d <= d)) continue
    const a = toSite(w.a, plan.placement, origin)
    const b = toSite(w.b, plan.placement, origin)
    const along = sub(b, a)
    const dir: Vec2 = len(along) > 1e-9 ? [along[0] / len(along), along[1] / len(along)] : wallDir(w)
    const skew = (Math.asin(Math.min(1, Math.abs(dot(u, dir)))) * 180) / Math.PI
    best = { d, door: { width: o.width, skew, offset: Math.abs(cross(u, sub(c, garage))) } }
  }
  return best?.door ?? null
}

/**
 * Each driveway, on whichever level it's drawn, as the crossing checks measure it: its centreline from the
 * garage end out to where it meets the street boundary (the plan's street side, or the first
 * edge the centreline meets when none is set), and the finished ground along it.
 */
export function driveLines(plan: Plan, origin: Vec2, boundary: Vec2[], ground: DriveGround, opts: { frontEdge?: number; battleAxe?: boolean; natural?: (p: Vec2) => number | null } = {}): DriveLine[] {
  const out: DriveLine[] = []
  for (const area of plan.areas) {
    if (areaKind(area) !== 'driveway') continue
    const line = driveLine(plan, area, origin, boundary, ground, opts)
    if (line) out.push(line)
  }
  return out
}

/** The street edge a centreline from `from` along `u` meets first, and how far along: the plan's street side, or any edge when none is set. */
function streetHit(from: Vec2, u: Vec2, boundary: Vec2[], front: number | undefined): { edge: number | null; t: number | null } {
  if (front !== undefined) return { edge: front, t: hitEdge(from, u, boundary, front) }
  let best: { edge: number | null; t: number | null } = { edge: null, t: null }
  for (let i = 0; i < boundary.length; i++) {
    const ti = hitEdge(from, u, boundary, i)
    if (ti !== null && ti > 0.5 && (best.t === null || ti < best.t)) best = { edge: i, t: ti }
  }
  return best
}

/** The edge nearest a point. */
function nearestEdge(boundary: Vec2[], p: Vec2): number {
  let best = 0
  let d = Infinity
  boundary.forEach((a, i) => {
    const b = boundary[(i + 1) % boundary.length]
    const e = sub(b, a)
    const l2 = dot(e, e)
    const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), e) / l2)) : 0
    const di = len(sub(p, at(a, e, t)))
    if (di < d) {
      d = di
      best = i
    }
  })
  return best
}

function driveLine(plan: Plan, area: Area, origin: Vec2, boundary: Vec2[], ground: DriveGround, opts: { frontEdge?: number; battleAxe?: boolean; natural?: (p: Vec2) => number | null }): DriveLine | null {
  const ends = driveEndPoints(plan, area, origin, boundary)
  if (!ends) return null
  let garage = ends.garage
  let run = sub(ends.street, ends.garage)
  let reach = len(run)
  if (reach < 0.5) return null
  let u: Vec2 = [run[0] / reach, run[1] / reach]
  const widths = driveWidth(ends.poly)
  let width = { min: widths?.min ?? 0, street: widths ? (ends.streetIsA ? widths.a : widths.b) : 0 }

  // The street edge, and how far along the centreline it is.
  const front = opts.frontEdge !== undefined && opts.frontEdge < boundary.length ? opts.frontEdge : undefined
  let { edge, t } = streetHit(garage, u, boundary, front)
  if ((t === null || t > reach + REACH) && !area.drive) {
    // A drive about as wide as it is long may run across its long axis: try straight out to the
    // street. Not once it has levels: the cut and fill grades it along its long axis.
    const c: Vec2 = [ends.poly.reduce((s, p) => s + p[0], 0) / ends.poly.length, ends.poly.reduce((s, p) => s + p[1], 0) / ends.poly.length]
    const e = front ?? nearestEdge(boundary, c)
    const out = outward(boundary, e)
    const back = Math.max(...ends.poly.map(p => dot(sub(c, p), out)))
    const ahead = Math.max(...ends.poly.map(p => dot(sub(p, c), out)))
    const g = at(c, out, -back)
    const hit = hitEdge(g, out, boundary, e)
    if (hit !== null && hit <= back + ahead + REACH) {
      garage = g
      u = out
      reach = back + ahead
      run = [u[0] * reach, u[1] * reach]
      edge = e
      t = hit
      // Across the drive, square to the street.
      const across = ends.poly.map(p => cross(out, sub(p, c)))
      const wide = Math.max(...across) - Math.min(...across)
      width = { min: Math.min(width.min, wide), street: wide }
    }
  }
  const guessed = front === undefined
  const reaches = t !== null && t <= reach + REACH && t > 0.5
  const why = opts.battleAxe ? 'battle-axe' : reaches ? undefined : 'not-to-street'
  const end = !why && t !== null ? t : reach
  let along: { x: number; z: number }[] = []
  const n = Math.max(2, Math.ceil(end / STEP))
  for (let k = 0; k <= n; k++) {
    const x = (end * k) / n
    const p = at(garage, u, x)
    along.push({ x, z: ground.finished.sample(p[0], p[1]) })
  }
  // At the house the ground is the pad levelled under the slab, not what a car drives on. With a
  // level at its garage end the drive starts at it (the garage's slab, say) and is poured to meet
  // it across the pad's margin; following the ground, it starts past the pad.
  const crossing = why ? null : at(garage, u, end)
  const house = houseRings(plan, origin)
  const margin = earthworksOf(plan).margin + STEP
  const floor = garageRL(plan, area.drive)
  if (house.length && distToRings(garage, house) <= margin + 0.5) {
    const kept = along.filter(q => q.x > 0 && distToRings(at(garage, u, q.x), house) > margin)
    if (floor !== null && kept.length) along = [{ x: 0, z: floor }, ...kept]
    else if (floor === null && kept.length >= 2) {
      const skip = kept[0].x
      along = kept.map(q => ({ x: q.x - skip, z: q.z }))
      garage = at(garage, u, skip)
    }
  }
  return {
    id: area.id,
    name: area.name,
    garage,
    boundary: crossing,
    out: why || edge === null ? null : outward(boundary, edge),
    edge: why ? null : edge,
    guessed: !why && guessed,
    why,
    along,
    floor,
    natural: crossing && opts.natural ? opts.natural(crossing) : null,
    width,
    door: doorFor(plan, origin, garage, u),
    facts: area.crossing ?? {},
  }
}

/** The kerb point: the boundary crossing pushed out into the street by the footpath width. */
export function kerbPoint(line: DriveLine, footpath: number): Vec2 | null {
  return line.boundary && line.out ? at(line.boundary, line.out, footpath) : null
}

// ---------------------------------------------------------------------------
// The long section

/** The council's footpath crossing, as the long section needs it. */
export interface CrossingShape {
  /** Kerb line (the gutter's invert) to the boundary (m). */
  footpath: number
  /** The kerb's layback, from the gutter's invert towards the boundary: each piece's length (m) and grade (rise over run). */
  ramp: { length: number; grade: number }[]
  /** The fall across the rest of the footpath towards the road that the standard crossing is built to. */
  fall: number
  /** The road's crossfall, rising away from the gutter, for the car to sit on. */
  road: number
}

export type Mark = 'garage' | 'boundary' | 'layback' | 'gutter'

export interface ProfilePoint {
  /** Chainage from the garage end (m). */
  x: number
  z: number
  mark?: Mark
}

export interface DriveProfile {
  /** Garage end first, the gutter last. */
  points: ProfilePoint[]
  /** Chainage of the boundary and the gutter. */
  boundary: number
  gutter: number
  kerb: number
  /** RL at the boundary, and the fall across the footpath from it to the top of the layback (towards the road). */
  boundaryRL: number
  footpathFall: number
}

/** The layback's pieces, fitted to the footpath: never more than the footpath less 300 mm. */
export function rampOf(shape: CrossingShape): { pieces: { length: number; grade: number }[]; length: number; rise: number } {
  const total = shape.ramp.reduce((t, r) => t + r.length, 0)
  const room = Math.max(0, shape.footpath - 0.3)
  const k = total > room && total > 0 ? room / total : 1
  const pieces = shape.ramp.map(r => ({ length: r.length * k, grade: r.grade }))
  return { pieces, length: total * k, rise: pieces.reduce((t, r) => t + r.length * r.grade, 0) }
}

/** The kerb's level that a standard crossing gives from a level at the boundary: down the footpath's fall, then the layback. */
export function kerbFromBoundary(boundaryRL: number, shape: CrossingShape): number {
  const r = rampOf(shape)
  return boundaryRL - shape.fall * (shape.footpath - r.length) - r.rise
}

/** Douglas–Peucker: the points where the grade changes by more than `tol` (m) of level. */
export function simplify(pts: { x: number; z: number }[], tol = 0.01): { x: number; z: number }[] {
  if (pts.length <= 2) return pts.slice()
  const keep = new Array(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()!
    const a = pts[i]
    const b = pts[j]
    let worst = -1
    let k = -1
    for (let m = i + 1; m < j; m++) {
      const z = a.z + ((b.z - a.z) * (pts[m].x - a.x)) / (b.x - a.x || 1)
      const d = Math.abs(pts[m].z - z)
      if (d > worst) {
        worst = d
        k = m
      }
    }
    if (k >= 0 && worst > tol) {
      keep[k] = true
      stack.push([i, k], [k, j])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/**
 * The long section from the garage end to the gutter: the finished ground along the drive to the
 * boundary (simplified to its changes of grade), then straight across the footpath to the top of
 * the layback, and down the layback to the gutter's invert at the kerb's level.
 */
export function driveProfile(along: { x: number; z: number }[], kerb: number, shape: CrossingShape): DriveProfile {
  const own = simplify(along)
  const b = own[own.length - 1]
  const r = rampOf(shape)
  const top = { x: b.x + shape.footpath - r.length, z: kerb + r.rise }
  const points: ProfilePoint[] = own.map((p, i) => ({ x: p.x, z: p.z, ...(i === 0 ? { mark: 'garage' as const } : i === own.length - 1 ? { mark: 'boundary' as const } : {}) }))
  if (top.x > b.x + 1e-6) points.push({ ...top, mark: 'layback' })
  // Down the layback's pieces from its top to the gutter.
  let x = top.x
  let z = top.z
  for (const p of [...r.pieces].reverse()) {
    x += p.length
    z -= p.length * p.grade
    points.push({ x, z })
  }
  const last = points[points.length - 1]
  last.z = kerb
  last.mark = 'gutter'
  const fpRun = shape.footpath - r.length
  return { points, boundary: b.x, gutter: last.x, kerb, boundaryRL: b.z, footpathFall: fpRun > 1e-6 ? (b.z - top.z) / fpRun : 0 }
}

export interface Segment {
  x0: number
  x1: number
  z0: number
  z1: number
  /** Rise over run along the chainage (garage towards the street): negative falls towards the street. */
  grade: number
}

export function segmentsOf(points: ProfilePoint[]): Segment[] {
  const out: Segment[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (b.x - a.x < 1e-6) continue
    out.push({ x0: a.x, x1: b.x, z0: a.z, z1: b.z, grade: (b.z - a.z) / (b.x - a.x) })
  }
  return out
}

/** A change of grade along the drive: a summit (a crest the car's middle can ground on) or a sag (a dip its ends can). */
export interface GradeBreak {
  x: number
  mark?: Mark
  /** The change of grade, as a positive rise over run. */
  change: number
  kind: 'summit' | 'sag'
  /** The grades either side, garage side first. */
  before: number
  after: number
}

/**
 * The changes of grade from the garage floor (level) to the boundary, where the drive meets the
 * footpath: the ones the design sets. The layback and gutter are the council's own.
 */
export function gradeBreaks(p: DriveProfile): GradeBreak[] {
  const segs = segmentsOf(p.points)
  const out: GradeBreak[] = []
  let before = 0
  let x = 0
  for (const s of segs) {
    if (x > p.boundary + 1e-6) break
    const d = s.grade - before
    if (Math.abs(d) > 0.005) out.push({ x, mark: p.points.find(q => Math.abs(q.x - x) < 1e-6)?.mark, change: Math.abs(d), kind: d < 0 ? 'summit' : 'sag', before, after: s.grade })
    before = s.grade
    x = s.x1
  }
  return out
}

/** The ground along the long section at a chainage, with the garage floor flat behind it and the road rising beyond the gutter. */
export function levelAt(p: DriveProfile, roadFall: number, x: number): number {
  const pts = p.points
  if (x <= pts[0].x) return pts[0].z
  const last = pts[pts.length - 1]
  if (x >= last.x) return last.z + roadFall * (x - last.x)
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (x <= b.x) return b.x - a.x < 1e-9 ? b.z : a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x)
  }
  return last.z
}

// ---------------------------------------------------------------------------
// A car on it: the ground clearance template

/**
 * A ground clearance template: the car's wheelbase, overhangs and the clearance under it (m), and
 * the approach and departure angles (degrees): out past each wheel the underside rises along a
 * line at that angle from where the tyre meets the ground, once that's higher than the clearance.
 */
export interface ClearanceTemplate {
  wheelbase: number
  front: number
  rear: number
  clearance: number
  approach: number
  departure: number
}

export interface Scrape {
  /** The least gap under the car anywhere along the drive (m): negative scrapes by that much. */
  clearance: number
  /** Chainage of the ground at the tightest point. */
  x: number
  /** Which part of the car: its front or rear overhang, or underneath between the wheels. */
  part: 'front' | 'rear' | 'middle'
  /** Which way the car was facing: nose to the garage (driving in) or to the street (reversing in). */
  facing: 'in' | 'out'
}

/**
 * Run the template along the long section at small steps, both ways round (driving in nose
 * first, and reversing in), and find the tightest gap under it. The wheels are knife edges on the
 * ground, as the standard's template has them; the underside is the template's clearance above
 * the line through the two wheels, rising past each wheel at the approach or departure angle.
 */
export function scrapeAlong(p: DriveProfile, car: ClearanceTemplate, roadFall: number, step = 0.05): Scrape {
  const z = (x: number) => levelAt(p, roadFall, x)
  const span = car.wheelbase + car.front + car.rear
  const lo = p.points[0].x - span
  const hi = p.gutter + span
  let worst: Scrape = { clearance: Infinity, x: 0, part: 'middle', facing: 'in' }
  for (const facing of ['in', 'out'] as const) {
    // The wheel nearer the garage (the lower chainage) and what overhangs each way.
    const behind = facing === 'in' ? car.front : car.rear
    const ahead = facing === 'in' ? car.rear : car.front
    const tanBehind = Math.tan(((facing === 'in' ? car.approach : car.departure) * Math.PI) / 180)
    const tanAhead = Math.tan(((facing === 'in' ? car.departure : car.approach) * Math.PI) / 180)
    for (let xa = lo + behind; xa + car.wheelbase + ahead <= hi; xa += step) {
      const za = z(xa)
      // The other wheel is a wheelbase away along the chord.
      let xb = xa + car.wheelbase
      for (let k = 0; k < 4; k++) {
        const dz = z(xb) - za
        xb = xa + Math.sqrt(Math.max(car.wheelbase ** 2 - dz * dz, 1e-6))
      }
      const zb = z(xb)
      const ux = (xb - xa) / car.wheelbase
      const uz = (zb - za) / car.wheelbase
      // Up off the chord, square to it.
      const nx = -uz
      const nz = ux
      for (let s = -behind; s <= car.wheelbase + ahead + 1e-9; s += step) {
        const lift = s < 0 ? Math.max(car.clearance, -s * tanBehind) : s > car.wheelbase ? Math.max(car.clearance, (s - car.wheelbase) * tanAhead) : car.clearance
        const bx = xa + ux * s + nx * lift
        const bz = za + uz * s + nz * lift
        const gap = bz - z(bx)
        if (gap < worst.clearance) {
          const part = s < 0 ? (facing === 'in' ? 'front' : 'rear') : s > car.wheelbase ? (facing === 'in' ? 'rear' : 'front') : 'middle'
          worst = { clearance: gap, x: bx, part, facing }
        }
      }
    }
  }
  return worst
}

// ---------------------------------------------------------------------------
// A car turning in from the road

/** A design car for turning: its size, and the turning circle its outer front corner sweeps (m). */
export interface TurningCar {
  length: number
  width: number
  wheelbase: number
  front: number
  /** Kerb to kerb turning circle (a diameter). */
  circle: number
}

export interface TurnIn {
  /** Radius of the rear axle's middle at full lock (m), from the turning circle. */
  axle: number
  /** Whether the car can make it, coming along the near side of the road and turning in at full lock. */
  fits: boolean
  /** How far out from the kerb the car's far side is when it starts the turn (m): the road it needs. */
  road: number
  /** How far the inner rear wheel passes from the drive's centreline at the kerb (m). */
  inner: number
  /** How far from the drive's centreline the outer front corner sweeps where it crosses the boundary (m), or null if it has straightened by then. */
  corner: number | null
}

/**
 * A car coming along the road on the near side (its side `gap` off the kerb), turning in to the
 * drive at full lock and straightening up on its centreline. Its inner rear wheel cuts the corner,
 * so it has to stay inside the crossing's opening at the kerb (`kerbHalf` either side of the
 * centreline) and inside the drive at the boundary (`boundaryHalf`). The later it starts turning
 * (the further out in the road), the less it cuts in: this finds the turn closest to the kerb that
 * fits, and says how much road that takes. A bicycle model at the tightest lock, which is what
 * the turning circle gives; no reversing, no shuffling.
 */
export function turnIn(car: TurningCar, opening: { kerbHalf: number; boundaryHalf: number; footpath: number }, gap = 0.5): TurnIn {
  const w = car.width / 2
  // The outer front corner sweeps the turning circle: (R + w)² + (L + F)² = (circle / 2)².
  const reach = car.wheelbase + car.front
  const outer = car.circle / 2
  const axle = Math.sqrt(Math.max(outer ** 2 - reach ** 2, 0)) - w
  const rIn = axle - w
  // The turn's centre is `yc` in from the kerb line (negative: out in the road). Starting on the near side caps it.
  let yc = rIn - gap
  let fits = opening.kerbHalf >= w - 1e-9 && opening.boundaryHalf >= w - 1e-9
  // The inner wheel crosses the kerb line at axle − √(rIn² − yc²) from the centreline while yc > 0.
  const kerbCut = axle - opening.kerbHalf
  if (kerbCut > 0) yc = Math.min(yc, kerbCut >= rIn ? 0 : Math.sqrt(rIn ** 2 - kerbCut ** 2))
  // And the boundary line, a footpath further in, while the turn is still going there.
  const bCut = axle - opening.boundaryHalf
  if (bCut > 0) yc = Math.min(yc, opening.footpath + (bCut >= rIn ? 0 : Math.sqrt(rIn ** 2 - bCut ** 2)))
  if (!fits) yc = Math.min(yc, 0)
  const inner = yc > 0 ? axle - Math.sqrt(Math.max(rIn ** 2 - yc ** 2, 0)) : w
  // The outer front corner is still swinging round where it crosses the boundary if the car hasn't straightened up by then.
  const dy = opening.footpath - yc
  const corner = opening.footpath < yc + reach && Math.abs(dy) < outer ? Math.sqrt(outer ** 2 - dy ** 2) - axle : null
  fits = fits && inner <= opening.kerbHalf + 1e-6
  return { axle, fits, road: axle + w - yc, inner, corner: corner !== null && corner > w ? corner : null }
}
