export type Vec2 = [number, number]

/** Signed area (positive when counter-clockwise). */
export function signedArea(poly: Vec2[]): number {
  let a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]
  }
  return a / 2
}

export function perimeter(poly: Vec2[]): number {
  let p = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    p += Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1])
  }
  return p
}

export function pointInPolygon(x: number, y: number, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Drop a repeated closing vertex and consecutive duplicates, and make the ring counter-clockwise. */
export function normalizeRing(pts: Vec2[], eps = 1e-9): Vec2[] {
  const out: Vec2[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (!last || Math.abs(last[0] - p[0]) > eps || Math.abs(last[1] - p[1]) > eps) out.push([p[0], p[1]])
  }
  if (out.length > 1) {
    const a = out[0]
    const b = out[out.length - 1]
    if (Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps) out.pop()
  }
  if (signedArea(out) < 0) out.reverse()
  return out
}

export interface Rect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function bounds(pts: Vec2[]): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/** Sutherland–Hodgman: clip any simple polygon against an axis-aligned rectangle. */
export function clipPolygonToRect(poly: Vec2[], r: Rect): Vec2[] {
  type Inside = (p: Vec2) => boolean
  type Cut = (a: Vec2, b: Vec2) => Vec2
  const lerpX = (a: Vec2, b: Vec2, x: number): Vec2 => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])]
  const lerpY = (a: Vec2, b: Vec2, y: number): Vec2 => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y]
  const planes: [Inside, Cut][] = [
    [p => p[0] >= r.minX, (a, b) => lerpX(a, b, r.minX)],
    [p => p[0] <= r.maxX, (a, b) => lerpX(a, b, r.maxX)],
    [p => p[1] >= r.minY, (a, b) => lerpY(a, b, r.minY)],
    [p => p[1] <= r.maxY, (a, b) => lerpY(a, b, r.maxY)],
  ]
  let out = poly
  for (const [inside, cut] of planes) {
    if (out.length === 0) break
    const input = out
    out = []
    for (let i = 0; i < input.length; i++) {
      const cur = input[i]
      const prev = input[(i + input.length - 1) % input.length]
      const ci = inside(cur)
      const pi = inside(prev)
      if (ci) {
        if (!pi) out.push(cut(prev, cur))
        out.push(cur)
      } else if (pi) {
        out.push(cut(prev, cur))
      }
    }
  }
  return out
}

/** True when segment ab touches the rectangle (Liang–Barsky). */
export function segmentHitsRect(a: Vec2, b: Vec2, r: Rect): boolean {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const checks: [number, number][] = [
    [-dx, a[0] - r.minX],
    [dx, r.maxX - a[0]],
    [-dy, a[1] - r.minY],
    [dy, r.maxY - a[1]],
  ]
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false
    } else {
      const t = q / p
      if (p < 0) {
        if (t > t1) return false
        if (t > t0) t0 = t
      } else {
        if (t < t0) return false
        if (t < t1) t1 = t
      }
    }
  }
  return true
}

/** Andrew's monotone chain convex hull, counter-clockwise. */
export function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Vec2[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Vec2[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

/**
 * Area covered by any of the polygons (their union), exactly. The plane is cut into vertical
 * strips at every vertex and every edge crossing; inside a strip no edges meet, so the covered
 * length varies linearly across it and its value at the strip's middle gives the strip's area.
 */
export function unionArea(polys: Vec2[][]): number {
  const edges: { a: Vec2; b: Vec2; poly: number }[] = []
  polys.forEach((p, k) => {
    if (p.length < 3) return
    for (let i = 0; i < p.length; i++) edges.push({ a: p[i], b: p[(i + 1) % p.length], poly: k })
  })
  const xs = edges.map(e => e.a[0])
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const { a: p, b: p2 } = edges[i]
      const { a: q, b: q2 } = edges[j]
      const r: Vec2 = [p2[0] - p[0], p2[1] - p[1]]
      const s: Vec2 = [q2[0] - q[0], q2[1] - q[1]]
      const den = r[0] * s[1] - r[1] * s[0]
      if (Math.abs(den) < 1e-12) continue
      const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den
      const u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / den
      if (t > 0 && t < 1 && u > 0 && u < 1) xs.push(p[0] + t * r[0])
    }
  }
  xs.sort((a, b) => a - b)
  let area = 0
  for (let i = 0; i + 1 < xs.length; i++) {
    const w = xs[i + 1] - xs[i]
    if (w < 1e-12) continue
    const x = (xs[i] + xs[i + 1]) / 2
    // Each polygon's inside along the line at x, by even-odd pairs of crossings.
    const spans: [number, number][] = []
    for (let k = 0; k < polys.length; k++) {
      const ys: number[] = []
      for (const e of edges) {
        if (e.poly !== k || e.a[0] < x === e.b[0] < x) continue
        ys.push(e.a[1] + ((x - e.a[0]) / (e.b[0] - e.a[0])) * (e.b[1] - e.a[1]))
      }
      ys.sort((a, b) => a - b)
      for (let j = 0; j + 1 < ys.length; j += 2) spans.push([ys[j], ys[j + 1]])
    }
    spans.sort((a, b) => a[0] - b[0])
    let covered = 0
    let cur: [number, number] | null = null
    for (const [y0, y1] of spans) {
      if (cur && y0 <= cur[1]) cur[1] = Math.max(cur[1], y1)
      else {
        if (cur) covered += cur[1] - cur[0]
        cur = [y0, y1]
      }
    }
    if (cur) covered += cur[1] - cur[0]
    area += covered * w
  }
  return area
}

/** Area centroid of a polygon (falls back to the vertex average for degenerate ones). */
export function centroidOf(poly: Vec2[]): Vec2 {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]
    a += f
    cx += (poly[j][0] + poly[i][0]) * f
    cy += (poly[j][1] + poly[i][1]) * f
  }
  if (Math.abs(a) < 1e-12) {
    const n = poly.length || 1
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (3 * a), cy / (3 * a)]
}
