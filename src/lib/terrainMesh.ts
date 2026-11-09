import { ShapeUtils, Vector2 } from 'three'
import { clipPolygonToRect, pointInPolygon, segmentHitsRect, signedArea, type Rect, type Vec2 } from './geom'
import type { Heightfield } from './terrain'

/**
 * Closed, watertight solid of the site: the terrain surface trimmed to the
 * boundary, vertical side walls, and a flat base. Coordinates are local
 * (x = east, y = north, z = RL), triangles wound counter-clockwise seen from outside.
 */
export interface SiteSolid {
  positions: Float32Array
  indices: Uint32Array
  /** The first `surfaceIndexCount` indices are the top surface; the rest are sides and base. */
  surfaceIndexCount: number
  baseZ: number
}

/**
 * A retaining wall's footprint in the grid's frame. The ground on either side of a retaining wall can
 * differ by metres between neighbouring grid nodes; left to the grid's squares, that step pokes out of
 * the wall's faces as a row of teeth. Squares a wall's faces cross are cut along the faces instead, and
 * the ground on each side is drawn from that side's nodes, so the step stays inside the wall.
 */
export interface WallStrip {
  a: Vec2
  b: Vec2
  /** Half the wall's thickness. */
  half: number
}

interface EdgePoint {
  at: number
  p: Vec2
  z: number
  strip: number
  face: 1 | -1
}

export function buildSiteSolid(grid: Heightfield, boundary: Vec2[], baseZ: number, strips: WallStrip[] = []): SiteSolid {
  const pos: number[] = []
  const keyToIndex = new Map<string, number>()
  const q = (v: number) => Math.round(v * 1e5)

  const vertex = (x: number, y: number, z?: number): number => {
    const k = `${q(x)},${q(y)}`
    let idx = keyToIndex.get(k)
    if (idx === undefined) {
      idx = pos.length / 3
      pos.push(x, y, z ?? grid.sample(x, y))
      keyToIndex.set(k, idx)
    }
    return idx
  }

  const surface: number[] = []
  const pushTri = (a: number, b: number, c: number) => {
    if (a === b || b === c || a === c) return
    const ax = pos[3 * a]
    const ay = pos[3 * a + 1]
    const cross = (pos[3 * b] - ax) * (pos[3 * c + 1] - ay) - (pos[3 * b + 1] - ay) * (pos[3 * c] - ax)
    if (Math.abs(cross) < 1e-12) return
    if (cross > 0) surface.push(a, b, c)
    else surface.push(a, c, b)
  }

  const { nx, ny, cell, x0, y0 } = grid
  const inside = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) inside[j * nx + i] = pointInPolygon(x0 + i * cell, y0 + j * cell, boundary) ? 1 : 0
  }
  const nodeIndex = (i: number, j: number) => vertex(x0 + i * cell, y0 + j * cell, grid.at(i, j))

  const edges = boundary.map((a, k) => {
    const b = boundary[(k + 1) % boundary.length]
    return {
      a,
      b,
      minX: Math.min(a[0], b[0]),
      maxX: Math.max(a[0], b[0]),
      minY: Math.min(a[1], b[1]),
      maxY: Math.max(a[1], b[1]),
    }
  })

  const rectOf = (i: number, j: number): Rect => ({ minX: x0 + i * cell, minY: y0 + j * cell, maxX: x0 + (i + 1) * cell, maxY: y0 + (j + 1) * cell })
  // Squares the boundary crosses are clipped to it; the rest are drawn whole if they're on the site.
  const crossed = new Uint8Array((nx - 1) * (ny - 1))
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const r = rectOf(i, j)
      crossed[j * (nx - 1) + i] = edges.some(
        e => e.maxX >= r.minX && e.minX <= r.maxX && e.maxY >= r.minY && e.minY <= r.maxY && segmentHitsRect(e.a, e.b, r),
      )
        ? 1
        : 0
    }
  }
  const whole = (i: number, j: number) => i >= 0 && j >= 0 && i < nx - 1 && j < ny - 1 && !crossed[j * (nx - 1) + i] && !!inside[j * nx + i]

  const walls = strips.flatMap(s => {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
    if (len < 1e-6 || !(s.half > 0)) return []
    return [{ a: s.a, ux: (s.b[0] - s.a[0]) / len, uy: (s.b[1] - s.a[1]) / len, len, half: s.half }]
  })
  type W = (typeof walls)[number]
  /** Across the wall (left of a → b is positive) and along it from a. */
  const across = (w: W, x: number, y: number) => -(x - w.a[0]) * w.uy + (y - w.a[1]) * w.ux
  const along = (w: W, x: number, y: number) => (x - w.a[0]) * w.ux + (y - w.a[1]) * w.uy
  const edgeCache = new Map<number, EdgePoint[]>()
  /**
   * Where the walls' faces cross the grid edge from node (i, j) to the next node east (dir 0) or north
   * (dir 1), in order along it. Worked out once per edge, so the squares either side share the points;
   * and only between two whole squares, so a clipped square never meets a point it doesn't have.
   */
  const edgePoints = (i: number, j: number, dir: 0 | 1): EdgePoint[] => {
    const key = (j * nx + i) * 2 + dir
    const hit = edgeCache.get(key)
    if (hit) return hit
    const pts: EdgePoint[] = []
    const shared = dir === 0 ? whole(i, j - 1) && whole(i, j) : whole(i - 1, j) && whole(i, j)
    if (walls.length && shared) {
      const i2 = dir === 0 ? i + 1 : i
      const j2 = dir === 0 ? j : j + 1
      const px = x0 + i * cell
      const py = y0 + j * cell
      const qx = x0 + i2 * cell
      const qy = y0 + j2 * cell
      const zp = grid.at(i, j)
      const zq = grid.at(i2, j2)
      walls.forEach((w, k) => {
        const sp = across(w, px, py)
        const sq = across(w, qx, qy)
        for (const face of [1, -1] as const) {
          const f = face * w.half
          if ((sp - f) * (sq - f) >= 0) continue
          const at = (f - sp) / (sq - sp)
          const x = px + (qx - px) * at
          const y = py + (qy - py) * at
          const t = along(w, x, y)
          if (t < 0 || t > w.len) continue
          // The ground at this face is the ground on its side of the wall, from that side's nodes only.
          const pOn = sp * face >= 0
          const qOn = sq * face >= 0
          const z = pOn && qOn ? zp + (zq - zp) * at : pOn ? zp : zq
          pts.push({ at, p: [x, y], z, strip: k, face })
        }
      })
      pts.sort((u, v) => u.at - v.at)
    }
    edgeCache.set(key, pts)
    return pts
  }

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const r = rectOf(i, j)
      if (!crossed[j * (nx - 1) + i]) {
        if (!inside[j * nx + i]) continue
        const south = edgePoints(i, j, 0)
        const east = edgePoints(i + 1, j, 1)
        const north = edgePoints(i, j + 1, 0)
        const west = edgePoints(i, j, 1)
        if (south.length + east.length + north.length + west.length) {
          // A wall's face crosses this square: go round it anticlockwise, corners and crossings.
          const ring: { id: number; x: number; y: number; face: number; strip: number }[] = []
          const corner = (ci: number, cj: number) => ring.push({ id: nodeIndex(ci, cj), x: x0 + ci * cell, y: y0 + cj * cell, face: 0, strip: -1 })
          const onEdge = (list: EdgePoint[]) => {
            for (const e of list) ring.push({ id: vertex(e.p[0], e.p[1], e.z), x: e.p[0], y: e.p[1], face: e.face, strip: e.strip })
          }
          corner(i, j)
          onEdge(south)
          corner(i + 1, j)
          onEdge(east)
          corner(i + 1, j + 1)
          onEdge([...north].reverse())
          corner(i, j + 1)
          onEdge([...west].reverse())
          const cuts = ring.filter(v => v.face !== 0)
          const k = cuts[0].strip
          const clean =
            cuts.every(v => v.strip === k) &&
            ([1, -1] as const).every(f => {
              const n = cuts.filter(v => v.face === f).length
              return n === 0 || n === 2
            })
          const fan = (part: typeof ring) => {
            for (let m = 1; m + 1 < part.length; m++) pushTri(part[0].id, part[m].id, part[m + 1].id)
          }
          if (clean) {
            // One wall straight through: the ground on each side of it, and the step inside it.
            const w = walls[k]
            const s = ring.map(v => (v.face ? v.face * w.half : across(w, v.x, v.y)))
            const e = 1e-9
            fan(ring.filter((_, m) => s[m] >= w.half - e))
            fan(ring.filter((_, m) => s[m] >= -w.half - e && s[m] <= w.half + e))
            fan(ring.filter((_, m) => s[m] <= -w.half + e))
          } else {
            // A wall's end, or two walls: a fan from the middle keeps every point shared with the neighbours.
            const c = vertex(x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell)
            for (let m = 0; m < ring.length; m++) pushTri(c, ring[m].id, ring[(m + 1) % ring.length].id)
          }
          continue
        }
        const a = nodeIndex(i, j)
        const b = nodeIndex(i + 1, j)
        const c = nodeIndex(i + 1, j + 1)
        const d = nodeIndex(i, j + 1)
        // Split along the diagonal that best follows the ground.
        if (Math.abs(grid.at(i, j) - grid.at(i + 1, j + 1)) <= Math.abs(grid.at(i + 1, j) - grid.at(i, j + 1))) {
          pushTri(a, b, c)
          pushTri(a, c, d)
        } else {
          pushTri(a, b, d)
          pushTri(b, c, d)
        }
        continue
      }
      const piece = clipPolygonToRect(boundary, r)
      if (piece.length < 3 || Math.abs(signedArea(piece)) < 1e-10) continue
      const ids = piece.map(p => vertex(p[0], p[1]))
      const tris = ShapeUtils.triangulateShape(
        piece.map(p => new Vector2(p[0], p[1])),
        [],
      )
      for (const [a, b, c] of tris) pushTri(ids[a], ids[b], ids[c])
    }
  }

  // Edges used by exactly one surface triangle form the outline of the top surface.
  const edgeCount = new Map<string, number>()
  const directed: [number, number][] = []
  for (let t = 0; t < surface.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = surface[t + k]
      const b = surface[t + ((k + 1) % 3)]
      const key = a < b ? `${a},${b}` : `${b},${a}`
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1)
      directed.push([a, b])
    }
  }
  const outline = directed.filter(([a, b]) => edgeCount.get(a < b ? `${a},${b}` : `${b},${a}`) === 1)

  const solid: number[] = []
  const bottom = new Map<number, number>()
  const bottomOf = (top: number) => {
    let idx = bottom.get(top)
    if (idx === undefined) {
      idx = pos.length / 3
      pos.push(pos[3 * top], pos[3 * top + 1], baseZ)
      bottom.set(top, idx)
    }
    return idx
  }
  for (const [a, b] of outline) {
    const ab = bottomOf(a)
    const bb = bottomOf(b)
    solid.push(a, ab, bb, a, bb, b)
  }

  // The base mirrors the top surface's triangulation, flipped to face down. That
  // keeps every vertex along the bottom of the walls shared, so the solid stays
  // closed even where the outline has many collinear points.
  for (let t = 0; t < surface.length; t += 3) {
    solid.push(bottomOf(surface[t]), bottomOf(surface[t + 2]), bottomOf(surface[t + 1]))
  }

  return {
    positions: new Float32Array(pos),
    indices: new Uint32Array([...surface, ...solid]),
    surfaceIndexCount: surface.length,
    baseZ,
  }
}

/** Every edge shared by exactly two triangles, in opposite directions: the solid is closed and consistently wound. */
export function isWatertight(indices: ArrayLike<number>): boolean {
  const seen = new Map<string, number>()
  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const key = `${indices[t + k]},${indices[t + ((k + 1) % 3)]}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
  }
  for (const [key, n] of seen) {
    if (n !== 1) return false
    const [a, b] = key.split(',')
    if (seen.get(`${b},${a}`) !== 1) return false
  }
  return true
}
