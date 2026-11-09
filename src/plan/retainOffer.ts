// When a room on a slab sits well below the ground along one of its outside walls (cut) or well
// above it (fill), the app offers a retaining wall on that side of the house: on the uphill side
// for cut, holding the hill back, and on the downhill side for fill, holding the pad up. The
// offer is worked out here; the card that makes it lives in src/flow.

import { pointInPolygon, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import { bearingName, type Heightfield } from '../lib/terrain'
import { buildingOutline, planarFaces, type Face } from './geometry'
import { groundAtPlan } from './groundOverlay'
import { floorRL, houseWalls, isRetaining, newId, wallDir, wallLength, type Plan, type Retain, type Wall } from './model'
import { MIN_BENCH } from './platforms'
import { otherSide, retainingProfile, sideBearing, type Side } from './retaining'
import { earthFrom, earthInputs } from './useEarthworks'

/** A floor more than this far below (cut) or above (fill) the ground along a side gets the offer, unless set otherwise (m). */
export const OFFER_THRESHOLD = 0.5

/** The gap between the house and a suggested wall, unless set otherwise (m). */
export const OFFER_GAP = 1

/** Thickness of a suggested wall: concrete block (m). */
export const OFFER_THICKNESS = 0.2

/**
 * Where a suggested wall goes:
 * `gap`: its own wall a gap out from the house, with the gap levelled to the house pad as a bench;
 * `house`: hard against the house's own wall, which then holds the earth itself (waterproofed, engineered).
 */
export type OfferPlacement = 'gap' | 'house'

/**
 * How the card offers the placement: the default is to choose each time ('ask'), with the gap first.
 * Set this to 'gap' or 'house' to offer only that one.
 */
export const OFFER_PLACEMENT: 'ask' | OfferPlacement = 'ask'

/** The house wall itself as the retaining wall needs this said, every time it's offered. */
export const HOUSE_WALL_NOTE = 'The house wall holds the earth: it needs waterproofing and an engineer’s design.'

/** A side of the house: its outside face, running with the outside on its left. */
export interface HouseSide {
  a: Vec2
  b: Vec2
  /**
   * Whether the house turns away at each end (an outside corner) or carries on outward, as an
   * L-shaped house does at its inside corner. Unknown counts as an outside corner.
   */
  startConvex?: boolean
  endConvex?: boolean
}

/** How one outside edge of a room sits against the natural ground. */
export interface EdgeGround {
  /** The outside face of the wall along this edge, with the outside on its left (house frame). */
  side: HouseSide
  /** Most the natural ground rises above the floor along it (m); negative where it never does. */
  cut: number
  /** Most the natural ground falls below the floor along it (m); negative where it never does. */
  fill: number
}

export interface RetainOffer {
  kind: 'cut' | 'fill'
  /** How far the floor is below the ground (cut) or above it (fill) at worst along that edge (m). */
  depth: number
  /** The whole side of the house the wall goes beside (its outside face, outside on the left). */
  side: HouseSide
  /** The compass point that side faces: "north". */
  facing: string
  level: string
}

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
const len = (v: Vec2) => Math.hypot(v[0], v[1])
const unit = (v: Vec2): Vec2 => {
  const l = len(v) || 1
  return [v[0] / l, v[1] / l]
}
const along = (p: Vec2, d: Vec2, s: number): Vec2 => [p[0] + d[0] * s, p[1] + d[1] * s]
/** Left of a direction: the outside, for a side running with the outside on its left. */
const leftOf = (d: Vec2): Vec2 => [-d[1], d[0]]

/** The level's enclosed spaces and outer outline. */
function levelFaces(plan: Plan, level: string): Face[] {
  return planarFaces(plan.walls.filter(w => w.level === level))
}

/**
 * The outside edges of an enclosed space (a face of the wall graph, counter-clockwise), each as the
 * outside face of its wall, measured against the natural ground every 0.25 m along it.
 */
export function edgeGround(plan: Plan, face: Face, faces: Face[], survey: Pick<Survey, 'origin' | 'boundary'>, natural: Heightfield, floor = floorRL(plan)): EdgeGround[] {
  const inner = faces.filter(f => f.area > 0)
  const out: EdgeGround[] = []
  const n = face.pts.length
  for (let i = 0; i < n; i++) {
    const p = face.pts[i]
    const q = face.pts[(i + 1) % n]
    const d = unit(sub(q, p))
    // Inside is on the left of a counter-clockwise face, so its outside face is half a wall to the right.
    const right: Vec2 = [d[1], -d[0]]
    const half = face.thickness[i] / 2
    const mid: Vec2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
    const probe = along(mid, right, half + 0.05)
    if (inner.some(f => pointInPolygon(probe[0], probe[1], f.pts))) continue
    const a = along(p, right, half)
    const b = along(q, right, half)
    const L = len(sub(b, a))
    const steps = Math.max(1, Math.ceil(L / 0.25))
    let cut = -Infinity
    let fill = -Infinity
    for (let k = 0; k <= steps; k++) {
      const g = groundAtPlan(along(a, d, (L * k) / steps), plan.placement, survey, natural)
      if (g === null) continue
      cut = Math.max(cut, g - floor)
      fill = Math.max(fill, floor - g)
    }
    if (cut === -Infinity) continue
    // Running the other way round, the outside is on the left.
    out.push({ side: { a: b, b: a }, cut, fill })
  }
  return out
}

/** The house's outside outline on a level, as whole straight sides (corners in a straight line merged). */
export function houseSides(plan: Plan, level: string): HouseSide[] {
  const out: HouseSide[] = []
  // The outline runs clockwise with the outside on its left.
  for (const ring of buildingOutline(levelFaces(plan, level)).outlines) {
    const n = ring.length
    if (n < 3) continue
    const straight = (i: number) => {
      const u = unit(sub(ring[i], ring[(i - 1 + n) % n]))
      const v = unit(sub(ring[(i + 1) % n], ring[i]))
      return Math.abs(u[0] * v[1] - u[1] * v[0]) < 1e-6 && u[0] * v[0] + u[1] * v[1] > 0
    }
    // Clockwise, an outside corner turns right.
    const convex = (i: number) => {
      const u = sub(ring[i], ring[(i - 1 + n) % n])
      const v = sub(ring[(i + 1) % n], ring[i])
      return u[0] * v[1] - u[1] * v[0] < 0
    }
    const corners = ring.map((_, i) => i).filter(i => !straight(i))
    for (let k = 0; k < corners.length; k++) {
      const i = corners[k]
      const j = corners[(k + 1) % corners.length]
      out.push({ a: ring[i], b: ring[j], startConvex: convex(i), endConvex: convex(j) })
    }
  }
  return out
}

/** The whole side of the house a room's outside edge is part of (or the edge itself). */
export function sideOf(edge: HouseSide, sides: HouseSide[]): HouseSide {
  const d = unit(sub(edge.b, edge.a))
  const m: Vec2 = [(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2]
  for (const s of sides) {
    const e = unit(sub(s.b, s.a))
    if (e[0] * d[0] + e[1] * d[1] < 0.999) continue
    const t = (m[0] - s.a[0]) * e[0] + (m[1] - s.a[1]) * e[1]
    const off = Math.abs((m[0] - s.a[0]) * e[1] - (m[1] - s.a[1]) * e[0])
    if (off < 0.01 && t > 0 && t < len(sub(s.b, s.a))) return s
  }
  return edge
}

/** Is there already a retaining wall along the outside of this side, within `reach` of it? */
export function retainedAlready(plan: Plan, level: string, side: HouseSide, reach = OFFER_GAP * 3 + 1): boolean {
  const d = unit(sub(side.b, side.a))
  const n = leftOf(d)
  const L = len(sub(side.b, side.a))
  return plan.walls.some(w => {
    if (!isRetaining(w) || w.level !== level || wallLength(w) < 0.1) return false
    const e = wallDir(w)
    if (Math.abs(e[0] * d[0] + e[1] * d[1]) < 0.9) return false
    const at = (p: Vec2) => ({ s: (p[0] - side.a[0]) * d[0] + (p[1] - side.a[1]) * d[1], o: (p[0] - side.a[0]) * n[0] + (p[1] - side.a[1]) * n[1] })
    const pa = at(w.a)
    const pb = at(w.b)
    const out = (pa.o + pb.o) / 2
    const overlap = Math.min(Math.max(pa.s, pb.s), L) - Math.max(Math.min(pa.s, pb.s), 0)
    return out > -0.05 && out <= reach && overlap > Math.min(1, L / 2)
  })
}

/**
 * The offer for an enclosed space on a slab: the outside edge where the floor is furthest past
 * `threshold` below the ground (cut) or above it (fill), as a wall along that whole side of the
 * house. Null when no edge goes past it, or a retaining wall already stands along that side.
 */
export function retainOfferFor(
  plan: Plan,
  face: Face,
  level: string,
  survey: Pick<Survey, 'origin' | 'boundary'>,
  natural: Heightfield,
  threshold = OFFER_THRESHOLD,
): RetainOffer | null {
  const faces = levelFaces(plan, level)
  const sides = houseSides(plan, level)
  let best: RetainOffer | null = null
  for (const e of edgeGround(plan, face, faces, survey, natural, floorRL(plan, level))) {
    for (const [kind, depth] of [
      ['cut', e.cut],
      ['fill', e.fill],
    ] as const) {
      if (depth <= threshold || (best && depth <= best.depth)) continue
      const side = sideOf(e.side, sides)
      if (retainedAlready(plan, level, side)) continue
      best = { kind, depth, side, facing: facingOf(side, plan), level }
    }
  }
  return best
}

/** The compass point the outside of a side faces. */
function facingOf(side: HouseSide, plan: Plan): string {
  return bearingName(sideBearing({ a: side.a, b: side.b }, 'left', plan))
}

/**
 * The suggested wall, ready to place: along the side's outside face, `gap` out from it (or hard
 * against the house), the same way round as the side so the earth is on the left for cut. For cut
 * it holds back the natural ground outside and the gap is cut to the house pad; for fill it holds
 * up the house pad, levelled out to it, above the natural ground outside.
 */
export function offeredWall(offer: Pick<RetainOffer, 'kind' | 'side' | 'level'>, placement: OfferPlacement, gap = OFFER_GAP, thickness = OFFER_THICKNESS): Wall {
  const { a, b } = offer.side
  const d = unit(sub(b, a))
  const n = leftOf(d)
  const g = placement === 'gap' ? Math.max(gap, 0) : 0
  const off = g + thickness / 2
  // Out past an outside corner by the gap, so the bench wraps it; at an inside corner the wall
  // stops where the house carries on outward, meeting it rather than running into it.
  const wa = along(along(a, d, offer.side.startConvex === false ? 0 : -g), n, off)
  const wb = along(along(b, d, offer.side.endConvex === false ? 0 : g), n, off)
  const bench = Math.max(MIN_BENCH, Math.round(g * 1000) / 1000)
  const outside: Side = 'left'
  const house = otherSide(outside)
  const retain: Retain =
    offer.kind === 'cut' ? { high: outside, lowLevel: 'pad', lowBench: bench } : { high: house, highLevel: 'pad', highBench: bench }
  const r3 = (p: Vec2): Vec2 => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]
  return { id: newId('wall'), level: offer.level, a: r3(wa), b: r3(wb), thickness, kind: 'retaining', retain }
}

/**
 * How much earth a suggested wall would hold back: the plan's cut and fill worked out again with the
 * wall in place, and the wall's profile on that finished ground, just as its panel measures it once
 * it's placed.
 */
export function offeredHeight(plan: Plan, wall: Wall, survey: Pick<Survey, 'origin' | 'boundary'>, natural: Heightfield): number {
  const next: Plan = { ...plan, walls: [...plan.walls, wall] }
  const earth = earthFrom(natural, survey.boundary, earthInputs(next, survey))
  return retainingProfile(wall, next, survey.origin, earth.result.grid).maxHeight
}

/** How far to move a wall square to itself, away from the house on its `houseSide`, to go from a gap of `now` to `gap`. */
export function gapShift(w: Pick<Wall, 'a' | 'b'>, houseSide: Side, gap: number, now: number): Vec2 {
  const d = wallDir(w)
  const away: Vec2 = houseSide === 'left' ? [d[1], -d[0]] : [-d[1], d[0]]
  return [away[0] * (gap - now), away[1] * (gap - now)]
}

/** The house walls a face is made of, as one key: the same space keeps it while its walls do. */
export const faceKey = (face: Pick<Face, 'walls'>) => `face:${[...new Set(face.walls)].sort().join(',')}`

/** Enclosed spaces in `after` on a level that weren't enclosed in `before`: walls just closed round them. */
export function newEnclosures(before: Plan, after: Plan, level: string): Face[] {
  const was = levelFacesOf(before, level).filter(f => f.area > 0)
  return levelFacesOf(after, level).filter(f => {
    if (f.area <= 0) return false
    const p = insidePoint(f.pts)
    return !!p && !was.some(g => pointInPolygon(p[0], p[1], g.pts))
  })
}

const levelFacesOf = (plan: Plan, level: string) => planarFaces(houseWalls(plan.walls).filter(w => w.level === level))

/** A point just inside a counter-clockwise polygon. */
export function insidePoint(pts: Vec2[]): Vec2 | null {
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % n]
    const d = unit(sub(q, p))
    const m = along([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], leftOf(d), 0.02)
    if (pointInPolygon(m[0], m[1], pts)) return m
  }
  return null
}
