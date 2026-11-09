import { bounds, pointInPolygon, signedArea, unionArea, type Vec2 } from '../lib/geom'
import { houseWalls, isRetaining, wallDir, wallLength, type Opening, type Plan, type Room, type Wall } from './model'

const TOL = 1e-3 // 1 mm

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]]
const mul = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k]
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0]
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1]
const left = (d: Vec2): Vec2 => [-d[1], d[0]]
const near = (a: Vec2, b: Vec2, tol = TOL) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol

/** Closest point on segment ab to p, with its parameter t in [0, 1]. */
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number; dist: number } {
  const ab = sub(b, a)
  const len2 = dot(ab, ab)
  const t = len2 > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / len2)) : 0
  const point = add(a, mul(ab, t))
  return { point, t, dist: Math.hypot(p[0] - point[0], p[1] - point[1]) }
}

/** Intersection of lines p + s*u and q + r*v, or null when parallel. */
function intersectLines(p: Vec2, u: Vec2, q: Vec2, v: Vec2): Vec2 | null {
  const den = cross(u, v)
  if (Math.abs(den) < 1e-9) return null
  const s = cross(sub(q, p), v) / den
  return add(p, mul(u, s))
}

interface Arm {
  dir: Vec2
  thickness: number
}

/** Directions of the other walls leaving point e (walls that end there, or pass through it). */
function armsAt(e: Vec2, self: Wall, walls: Wall[]): Arm[] {
  const arms: Arm[] = []
  for (const w of walls) {
    // Retaining walls only join other retaining walls, and house walls only house walls.
    if (w.id === self.id || w.level !== self.level || isRetaining(w) !== isRetaining(self)) continue
    const d = wallDir(w)
    if (near(w.a, e)) arms.push({ dir: d, thickness: w.thickness })
    else if (near(w.b, e)) arms.push({ dir: [-d[0], -d[1]], thickness: w.thickness })
    else if (closestOnSegment(e, w.a, w.b).dist <= TOL) {
      arms.push({ dir: d, thickness: w.thickness }, { dir: [-d[0], -d[1]], thickness: w.thickness })
    }
  }
  return arms
}

/**
 * The two corners of a wall's end at point e, where u points from e into the wall.
 * Each side of the wall is mitred against the neighbouring wall on that side.
 */
function endCorners(e: Vec2, u: Vec2, t: number, arms: Arm[]): { left: Vec2; right: Vec2 } {
  const n = left(u)
  let lc: Vec2 = add(e, mul(n, t / 2))
  let rc: Vec2 = sub(e, mul(n, t / 2))
  const a0 = Math.atan2(u[1], u[0])
  let ccw: Arm | null = null
  let cw: Arm | null = null
  let ccwAngle = Infinity
  let cwAngle = -Infinity
  for (const arm of arms) {
    let delta = Math.atan2(arm.dir[1], arm.dir[0]) - a0
    while (delta <= 1e-6) delta += 2 * Math.PI
    while (delta > 2 * Math.PI) delta -= 2 * Math.PI
    if (delta > 2 * Math.PI - 1e-6) continue // overlaps this wall
    if (delta < ccwAngle) {
      ccwAngle = delta
      ccw = arm
    }
    if (delta > cwAngle) {
      cwAngle = delta
      cw = arm
    }
  }
  const limit = 4 * Math.max(t, ...arms.map(a => a.thickness))
  if (ccw) {
    const nv = left(ccw.dir)
    const p = intersectLines(lc, u, sub(e, mul(nv, ccw.thickness / 2)), ccw.dir)
    if (p && Math.hypot(p[0] - e[0], p[1] - e[1]) < limit) lc = p
  }
  if (cw) {
    const nw = left(cw.dir)
    const p = intersectLines(rc, u, add(e, mul(nw, cw.thickness / 2)), cw.dir)
    if (p && Math.hypot(p[0] - e[0], p[1] - e[1]) < limit) rc = p
  }
  return { left: lc, right: rc }
}

/** Outline of each wall with its corners mitred into the walls it meets (counter-clockwise). */
export function wallPolygons(walls: Wall[]): Map<string, Vec2[]> {
  const out = new Map<string, Vec2[]>()
  for (const w of walls) {
    if (wallLength(w) < TOL) continue
    const d = wallDir(w)
    const atA = endCorners(w.a, d, w.thickness, armsAt(w.a, w, walls))
    const atB = endCorners(w.b, [-d[0], -d[1]], w.thickness, armsAt(w.b, w, walls))
    out.set(w.id, [atA.right, atB.left, atB.right, atA.left])
  }
  return out
}

// ---------------------------------------------------------------------------
// Planar graph of wall centrelines, used to find rooms and the house outline.

interface HalfEdge {
  from: number
  to: number
  wall: string
  angle: number
}

export interface Face {
  pts: Vec2[]
  /** Thickness of the wall along each edge (edge i runs from pts[i] to pts[i+1]). */
  thickness: number[]
  walls: string[]
  area: number
}

export function planarFaces(all: Wall[]): Face[] {
  // Rooms and the building's outline are made of house walls only.
  const walls = houseWalls(all)
  const nodes: Vec2[] = []
  const nodeIndex = (p: Vec2) => {
    for (let i = 0; i < nodes.length; i++) if (near(nodes[i], p)) return i
    nodes.push([p[0], p[1]])
    return nodes.length - 1
  }

  // Split each wall wherever another wall touches or crosses it.
  const edges: { a: number; b: number; wall: Wall }[] = []
  for (const w of walls) {
    const len = wallLength(w)
    if (len < TOL) continue
    const d = wallDir(w)
    const ts = [0, len]
    for (const o of walls) {
      if (o === w) continue
      for (const p of [o.a, o.b]) {
        const c = closestOnSegment(p, w.a, w.b)
        if (c.dist <= TOL) ts.push(c.t * len)
      }
      const x = intersectLines(w.a, d, o.a, wallDir(o))
      if (x) {
        const cw = closestOnSegment(x, w.a, w.b)
        const co = closestOnSegment(x, o.a, o.b)
        if (cw.dist <= TOL && co.dist <= TOL) ts.push(cw.t * len)
      }
    }
    ts.sort((p, q) => p - q)
    let prev = nodeIndex(w.a)
    let prevT = 0
    for (const t of ts) {
      if (t - prevT < TOL) continue
      const next = nodeIndex(add(w.a, mul(d, t)))
      if (next !== prev) edges.push({ a: prev, b: next, wall: w })
      prev = next
      prevT = t
    }
  }

  // Drop duplicate edges (overlapping walls), keeping the thicker one.
  const unique = new Map<string, { a: number; b: number; wall: Wall }>()
  for (const e of edges) {
    const key = e.a < e.b ? `${e.a},${e.b}` : `${e.b},${e.a}`
    const cur = unique.get(key)
    if (!cur || e.wall.thickness > cur.wall.thickness) unique.set(key, e)
  }

  const half: HalfEdge[] = []
  for (const e of unique.values()) {
    for (const [from, to] of [
      [e.a, e.b],
      [e.b, e.a],
    ]) {
      const d = sub(nodes[to], nodes[from])
      half.push({ from, to, wall: e.wall.id, angle: Math.atan2(d[1], d[0]) })
    }
  }
  const thickness = new Map(walls.map(w => [w.id, w.thickness]))
  const outgoing = new Map<number, number[]>()
  half.forEach((h, i) => {
    const list = outgoing.get(h.from) ?? []
    list.push(i)
    outgoing.set(h.from, list)
  })
  for (const list of outgoing.values()) list.sort((p, q) => half[p].angle - half[q].angle)

  const twin = (i: number) => (i % 2 === 0 ? i + 1 : i - 1)
  const used = new Uint8Array(half.length)
  const faces: Face[] = []
  for (let start = 0; start < half.length; start++) {
    if (used[start]) continue
    const loop: number[] = []
    let h = start
    while (!used[h]) {
      used[h] = 1
      loop.push(h)
      const list = outgoing.get(half[h].to)!
      const k = list.indexOf(twin(h))
      h = list[(k - 1 + list.length) % list.length]
    }
    const cleaned = removeSpikes(loop.map(i => ({ node: half[i].from, wall: half[i].wall })))
    if (cleaned.length < 3) continue
    const pts = cleaned.map(c => nodes[c.node])
    faces.push({
      pts,
      walls: cleaned.map(c => c.wall),
      thickness: cleaned.map(c => thickness.get(c.wall) ?? 0),
      area: signedArea(pts),
    })
  }
  return faces
}

/** Remove there-and-back excursions along dangling walls from a face boundary. */
function removeSpikes<T extends { node: number }>(loop: T[]): T[] {
  const out = [...loop]
  let changed = true
  while (changed && out.length >= 3) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i - 1 + out.length) % out.length]
      const next = out[(i + 1) % out.length]
      if (prev.node === next.node) {
        // the edges prev->cur and cur->prev go out and straight back: drop both
        const drop = new Set([(i - 1 + out.length) % out.length, i])
        const kept = out.filter((_, k) => !drop.has(k))
        out.length = 0
        out.push(...kept)
        changed = true
        break
      }
    }
  }
  return out
}

/**
 * Offset a closed polygon to the left of each edge (inwards for a counter-clockwise
 * polygon) by a per-edge distance. Negative distances offset to the right.
 */
export function offsetPolygon(pts: Vec2[], dist: number[]): Vec2[] {
  const n = pts.length
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n
    const p0 = pts[prev]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const u = norm(sub(p1, p0))
    const v = norm(sub(p2, p1))
    const a = add(p1, mul(left(u), dist[prev]))
    const b = add(p1, mul(left(v), dist[i]))
    const x = intersectLines(a, u, b, v)
    if (x && Math.hypot(x[0] - p1[0], x[1] - p1[1]) < 10 * Math.max(Math.abs(dist[prev]), Math.abs(dist[i]), 0.01)) out.push(x)
    else if (near(a, b, 1e-6)) out.push(a)
    else out.push(a, b)
  }
  return out
}

function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v[0], v[1]) || 1
  return [v[0] / l, v[1] / l]
}

export interface RoomShape {
  /** Room outline on wall centrelines. */
  centre: Vec2[]
  /** Room outline on the inside faces of its walls. */
  inner: Vec2[]
  area: number
}

/** The smallest enclosed face of the wall graph around a point, or null. */
export function faceAround(p: Vec2, faces: Face[]): Face | null {
  let best: Face | null = null
  for (const f of faces) {
    if (f.area <= 0) continue
    if (!pointInPolygon(p[0], p[1], f.pts)) continue
    if (!best || f.area < best.area) best = f
  }
  return best
}

/** The smallest enclosed area around the room's point, or null if the room isn't enclosed. */
export function roomShape(room: Room, faces: Face[]): RoomShape | null {
  const best = faceAround(room.at, faces)
  if (!best) return null
  const inner = offsetPolygon(
    best.pts,
    best.thickness.map(t => t / 2),
  )
  return { centre: best.pts, inner, area: Math.abs(signedArea(inner)) }
}

/** Outer outlines of the walls on a level (outside faces), with their total area. */
export function buildingOutline(faces: Face[]): { outlines: Vec2[][]; area: number } {
  const outlines: Vec2[][] = []
  let area = 0
  for (const f of faces) {
    if (f.area >= 0) continue
    // The outer face runs clockwise with the outside on its left, so offsetting
    // left moves the centreline out to the wall's outside face.
    const o = offsetPolygon(
      f.pts,
      f.thickness.map(t => t / 2),
    )
    outlines.push(o)
    area += Math.abs(signedArea(o))
  }
  return { outlines, area }
}

/**
 * The area the house covers in plan (m²): the union of every level's outline to the outside
 * of its walls, so an upper floor that overhangs the one below counts once, where it is.
 */
export function buildingFootprint(plan: Plan): number {
  return unionArea(plan.levels.flatMap(l => buildingOutline(planarFaces(plan.walls.filter(w => w.level === l.id))).outlines))
}

/**
 * Solid parts of a wall once its openings are cut out, as boxes in the wall's own
 * frame: [start, end] along the wall and [bottom, top] above the floor.
 */
export function wallPieces(
  length: number,
  height: number,
  openings: Pick<Opening, 'offset' | 'width' | 'height' | 'sill'>[],
): { s0: number; s1: number; z0: number; z1: number }[] {
  const ops = [...openings].sort((a, b) => a.offset - b.offset)
  const pieces: { s0: number; s1: number; z0: number; z1: number }[] = []
  let s = 0
  for (const o of ops) {
    const o0 = Math.max(o.offset - o.width / 2, s)
    const o1 = Math.min(o.offset + o.width / 2, length)
    if (o1 <= o0) continue
    if (o0 > s) pieces.push({ s0: s, s1: o0, z0: 0, z1: height })
    const top = Math.min(o.sill + o.height, height)
    if (o.sill > 0) pieces.push({ s0: o0, s1: o1, z0: 0, z1: o.sill })
    if (top < height) pieces.push({ s0: o0, s1: o1, z0: top, z1: height })
    s = o1
  }
  if (s < length) pieces.push({ s0: s, s1: length, z0: 0, z1: height })
  return pieces
}

/** Keep the part of a convex polygon between s0 and s1 along direction d from point o. */
export function sliceAlong(poly: Vec2[], o: Vec2, d: Vec2, s0: number, s1: number): Vec2[] {
  const clip = (pts: Vec2[], keep: (s: number) => boolean, at: number) => {
    const out: Vec2[] = []
    const sOf = (p: Vec2) => (p[0] - o[0]) * d[0] + (p[1] - o[1]) * d[1]
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const sa = sOf(a)
      const sb = sOf(b)
      if (keep(sa)) out.push(a)
      if (keep(sa) !== keep(sb)) {
        const t = (at - sa) / (sb - sa)
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      }
    }
    return out
  }
  let pts = poly
  if (s0 > 0) pts = clip(pts, s => s >= s0, s0)
  if (pts.length >= 3) pts = clip(pts, s => s <= s1, s1)
  return pts
}

/** Points about `spacing` apart inside a plan polygon, for piers and deck posts. */
export function postGrid(poly: Vec2[], spacing: number): Vec2[] {
  const b = bounds(poly)
  const inset = 0.25
  const nx = Math.max(1, Math.round((b.maxX - b.minX - 2 * inset) / spacing))
  const ny = Math.max(1, Math.round((b.maxY - b.minY - 2 * inset) / spacing))
  const out: Vec2[] = []
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const p: Vec2 = [b.minX + inset + ((b.maxX - b.minX - 2 * inset) * i) / nx, b.minY + inset + ((b.maxY - b.minY - 2 * inset) * j) / ny]
      if (pointInPolygon(p[0], p[1], poly)) out.push(p)
    }
  }
  return out
}
