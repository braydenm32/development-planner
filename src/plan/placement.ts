import { centroidOf, pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import { bearingName, type Terrain } from '../lib/terrain'
import { toSite, type Placement } from './model'

/** Start the plan in the middle of the block, square to its longest side, with the floor at ground level. */
export function defaultPlacement(survey: Survey, terrain: Terrain): Placement {
  const b = survey.boundary
  const c = centroidOf(b)
  let longest = 0
  let angle = 0
  b.forEach((p, i) => {
    const q: Vec2 = b[(i + 1) % b.length]
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (len > longest) {
      longest = len
      angle = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI
    }
  })
  while (angle > 45) angle -= 90
  while (angle <= -45) angle += 90
  return {
    e: Math.round((c[0] + survey.origin[0]) * 100) / 100,
    n: Math.round((c[1] + survey.origin[1]) * 100) / 100,
    rotation: Math.round(angle * 10) / 10,
    ffl: Math.round(terrain.grid.sample(c[0], c[1]) * 20) / 20,
  }
}

/**
 * Centre on block: slide the house (keeping its turn and floor level) so the middle of what is
 * drawn, `mid` in the house frame, sits on the block's centroid.
 */
export function centredPlacement(pl: Placement, mid: Vec2, survey: Survey): Placement {
  const c = centroidOf(survey.boundary)
  const at = toSite(mid, pl, survey.origin)
  return { ...pl, e: Math.round((pl.e + c[0] - at[0]) * 100) / 100, n: Math.round((pl.n + c[1] - at[1]) * 100) / 100 }
}

export interface BoundaryClearance {
  /** Which way this side of the block faces, e.g. "north". */
  name: string
  /** Shortest distance from the house to this side (m); 0 where the house reaches it. */
  dist: number
  /**
   * How far the house goes past this side, out of the lot (m); 0 when it doesn't. A house over
   * the boundary used to read as 0 mm away, which looks like a house built to the boundary.
   */
  over: number
  /** The closest points on the house and on the boundary, in the site frame (with `over`, the house's furthest point past the side and the side). */
  from: Vec2
  to: Vec2
  /** Unit vector from this side into the block. */
  inward: Vec2
  /** Direction of the side, degrees anticlockwise from east. */
  angle: number
}

function closestOnSeg(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return [a[0] + t * dx, a[1] + t * dy]
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = o(a, b, c)
  const d2 = o(a, b, d)
  const d3 = o(c, d, a)
  const d4 = o(c, d, b)
  return d1 * d2 < 0 && d3 * d4 < 0
}

/** Less than this past the boundary (m) is on it: survey and drawing tolerance, not a house over the line. */
export const OVER_MIN = 0.005

/** The distance to a side as the panels and checks show it: negative by how far the house goes past it. */
export const signedClearance = (c: Pick<BoundaryClearance, 'dist' | 'over'>): number => (c.over > 0 ? -c.over : c.dist)

/**
 * For each side of the block, how far the house's corners go past it, out of the lot (each corner
 * outside counts against the side nearest it), with that corner and its nearest point on the side.
 */
function overBySide(site: Vec2[][], b: Vec2[]): { over: number; from: Vec2; to: Vec2 }[] {
  const out = b.map(p => ({ over: 0, from: p as Vec2, to: p as Vec2 }))
  for (const ring of site) {
    for (const p of ring) {
      if (pointInPolygon(p[0], p[1], b)) continue
      let side = -1
      let best = Infinity
      let at: Vec2 = p
      b.forEach((a, i) => {
        const q = closestOnSeg(p, a, b[(i + 1) % b.length])
        const d = Math.hypot(p[0] - q[0], p[1] - q[1])
        if (d < best) {
          best = d
          side = i
          at = q
        }
      })
      if (side >= 0 && best >= OVER_MIN && best > out[side].over) out[side] = { over: best, from: p, to: at }
    }
  }
  return out
}

/**
 * Whether the house (its outline rings, in the house frame) reaches outside the lot: `by` is the
 * furthest any corner goes past the boundary (m), and `all` is set when no part of it is inside.
 */
export function outsideLot(rings: Vec2[][], pl: Placement, survey: Survey): { any: boolean; by: number; all: boolean } {
  const site = rings.filter(r => r.length >= 3).map(r => r.map(p => toSite(p, pl, survey.origin)))
  const b = survey.boundary
  if (!site.length || b.length < 3) return { any: false, by: 0, all: false }
  const by = Math.max(0, ...overBySide(site, b).map(o => o.over))
  // A corner of the lot inside the house puts part of it outside too, even with every house corner inside.
  const lotCorner = b.some(q => site.some(r => pointInPolygon(q[0], q[1], r) && distToRing(q, r) >= OVER_MIN))
  const any = by > 0 || lotCorner
  const cornerInside = site.some(r => r.some(p => pointInPolygon(p[0], p[1], b) && distToRing(p, b) >= OVER_MIN))
  return { any, by, all: any && !cornerInside && !lotCorner }
}

function distToRing(p: Vec2, ring: Vec2[]): number {
  let d = Infinity
  for (let i = 0; i < ring.length; i++) {
    const q = closestOnSeg(p, ring[i], ring[(i + 1) % ring.length])
    d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1]))
  }
  return d
}

/**
 * Distance from the house (its outline rings, in the house frame) to each side of
 * the block, with the closest pair of points so the gap can be drawn, and how far the
 * house goes past each side where it's over the boundary.
 */
export function boundaryClearances(rings: Vec2[][], pl: Placement, survey: Survey): BoundaryClearance[] {
  const site = rings.filter(r => r.length >= 2).map(r => r.map(p => toSite(p, pl, survey.origin)))
  if (!site.length) return []
  const b = survey.boundary
  const ccw = signedArea(b) > 0
  const overs = overBySide(site, b)
  return b.map((p, i) => {
    const q = b[(i + 1) % b.length]
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const len = Math.hypot(dx, dy) || 1
    // A counter-clockwise ring has the inside on its left.
    const inward: Vec2 = ccw ? [-dy / len, dx / len] : [dy / len, -dx / len]
    const bearing = ((Math.atan2(-inward[0], -inward[1]) * 180) / Math.PI + 360) % 360
    let best = { dist: Infinity, from: p as Vec2, to: p as Vec2 }
    const consider = (from: Vec2, to: Vec2) => {
      const d = Math.hypot(from[0] - to[0], from[1] - to[1])
      if (d < best.dist) best = { dist: d, from, to }
    }
    for (const ring of site) {
      for (let k = 0; k < ring.length; k++) {
        const r0 = ring[k]
        const r1 = ring[(k + 1) % ring.length]
        if (segmentsCross(p, q, r0, r1)) {
          const c = closestOnSeg(r0, p, q)
          best = { dist: 0, from: c, to: c }
          break
        }
        consider(r0, closestOnSeg(r0, p, q))
        consider(closestOnSeg(p, r0, r1), p)
        consider(closestOnSeg(q, r0, r1), q)
      }
      if (best.dist === 0) break
    }
    const o = overs[i]
    return { name: bearingName(bearing), ...best, ...(o.over > 0 ? { from: o.from, to: o.to } : {}), over: o.over, inward, angle: (Math.atan2(dy, dx) * 180) / Math.PI }
  })
}

/** Slide the house square to one side of the block until it is `target` metres from it. */
export function placeAtClearance(rings: Vec2[][], pl: Placement, survey: Survey, side: number, target: number): Placement {
  let cur = pl
  for (let i = 0; i < 12; i++) {
    const c = boundaryClearances(rings, cur, survey)[side]
    if (!c) return cur
    // From over the boundary too: the house moves in by what's over as well.
    const delta = target - signedClearance(c)
    if (Math.abs(delta) < 0.0005) break
    cur = { ...cur, e: cur.e + c.inward[0] * delta, n: cur.n + c.inward[1] * delta }
  }
  return { ...cur, e: Math.round(cur.e * 1000) / 1000, n: Math.round(cur.n * 1000) / 1000 }
}
