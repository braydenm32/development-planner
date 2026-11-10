// The sketch layer's shapes as straight pieces: to draw them, to snap to them, and to turn them
// into walls or an area outline. Pure functions of the points the person clicked (src/plan/model.ts
// SketchItem), all in the house's frame (metres).

import { signedArea, type Vec2 } from '../lib/geom'
import { closestOnSegment } from '../plan/geometry'
import type { SketchItem } from '../plan/model'

/**
 * How far a straight piece may stray from a curve when it's turned into walls or an outline (m):
 * a 100 mm sagitta keeps a 5 m radius arc to pieces about 2 m long, short enough to read as the curve.
 */
export const BUILD_SAGITTA = 0.1
/** The same for drawing it on the plan and snapping to it: fine enough to look smooth. */
export const DRAW_SAGITTA = 0.01

/** Pieces any one curve becomes, at most, so a huge circle can't make thousands. */
const MAX_PIECES = 256

const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** The circle through three points, or null when they're in a line (or two are the same). */
export function circleThrough(a: Vec2, b: Vec2, c: Vec2): { c: Vec2; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
  const span = Math.max(dist(a, b), dist(b, c), dist(a, c))
  // Nearly in a line: the "circle" would be enormous, and is better drawn as the line it nearly is.
  if (span < 1e-6 || Math.abs(d) / (span * span) < 1e-4) return null
  const a2 = a[0] * a[0] + a[1] * a[1]
  const b2 = b[0] * b[0] + b[1] * b[1]
  const c2 = c[0] * c[0] + c[1] * c[1]
  const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d
  const y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d
  const centre: Vec2 = [x, y]
  return { c: centre, r: dist(centre, a) }
}

/** How many equal pieces a sweep of `sweep` radians on radius `r` needs to stay within `sagitta`. */
function piecesFor(r: number, sweep: number, sagitta: number): number {
  if (r <= sagitta) return Math.max(4, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * 8))
  const step = 2 * Math.acos(1 - sagitta / r)
  return Math.min(MAX_PIECES, Math.max(1, Math.ceil(Math.abs(sweep) / step)))
}

/** An arc from a through m to b: its centre, radius, start angle and signed sweep; null when it's straight. */
export function arcOf(a: Vec2, m: Vec2, b: Vec2): { c: Vec2; r: number; start: number; sweep: number } | null {
  const circle = circleThrough(a, m, b)
  if (!circle) return null
  const ang = (p: Vec2) => Math.atan2(p[1] - circle.c[1], p[0] - circle.c[0])
  const start = ang(a)
  const norm = (t: number) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  // Anticlockwise from a to b; if m isn't on that way round, the arc goes clockwise.
  const toB = norm(ang(b) - start)
  const toM = norm(ang(m) - start)
  const sweep = toM <= toB ? toB : toB - 2 * Math.PI
  return { ...circle, start, sweep }
}

/** A smooth curve through the points (Catmull-Rom), sampled densely. */
function curveThrough(pts: Vec2[], perSpan = 24): Vec2[] {
  if (pts.length < 3) return pts.map(p => [p[0], p[1]] as Vec2)
  const closed = pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 1e-6
  const ps = closed ? pts.slice(0, -1) : pts
  const n = ps.length
  const at = (i: number): Vec2 => {
    if (closed) return ps[((i % n) + n) % n]
    // Past the ends, mirror the next point, so the curve leaves each end heading for its neighbour.
    if (i < 0) return [2 * ps[0][0] - ps[1][0], 2 * ps[0][1] - ps[1][1]]
    if (i >= n) return [2 * ps[n - 1][0] - ps[n - 2][0], 2 * ps[n - 1][1] - ps[n - 2][1]]
    return ps[i]
  }
  const out: Vec2[] = [[ps[0][0], ps[0][1]]]
  const spans = closed ? n : n - 1
  for (let i = 0; i < spans; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    for (let s = 1; s <= perSpan; s++) {
      const t = s / perSpan
      const t2 = t * t
      const t3 = t2 * t
      const f = (k: 0 | 1) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
      out.push([f(0), f(1)])
    }
  }
  return out
}

/** Drop points that stray less than `tol` from the line through their neighbours (Douglas-Peucker). */
export function simplify(pts: Vec2[], tol: number): Vec2[] {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()!
    let far = -1
    let farD = tol
    for (let k = i + 1; k < j; k++) {
      const d = closestOnSegment(pts[k], pts[i], pts[j]).dist
      if (d > farD) {
        farD = d
        far = k
      }
    }
    if (far >= 0) {
      keep[far] = 1
      stack.push([i, far], [far, j])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/**
 * The item as a run of straight pieces, each within `sagitta` of the shape: a line as clicked, an
 * arc or circle in equal pieces, a curve simplified from a dense sampling. A circle's run ends on its
 * start, closing it.
 */
export function sketchPolyline(item: Pick<SketchItem, 'kind' | 'pts'>, sagitta = DRAW_SAGITTA): Vec2[] {
  const { kind, pts } = item
  if (kind === 'arc') {
    const arc = arcOf(pts[0], pts[1], pts[2])
    if (!arc) return [pts[0], pts[2]]
    const n = piecesFor(arc.r, arc.sweep, sagitta)
    const out: Vec2[] = []
    for (let i = 0; i <= n; i++) {
      const t = arc.start + (arc.sweep * i) / n
      out.push([arc.c[0] + Math.cos(t) * arc.r, arc.c[1] + Math.sin(t) * arc.r])
    }
    // Exactly on the clicked ends, so they join what they were snapped to.
    out[0] = [pts[0][0], pts[0][1]]
    out[n] = [pts[2][0], pts[2][1]]
    return out
  }
  if (kind === 'circle') {
    const [c, on] = pts
    const r = dist(c, on)
    const start = Math.atan2(on[1] - c[1], on[0] - c[0])
    const n = Math.max(8, piecesFor(r, 2 * Math.PI, sagitta))
    const out: Vec2[] = []
    for (let i = 0; i <= n; i++) {
      const t = start + (2 * Math.PI * i) / n
      out.push(i === n ? [out[0][0], out[0][1]] : [c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r])
    }
    return out
  }
  if (kind === 'curve') return simplify(curveThrough(pts, 32), sagitta)
  return pts.map(p => [p[0], p[1]] as Vec2)
}

/** Whether it goes round: a circle, or a line or curve that ends where it started. */
export function sketchClosed(item: Pick<SketchItem, 'kind' | 'pts'>): boolean {
  if (item.kind === 'circle') return true
  if (item.kind === 'arc' || item.kind === 'measure') return false
  return item.pts.length > 3 && dist(item.pts[0], item.pts[item.pts.length - 1]) < 1e-3
}

/** Its length along the line (m); a circle's is its circumference. */
export function sketchLength(item: Pick<SketchItem, 'kind' | 'pts'>): number {
  if (item.kind === 'circle') return 2 * Math.PI * dist(item.pts[0], item.pts[1])
  if (item.kind === 'arc') {
    const arc = arcOf(item.pts[0], item.pts[1], item.pts[2])
    return arc ? Math.abs(arc.sweep) * arc.r : dist(item.pts[0], item.pts[2])
  }
  const run = item.kind === 'curve' ? sketchPolyline(item, 0.001) : item.pts
  return run.slice(1).reduce((n, p, i) => n + dist(run[i], p), 0)
}

/** An arc's or circle's centre and radius, for its card and to snap to. */
export function sketchCentre(item: Pick<SketchItem, 'kind' | 'pts'>): { c: Vec2; r: number } | null {
  if (item.kind === 'circle') return { c: item.pts[0], r: dist(item.pts[0], item.pts[1]) }
  if (item.kind === 'arc') return circleThrough(item.pts[0], item.pts[1], item.pts[2])
  return null
}

/** The straight pieces walls are built along: each piece of the run, short ones left out. */
export function sketchToSegments(item: Pick<SketchItem, 'kind' | 'pts'>, sagitta = BUILD_SAGITTA): [Vec2, Vec2][] {
  const run = sketchPolyline(item, sagitta)
  const out: [Vec2, Vec2][] = []
  for (let i = 1; i < run.length; i++) if (dist(run[i - 1], run[i]) >= 0.01) out.push([run[i - 1], run[i]])
  return out
}

/**
 * The outline an area is made from: the corners of the run, closed back to the first, anticlockwise.
 * Null for a shape with no inside (fewer than three corners, or all in a line).
 */
export function sketchToOutline(item: Pick<SketchItem, 'kind' | 'pts'>, sagitta = BUILD_SAGITTA): Vec2[] | null {
  const run = sketchPolyline(item, sagitta)
  const pts = run.filter((p, i) => i === 0 || dist(p, run[i - 1]) >= 0.01)
  if (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) < 0.01) pts.pop()
  if (pts.length < 3 || Math.abs(signedArea(pts)) < 0.01) return null
  return signedArea(pts) < 0 ? pts.reverse() : pts
}

/** Where drawing snaps to on the sketch layer: points (ends, middles, crossings, centres) and the lines themselves. */
export interface SnapGuides {
  points: Vec2[]
  segs: [Vec2, Vec2][]
}

export const NO_GUIDES: SnapGuides = { points: [], segs: [] }

/** Where two segments cross, or null. */
function crossing(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r: Vec2 = [b[0] - a[0], b[1] - a[1]]
  const s: Vec2 = [d[0] - c[0], d[1] - c[1]]
  const den = r[0] * s[1] - r[1] * s[0]
  if (Math.abs(den) < 1e-12) return null
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null
  return [a[0] + r[0] * t, a[1] + r[1] * t]
}

/**
 * The snap points and lines of a set of sketch items: every clicked end and corner, the middle of
 * each straight side, an arc's middle and centre, a circle's centre and quarter points, where any two
 * cross, and the lines themselves for "onto the line". A kept measurement gives its ends only.
 */
export function sketchGuides(items: SketchItem[]): SnapGuides {
  const points: Vec2[] = []
  const segs: [Vec2, Vec2][] = []
  // Which item each segment came from, so a chain's own neighbouring pieces aren't "crossings".
  const owner: number[] = []
  items.forEach((it, idx) => {
    if (it.kind === 'measure') {
      points.push(...it.pts)
      return
    }
    if (it.kind === 'line') {
      points.push(...it.pts)
      for (let i = 1; i < it.pts.length; i++) points.push([(it.pts[i - 1][0] + it.pts[i][0]) / 2, (it.pts[i - 1][1] + it.pts[i][1]) / 2])
    } else if (it.kind === 'arc') {
      points.push(it.pts[0], it.pts[2])
      const arc = arcOf(it.pts[0], it.pts[1], it.pts[2])
      if (arc) {
        const t = arc.start + arc.sweep / 2
        points.push(arc.c, [arc.c[0] + Math.cos(t) * arc.r, arc.c[1] + Math.sin(t) * arc.r])
      }
    } else if (it.kind === 'circle') {
      const [c, on] = it.pts
      const r = dist(c, on)
      points.push(c, ...[0, 1, 2, 3].map(q => [c[0] + Math.cos((q * Math.PI) / 2) * r, c[1] + Math.sin((q * Math.PI) / 2) * r] as Vec2))
    } else points.push(...it.pts)
    const run = sketchPolyline(it, DRAW_SAGITTA * 2)
    for (let i = 1; i < run.length; i++) {
      segs.push([run[i - 1], run[i]])
      owner.push(idx)
    }
  })
  // Crossings: pieces of different items, or of one item that aren't next to each other.
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (owner[i] === owner[j] && j - i <= 1) continue
      const [a, b] = segs[i]
      const [c, d] = segs[j]
      // A quick box test first: most pairs are nowhere near each other.
      if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0])) continue
      if (Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) continue
      const x = crossing(a, b, c, d)
      // Pieces that only meet end to end already have that point.
      if (x && !points.some(p => dist(p, x) < 1e-4)) points.push(x)
    }
  }
  return { points, segs }
}

/** The point on the sketch's lines nearest `p`, within `tol`, or null. */
export function nearestOnGuides(p: Vec2, guides: SnapGuides, tol: number): Vec2 | null {
  let best: Vec2 | null = null
  let bestD = tol
  for (const [a, b] of guides.segs) {
    const c = closestOnSegment(p, a, b)
    if (c.dist < bestD) {
      bestD = c.dist
      best = c.point
    }
  }
  return best
}

/** How far `p` is from the item's line (m): the item a click picks is the nearest within a few pixels. */
export function distanceToSketch(item: SketchItem, p: Vec2): number {
  const run = item.kind === 'measure' ? item.pts : sketchPolyline(item, DRAW_SAGITTA * 2)
  let best = Infinity
  for (let i = 1; i < run.length; i++) best = Math.min(best, closestOnSegment(p, run[i - 1], run[i]).dist)
  return best
}
