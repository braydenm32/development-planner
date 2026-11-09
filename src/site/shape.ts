import { pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import type { SiteFeature } from './model'

/** Distance from p to the segment a–b. */
export function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

/** Distance from p to a closed ring's outline. */
export function ringDistance(p: Vec2, ring: Vec2[]): number {
  let d = Infinity
  for (let i = 0; i < ring.length; i++) d = Math.min(d, segmentDistance(p, ring[i], ring[(i + 1) % ring.length]))
  return d
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b)
}

/** Whether a feature reaches the block, or comes within `margin` metres of it (a tree by its canopy). Both in one frame. */
export function nearBlock(f: SiteFeature, boundary: Vec2[], margin = 1): boolean {
  if (boundary.length < 3) return true
  const inside = (p: Vec2) => pointInPolygon(p[0], p[1], boundary)
  const g = f.geom
  if (g.kind === 'point') {
    const reach = margin + (f.type === 'tree' ? (f.canopy ?? 0) / 2 : 0)
    return inside(g.at) || ringDistance(g.at, boundary) <= reach
  }
  if (g.pts.some(inside)) return true
  if (g.kind === 'area' && boundary.some(p => pointInPolygon(p[0], p[1], g.pts))) return true
  const n = g.kind === 'area' ? g.pts.length : g.pts.length - 1
  for (let i = 0; i < n; i++) {
    const a = g.pts[i]
    const b = g.pts[(i + 1) % g.pts.length]
    for (let j = 0; j < boundary.length; j++) {
      const c = boundary[j]
      const d = boundary[(j + 1) % boundary.length]
      if (segmentsCross(a, b, c, d)) return true
      if (Math.min(segmentDistance(c, a, b), segmentDistance(a, c, d), segmentDistance(b, c, d)) <= margin) return true
    }
  }
  return false
}

function isConvex(ring: Vec2[]): boolean {
  let sign = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const c = ring[(i + 2) % ring.length]
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(z) < 1e-12) continue
    if (sign && Math.sign(z) !== sign) return false
    sign = Math.sign(z)
  }
  return true
}

/**
 * The part of a polygon inside the block. Exact for a convex block (Sutherland–Hodgman);
 * for any other shape the polygon comes back whole, for the caller to trim finer.
 * Null when nothing is left.
 */
export function clipToBoundary(poly: Vec2[], boundary: Vec2[]): Vec2[] | null {
  if (boundary.length < 3 || !isConvex(boundary)) return poly
  const ccw = signedArea(boundary) > 0 ? boundary : [...boundary].reverse()
  let out = poly
  for (let i = 0; i < ccw.length && out.length; i++) {
    const a = ccw[i]
    const b = ccw[(i + 1) % ccw.length]
    const side = (p: Vec2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    const next: Vec2[] = []
    for (let k = 0; k < out.length; k++) {
      const p = out[k]
      const q = out[(k + 1) % out.length]
      const sp = side(p)
      const sq = side(q)
      if (sp >= 0) next.push(p)
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq)
        next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
      }
    }
    out = next
  }
  return out.length >= 3 && Math.abs(signedArea(out)) > 1e-6 ? out : null
}

/**
 * The runs of a polyline on the block, or within `margin` metres of its edge (so a fence on
 * the boundary stays whole), found by stepping along it every `step` metres.
 */
export function linePartsOnBlock(pts: Vec2[], boundary: Vec2[], margin = 0.3, step = 0.25): Vec2[][] {
  if (boundary.length < 3) return [pts]
  const on = (p: Vec2) => pointInPolygon(p[0], p[1], boundary) || ringDistance(p, boundary) <= margin
  const parts: Vec2[][] = []
  let cur: Vec2[] = []
  const flush = () => {
    if (cur.length >= 2) parts.push(cur)
    cur = []
  }
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k]
    const b = pts[k + 1]
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
    for (let s = k === 0 ? 0 : 1; s <= n; s++) {
      const p: Vec2 = [a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n]
      if (!on(p)) {
        flush()
        continue
      }
      // Keep the polyline's own corners; drop the steps in between that lie on a straight run.
      if (s === n || !cur.length || !on([a[0] + ((b[0] - a[0]) * (s + 1)) / n, a[1] + ((b[1] - a[1]) * (s + 1)) / n])) cur.push(p)
    }
  }
  flush()
  return parts
}
