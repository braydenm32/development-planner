// Tracing help for site features: an easement's corners snap onto the boundary (the line, not
// just its corners), since an easement runs along it; and whether a feature reaches the block
// at all, so one traced wholly off it says so. All in the survey's local frame (metres).

import { pointInPolygon, type Vec2 } from '../lib/geom'

/** The nearest point on a closed ring's sides within `tol` of a point, or null. */
export function snapToEdges(p: Vec2, ring: Vec2[], tol: number): Vec2 | null {
  let best: Vec2 | null = null
  let bestD = tol
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]
    const q = closest(p, a, b)
    const d = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (d < bestD) {
      bestD = d
      best = q
    }
  })
  return best
}

function closest(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  if (l2 < 1e-12) return a
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return [a[0] + t * dx, a[1] + t * dy]
}

/** Whether segments ab and cd cross or touch. */
function crosses(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = o(c, d, a)
  const d2 = o(c, d, b)
  const d3 = o(a, b, c)
  const d4 = o(a, b, d)
  return ((d1 > 0) !== (d2 > 0) || d1 === 0 || d2 === 0) && ((d3 > 0) !== (d4 > 0) || d3 === 0 || d4 === 0)
}

/**
 * Whether a feature's shape reaches the block: a point on it (or within `tol` of it), a line or
 * outline crossing its boundary, or an outline round the whole block.
 */
export function touchesBlock(pts: Vec2[], closed: boolean, boundary: Vec2[], tol = 0.05): boolean {
  if (boundary.length < 3 || !pts.length) return true
  if (pts.some(p => pointInPolygon(p[0], p[1], boundary) || snapToEdges(p, boundary, tol) !== null)) return true
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    for (let j = 0; j < boundary.length; j++) if (crosses(a, b, boundary[j], boundary[(j + 1) % boundary.length])) return true
  }
  // An outline drawn round the whole block.
  return closed && pts.length >= 3 && pointInPolygon(boundary[0][0], boundary[0][1], pts)
}
