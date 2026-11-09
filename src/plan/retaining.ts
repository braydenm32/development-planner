import { ENGINEER_TEXT } from '../checks/engineer'
import { pointInPolygon, type Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import { buildingOutline, planarFaces } from './geometry'
import { floorRL, isRetaining, levelById, sortedLevels, toSite, wallDir, wallLength, type Plan, type Retain, type Wall } from './model'
import { housePadRL, MIN_BENCH, sideRL } from './platforms'

/** How far a retaining wall stands above the ground it holds back (m). */
export const RETAINING_FREEBOARD = 0.1

/**
 * Walls holding back this much or more need an engineer (m): the one figure the checks use too
 * (src/checks/engineer.ts), so the panel, the plan, the strip and the checks agree.
 */
export { ENGINEER_HEIGHT, needsEngineer } from '../checks/engineer'

/** What the amber flag says, as the hc-retaining check does; not legal advice. */
export const engineerNote = (h: number) =>
  `Holds back ${h.toFixed(2)} m. Under the NSW Housing Code a wall holding back over ${ENGINEER_TEXT} needs a professional engineer's certificate. Check with your council or certifier; this isn't legal advice.`

/** A house further than this from a retaining wall isn't next to it (m). */
export const HOUSE_REACH = 8

export type Side = 'left' | 'right'
export const otherSide = (s: Side): Side => (s === 'left' ? 'right' : 'left')

export interface RetainingProfile {
  wall: Wall
  length: number
  /** Distance along the wall (m) and the finished ground level just off each face. */
  samples: { s: number; left: number; right: number }[]
  /** Greatest difference in ground level from one side to the other (m). */
  maxHeight: number
  /** Area of exposed face, from the lower ground to the higher (m²). */
  faceArea: number
  /** Lowest and highest RL of the top of the wall. */
  top: [number, number]
  /**
   * The side holding back the higher ground, looking from the wall's start to its end; null when level.
   * A wall told which side it holds keeps that side.
   */
  high: Side | null
}

/** RL of the top of the wall where the ground either side is `x`: its own top, or the higher ground plus the freeboard. */
export function topAt(w: Pick<Wall, 'retain'>, x: { left: number; right: number }): number {
  return w.retain?.top ?? Math.max(x.left, x.right) + RETAINING_FREEBOARD
}

/** The ground either side of a retaining wall, sampled along it. */
export function retainingProfile(w: Wall, plan: Plan, origin: Vec2, ground: Heightfield): RetainingProfile {
  const len = wallLength(w)
  const d = wallDir(w)
  const n: Vec2 = [-d[1], d[0]]
  // Far enough off the face to read the ground beside the wall, not the step at it.
  const off = w.thickness / 2 + Math.max(0.3, ground.cell * 1.4)
  const level = (p: Vec2) => {
    const s = toSite(p, plan.placement, origin)
    return ground.sample(s[0], s[1])
  }
  const steps = Math.max(1, Math.ceil(len / 0.25))
  const samples: RetainingProfile['samples'] = []
  for (let i = 0; i <= steps; i++) {
    const s = (len * i) / steps
    const c: Vec2 = [w.a[0] + d[0] * s, w.a[1] + d[1] * s]
    samples.push({ s, left: level([c[0] + n[0] * off, c[1] + n[1] * off]), right: level([c[0] - n[0] * off, c[1] - n[1] * off]) })
  }
  let maxHeight = 0
  let faceArea = 0
  let lean = 0
  let lo = Infinity
  let hi = -Infinity
  samples.forEach((p, i) => {
    const h = Math.abs(p.left - p.right)
    maxHeight = Math.max(maxHeight, h)
    lean += p.left - p.right
    const top = topAt(w, p)
    lo = Math.min(lo, top)
    hi = Math.max(hi, top)
    if (i > 0) faceArea += ((h + Math.abs(samples[i - 1].left - samples[i - 1].right)) / 2) * (p.s - samples[i - 1].s)
  })
  lean /= samples.length
  const high = w.retain?.high ?? (lean > 0.02 ? 'left' : lean < -0.02 ? 'right' : null)
  return { wall: w, length: len, samples, maxHeight, faceArea, top: [lo, hi], high }
}

/** Compass bearing (degrees from north) that one side of a wall faces. */
export function sideBearing(w: Pick<Wall, 'a' | 'b'>, side: Side, plan: Plan): number {
  const d = wallDir(w)
  const n: Vec2 = side === 'left' ? [-d[1], d[0]] : [d[1], -d[0]]
  // Turn from the house's frame to the site's (x east, y north).
  const t = (plan.placement.rotation * Math.PI) / 180
  const e = n[0] * Math.cos(t) - n[1] * Math.sin(t)
  const no = n[0] * Math.sin(t) + n[1] * Math.cos(t)
  return ((Math.atan2(e, no) * 180) / Math.PI + 360) % 360
}

/** Compass bearing (degrees from north) of the side holding back the higher ground, or null when level. */
export function highSideBearing(p: RetainingProfile, plan: Plan): number | null {
  return p.high ? sideBearing(p.wall, p.high, plan) : null
}

/** The most the wall stands above the lower ground beside it: the face seen from the low side (m). */
export function exposedHeight(p: RetainingProfile): number {
  let h = 0
  for (const x of p.samples) h = Math.max(h, topAt(p.wall, x) - Math.min(x.left, x.right))
  return h
}

/** The highest ground beside the wall on one side (m). */
export const highestOn = (p: RetainingProfile, side: Side) => Math.max(...p.samples.map(x => x[side]))
/** The lowest ground beside the wall on one side (m). */
export const lowestOn = (p: RetainingProfile, side: Side) => Math.min(...p.samples.map(x => x[side]))

/** A closed mesh: corners in the house frame, a level (RL) for each, and triangles facing out. */
export interface RetainingSolid {
  pts: Vec2[]
  z: number[]
  tris: number[]
}

/**
 * The wall as a solid whose top follows the ground it holds back (or stands at its own top RL), from `bottom` up.
 * `poly` is the wall's outline from wallPolygons: start right, end right, end left, start left.
 */
export function retainingSolid(poly: Vec2[], p: RetainingProfile, bottom: number): RetainingSolid {
  const [ar, br, bl, al] = poly
  const lerp = (a: Vec2, b: Vec2, f: number): Vec2 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
  const n = p.samples.length - 1
  const pts: Vec2[] = []
  const z: number[] = []
  // Four corners per sample: right bottom, right top, left bottom, left top.
  p.samples.forEach((x, i) => {
    const top = Math.max(topAt(p.wall, x), bottom + 0.01)
    const r = lerp(ar, br, i / n)
    const l = lerp(al, bl, i / n)
    pts.push(r, r, l, l)
    z.push(bottom, top, bottom, top)
  })
  const RB = (i: number) => 4 * i
  const RT = (i: number) => 4 * i + 1
  const LB = (i: number) => 4 * i + 2
  const LT = (i: number) => 4 * i + 3
  const tris: number[] = []
  for (let i = 0; i < n; i++) {
    const j = i + 1
    tris.push(RT(i), RT(j), LT(j), RT(i), LT(j), LT(i)) // top
    tris.push(RB(i), LB(j), RB(j), RB(i), LB(i), LB(j)) // bottom
    tris.push(RB(i), RB(j), RT(j), RB(i), RT(j), RT(i)) // right face
    tris.push(LB(i), LT(j), LB(j), LB(i), LT(i), LT(j)) // left face
  }
  tris.push(RB(0), LT(0), LB(0), RB(0), RT(0), LT(0)) // start
  tris.push(RB(n), LB(n), LT(n), RB(n), LT(n), RT(n)) // end
  return { pts, z, tris }
}

/**
 * Every retaining wall in the plan, measured against the finished ground: the ones the totals, the
 * strip and the checks count. A wall drawn inside the house holds no earth, so it isn't one of them.
 */
export function retainingProfiles(plan: Plan, origin: Vec2, ground: Heightfield): RetainingProfile[] {
  const rings = new Map<string, Vec2[][]>()
  const ringsOf = (level: string) => rings.get(level) ?? rings.set(level, houseRings(plan, level)).get(level)!
  return plan.walls
    .filter(w => isRetaining(w) && wallLength(w) > 1e-3 && !insideHouse(w, plan, ringsOf(w.level)))
    .map(w => retainingProfile(w, plan, origin, ground))
}

// ---------------------------------------------------------------------------
// Setting a retaining wall's levels.

/**
 * Outside of a floor's walls, in the house frame: the wall's own level's, so a wall beside an upper
 * split level meets that part of the house. With no level, or one with no walls, the lowest floor's.
 */
export function houseRings(plan: Plan, level?: string): Vec2[][] {
  const outline = (id: string) => buildingOutline(planarFaces(plan.walls.filter(w => w.level === id && !isRetaining(w)))).outlines
  const own = level !== undefined && levelById(plan, level) ? outline(level) : []
  if (own.length) return own
  const ground = sortedLevels(plan)[0]
  return ground ? outline(ground.id) : []
}

/** How far into the house a wall's face has to reach before the house counts as being on that side (m). */
const HOUSE_DEPTH = 0.5
/** A wall further than this inside the house's outline is inside the house, not along its wall (m). */
const INSIDE_DEPTH = 0.4

/** Distance from p to the segment ab. */
function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const e: Vec2 = [b[0] - a[0], b[1] - a[1]]
  const l2 = e[0] * e[0] + e[1] * e[1]
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * e[0] + (p[1] - a[1]) * e[1]) / l2)) : 0
  return Math.hypot(p[0] - a[0] - e[0] * t, p[1] - a[1] - e[1] * t)
}

/**
 * True when a retaining wall stands wholly inside the house, clear of its outside walls: there is
 * no earth there for it to hold back. A wall along the house's own wall line isn't inside.
 */
export function insideHouse(w: Pick<Wall, 'a' | 'b'> & { level?: string }, plan: Plan, rings = houseRings(plan, w.level)): boolean {
  if (!rings.length) return false
  for (let i = 0; i <= 6; i++) {
    const f = i / 6
    const p: Vec2 = [w.a[0] + (w.b[0] - w.a[0]) * f, w.a[1] + (w.b[1] - w.a[1]) * f]
    const ring = rings.find(r => pointInPolygon(p[0], p[1], r))
    if (!ring) return false
    for (let k = 0; k < ring.length; k++) if (segDist(p, ring[k], ring[(k + 1) % ring.length]) < INSIDE_DEPTH) return false
  }
  return true
}

/** What the panel says about a wall inside the house. */
export const INSIDE_HOUSE_NOTE = 'This wall is inside the house, so there is no earth to hold back. Move it outside the house walls, or delete it.'

/**
 * How far the house is from one face of the wall, looking square off it from points along it,
 * or null when it isn't within HOUSE_REACH on that side.
 */
export function houseGap(w: Pick<Wall, 'a' | 'b' | 'thickness'> & { level?: string }, plan: Plan, side: Side, rings = houseRings(plan, w.level)): number | null {
  const len = wallLength(w)
  if (len < 1e-3 || !rings.length) return null
  const d = wallDir(w)
  const n: Vec2 = side === 'left' ? [-d[1], d[0]] : [d[1], -d[0]]
  const inHouse = (p: Vec2) => rings.some(r => pointInPolygon(p[0], p[1], r))
  let best = Infinity
  for (let i = 0; i <= 10; i++) {
    const s = len * (0.05 + 0.09 * i)
    const c: Vec2 = [w.a[0] + d[0] * s + n[0] * (w.thickness / 2), w.a[1] + d[1] * s + n[1] * (w.thickness / 2)]
    if (inHouse(c)) {
      // The wall stands in the house's own wall line: the house is on the side it carries on into,
      // hard against the wall; on the other side it's only the house wall's outer skin.
      if (inHouse([c[0] + n[0] * HOUSE_DEPTH, c[1] + n[1] * HOUSE_DEPTH])) best = 0
      continue
    }
    for (const r of rings) {
      for (let k = 0; k < r.length; k++) {
        const p = r[k]
        const q = r[(k + 1) % r.length]
        // c + n·t = p + (q − p)·u
        const e: Vec2 = [q[0] - p[0], q[1] - p[1]]
        const den = n[0] * -e[1] - n[1] * -e[0]
        if (Math.abs(den) < 1e-12) continue
        const f: Vec2 = [p[0] - c[0], p[1] - c[1]]
        const t = (f[0] * -e[1] - f[1] * -e[0]) / den
        const u = (n[0] * f[1] - n[1] * f[0]) / den
        if (t >= 0 && u >= 0 && u <= 1) best = Math.min(best, t)
      }
    }
  }
  return best <= HOUSE_REACH ? best : null
}

const mm = (v: number) => Math.round(v * 1000) / 1000

/**
 * What a new retaining wall holds, before it's asked: the side whose natural ground is higher (or `high`).
 * When the house is on the other side, that side is cut to the house pad out to the house; when the
 * house is on the earth side and its pad stands above the open side, the wall holds up the pad,
 * levelled out to the house. The house and its pad are the wall's own level's.
 */
export function retainDefaults(w: Wall, plan: Plan, origin: Vec2, natural: Heightfield, high?: Side): Retain {
  const prof = retainingProfile({ ...w, retain: undefined }, plan, origin, natural)
  const rings = houseRings(plan, w.level)
  const gap = { left: houseGap(w, plan, 'left', rings), right: houseGap(w, plan, 'right', rings) }
  const pad = housePadRL(plan, w.level)
  if (!high) {
    if (prof.high) high = prof.high
    else {
      // On level ground: the house's side holds back where its pad is filled up above the ground
      // here, otherwise the side away from the house.
      const house: Side | null = gap.left !== null && (gap.right === null || gap.left <= gap.right) ? 'left' : gap.right !== null ? 'right' : null
      const ground = prof.samples.reduce((t, x) => t + (x.left + x.right) / 2, 0) / prof.samples.length
      high = house ? (pad > ground + 0.05 ? house : otherSide(house)) : 'left'
    }
  }
  const low = otherSide(high)
  const r: Retain = { high }
  const lowGap = gap[low]
  const highGap = gap[high]
  if (lowGap !== null && pad < highestOn(prof, high) - 0.05) {
    // Cut to the pad only when that leaves the high side higher.
    r.lowLevel = 'pad'
    r.lowBench = Math.max(MIN_BENCH, mm(lowGap))
  } else if (highGap !== null && pad > highestOn(prof, low) + 0.05) {
    // The house is behind the wall on its filled pad: the wall holds the pad up.
    r.highLevel = 'pad'
  }
  if (highGap !== null) r.highBench = Math.max(MIN_BENCH, mm(highGap))
  return r
}

/**
 * The levels for the one height question: the wall holds back `h` at its tallest. Only the earth side
 * changes. It becomes level ground `h` above the open side: above the open side's own level when it has
 * one, otherwise above the lowest finished ground in front of the wall (`prof`, on the finished ground),
 * which is left as it is. A wall holding up the house pad keeps following the floor while `h` is the
 * pad's own height. The answer is kept as `askedHeight`, so the panel shows what was typed.
 */
export function levelsForHeight(r: Retain, plan: Plan, prof: RetainingProfile, h: number): Retain {
  const wl = prof.wall.level
  const low = otherSide(r.high)
  const base = r.lowLevel !== undefined ? sideRL(plan, r.lowLevel, wl) : lowestOn(prof, low)
  const level = mm(base + h)
  const keepPad = r.highLevel === 'pad' && Math.abs(level - housePadRL(plan, wl)) < 0.01
  return { ...r, highLevel: keepPad ? 'pad' : level, askedHeight: mm(h) }
}

/**
 * Why the wall's measured height isn't the height asked for, or null when it is (within 30 mm).
 * The finished ground has the last word: other levelled ground (the house pad, a slab, painted ground)
 * can meet the wall, and the ground in front can rise and fall along it.
 */
export function heightNote(r: Retain | undefined, prof: RetainingProfile, plan: Plan, natural?: RetainingProfile): string | null {
  const asked = r?.askedHeight
  if (!r || asked === undefined || Math.abs(prof.maxHeight - asked) < 0.03) return null
  const got = prof.maxHeight.toFixed(2)
  const low = otherSide(r.high)
  const wl = prof.wall.level
  const pad = housePadRL(plan, wl)
  const set = r.highLevel !== undefined ? sideRL(plan, r.highLevel, wl) : null
  const off = set !== null ? prof.samples.filter(x => Math.abs(x[r.high] - set) > 0.03) : []
  // The earth behind spilling round the wall's ends raises the open side in front of it.
  const spills = !!natural && prof.samples.some((x, i) => x[low] - (natural.samples[i]?.[low] ?? x[low]) > 0.05)
  const why =
    spills
      ? ": earth behind it spills round the wall's ends and raises the ground in front (a longer wall, or return walls, would stop it)"
      : off.length && off.every(x => Math.abs(x[r.high] - pad) < 0.03)
      ? ': the house pad meets the wall there'
      : off.length
        ? houseGap(prof.wall, plan, r.high) !== null
          ? ': the house pad and its batters set the ground behind it'
          : ': other levelled ground meets the wall there'
        : highestOn(prof, low) - lowestOn(prof, low) > 0.03
          ? ': the ground in front rises and falls along it'
          : ''
  return prof.maxHeight < asked ? `Most the ground allows here is ${got} m${why}.` : `It holds back ${got} m at its tallest${why}.`
}

/** How one side's finished ground differs from the natural ground along the wall (m, both ≥ 0), and which way it mostly goes. */
export function sideChange(finished: RetainingProfile, natural: RetainingProfile, side: Side): { cut: number; fill: number; net: number } {
  let cut = 0
  let fill = 0
  let net = 0
  finished.samples.forEach((x, i) => {
    const d = x[side] - (natural.samples[i]?.[side] ?? x[side])
    cut = Math.max(cut, -d)
    fill = Math.max(fill, d)
    net += d
  })
  return { cut, fill, net: net / Math.max(1, finished.samples.length) }
}

/** The ground across a retaining wall at its tallest point, for a section drawing. */
export interface RetainingSection {
  /** Distance square off the wall (m), positive on the high side. */
  xs: number[]
  natural: number[]
  finished: number[]
  /** RL of the top of the wall here. */
  top: number
  /** Half the wall's thickness (m). */
  half: number
  /** Where the section passes under the house, as spans of xs. */
  house: [number, number][]
  /** House pad and floor RLs, for drawing the slab. */
  pad: number
  floor: number
  /** Distance along the wall of the section (m). */
  at: number
}

export function retainingSection(w: Wall, plan: Plan, origin: Vec2, natural: Heightfield, finished: Heightfield, reach = 6): RetainingSection {
  const prof = retainingProfile(w, plan, origin, finished)
  const high: Side = prof.high ?? 'left'
  // The tallest point; the middle one of equals, so a level wall is cut through its middle.
  const tallest = prof.samples.filter(x => Math.abs(x.left - x.right) >= prof.maxHeight - 1e-3)
  const at = tallest[Math.floor(tallest.length / 2)] ?? prof.samples[0]
  const d = wallDir(w)
  const sign = high === 'left' ? 1 : -1
  const n: Vec2 = [-d[1] * sign, d[0] * sign]
  const c: Vec2 = [w.a[0] + d[0] * at.s, w.a[1] + d[1] * at.s]
  const rings = houseRings(plan, w.level)
  const xs: number[] = []
  const nat: number[] = []
  const fin: number[] = []
  const house: [number, number][] = []
  const step = 0.1
  // Next to the wall the grid blends the ground on its two sides; the finished ground there is read where
  // the wall's height is, just clear of it on the same side.
  const off = w.thickness / 2 + Math.max(0.3, finished.cell * 1.4)
  const site = (x: number) => toSite([c[0] + n[0] * x, c[1] + n[1] * x], plan.placement, origin)
  let start: number | null = null
  for (let x = -reach; x <= reach + 1e-9; x += step) {
    const p: Vec2 = [c[0] + n[0] * x, c[1] + n[1] * x]
    const q = toSite(p, plan.placement, origin)
    const f = Math.abs(x) < off ? site(x < 0 ? -off : off) : q
    xs.push(x)
    nat.push(natural.sample(q[0], q[1]))
    fin.push(finished.sample(f[0], f[1]))
    const under = rings.some(r => pointInPolygon(p[0], p[1], r))
    if (under && start === null) start = x
    if (!under && start !== null) {
      house.push([start, x - step])
      start = null
    }
  }
  if (start !== null) house.push([start, reach])
  return { xs, natural: nat, finished: fin, top: topAt(w, at), half: w.thickness / 2, house, pad: housePadRL(plan, w.level), floor: floorRL(plan, levelById(plan, w.level) ? w.level : undefined), at: at.s }
}
