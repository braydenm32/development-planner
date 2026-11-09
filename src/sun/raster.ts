// A fine grid of cells for adding up shadows. Each face of the house, cast onto the ground, is
// filled into the grid; the cells it covers together are the shadow, however the faces overlap.
// Marching squares then trace the shadow's outline back out as rings. A grid is simpler and
// sturdier than clipping polygons, and at 10 cm a cell it's far finer than a plan is drawn.

import { signedArea, type Vec2 } from '../lib/geom'

export class Raster {
  readonly x0: number
  readonly y0: number
  readonly cell: number
  readonly nx: number
  readonly ny: number
  /** 1 where covered; row by row from the south-west corner. Cell (i, j) is centred at x0 + (i + ½)·cell, y0 + (j + ½)·cell. */
  readonly v: Uint8Array

  constructor(x0: number, y0: number, cell: number, nx: number, ny: number) {
    this.x0 = x0
    this.y0 = y0
    this.cell = cell
    this.nx = Math.max(1, nx)
    this.ny = Math.max(1, ny)
    this.v = new Uint8Array(this.nx * this.ny)
  }

  /** A grid covering a box, padded by a cell all round. */
  static around(minX: number, minY: number, maxX: number, maxY: number, cell: number): Raster {
    const x0 = Math.floor(minX / cell) * cell - cell
    const y0 = Math.floor(minY / cell) * cell - cell
    return new Raster(x0, y0, cell, Math.ceil((maxX - x0) / cell) + 2, Math.ceil((maxY - y0) / cell) + 2)
  }

  /** Same frame, nothing filled. */
  blank(): Raster {
    return new Raster(this.x0, this.y0, this.cell, this.nx, this.ny)
  }

  get(i: number, j: number): number {
    return i < 0 || j < 0 || i >= this.nx || j >= this.ny ? 0 : this.v[j * this.nx + i]
  }

  /** Cover every cell whose centre is inside the polygon (one ring, even-odd), given as x, y pairs. */
  fill(xy: ArrayLike<number>) {
    const n = xy.length / 2
    if (n < 3) return
    let minY = Infinity
    let maxY = -Infinity
    for (let k = 0; k < n; k++) {
      minY = Math.min(minY, xy[2 * k + 1])
      maxY = Math.max(maxY, xy[2 * k + 1])
    }
    const { x0, y0, cell, nx } = this
    const j0 = Math.max(0, Math.ceil((minY - y0) / cell - 0.5))
    const j1 = Math.min(this.ny - 1, Math.floor((maxY - y0) / cell - 0.5))
    const xs: number[] = []
    for (let j = j0; j <= j1; j++) {
      const y = y0 + (j + 0.5) * cell
      xs.length = 0
      for (let k = 0, l = n - 1; k < n; l = k++) {
        const ay = xy[2 * l + 1]
        const by = xy[2 * k + 1]
        // Half-open, so a vertex on the line counts once.
        if (ay <= y === by <= y) continue
        const ax = xy[2 * l]
        const bx = xy[2 * k]
        xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax))
      }
      if (xs.length < 2) continue
      xs.sort((a, b) => a - b)
      const row = j * nx
      for (let p = 0; p + 1 < xs.length; p += 2) {
        const i0 = Math.max(0, Math.ceil((xs[p] - x0) / cell - 0.5))
        const i1 = Math.min(nx - 1, Math.floor((xs[p + 1] - x0) / cell - 0.5))
        for (let i = i0; i <= i1; i++) this.v[row + i] = 1
      }
    }
  }

  /** Covered cells. */
  count(): number {
    let c = 0
    for (let k = 0; k < this.v.length; k++) c += this.v[k]
    return c
  }

  /** Covered area (m²). */
  area(): number {
    return this.count() * this.cell * this.cell
  }

  /** The cells covered here and not in `other` (same frame). */
  minus(other: Raster): Raster {
    const out = this.blank()
    for (let k = 0; k < this.v.length; k++) out.v[k] = this.v[k] && !other.v[k] ? 1 : 0
    return out
  }
}

// Marching squares, one square per four neighbouring cell centres, with the edges named
// B(ottom), R(ight), T(op), L(eft) and the corners as bits: bottom-left 1, bottom-right 2,
// top-right 4, top-left 8. Each segment runs with the covered side on its left, so outer rings
// come out anticlockwise and holes clockwise. The two saddles keep diagonal cells apart.
type E = 0 | 1 | 2 | 3
const B: E = 0
const R: E = 1
const T: E = 2
const L: E = 3
const SEGMENTS: [E, E][][] = [
  [],
  [[B, L]],
  [[R, B]],
  [[R, L]],
  [[T, R]],
  [
    [B, L],
    [T, R],
  ],
  [[T, B]],
  [[T, L]],
  [[L, T]],
  [[B, T]],
  [
    [R, B],
    [L, T],
  ],
  [[R, T]],
  [[L, R]],
  [[B, R]],
  [[L, B]],
  [],
]

/** The outlines of the covered cells, as rings through the middles of the cell edges. */
export function traceRings(r: Raster): Vec2[][] {
  const { nx, ny, cell, x0, y0 } = r
  const W = nx + 2
  // Edge ids: horizontal edge from sample (i, j) to (i + 1, j) and vertical edge from (i, j) to (i, j + 1), shifted by one for the padding.
  const hId = (i: number, j: number) => ((j + 1) * W + (i + 1)) * 2
  const vId = (i: number, j: number) => ((j + 1) * W + (i + 1)) * 2 + 1
  const next = new Map<number, number>()
  for (let j = -1; j < ny; j++) {
    for (let i = -1; i < nx; i++) {
      const c = r.get(i, j) | (r.get(i + 1, j) << 1) | (r.get(i + 1, j + 1) << 2) | (r.get(i, j + 1) << 3)
      if (c === 0 || c === 15) continue
      const id = (e: E) => (e === B ? hId(i, j) : e === T ? hId(i, j + 1) : e === L ? vId(i, j) : vId(i + 1, j))
      for (const [a, b] of SEGMENTS[c]) next.set(id(a), id(b))
    }
  }
  const at = (id: number): Vec2 => {
    const k = id >> 1
    const i = (k % W) - 1
    const j = Math.floor(k / W) - 1
    const x = x0 + (i + 0.5) * cell
    const y = y0 + (j + 0.5) * cell
    return id & 1 ? [x, y + cell / 2] : [x + cell / 2, y]
  }
  const rings: Vec2[][] = []
  for (const start of next.keys()) {
    if (!next.has(start)) continue
    const ring: Vec2[] = []
    let id: number | undefined = start
    while (id !== undefined && next.has(id)) {
      ring.push(at(id))
      const to: number = next.get(id)!
      next.delete(id)
      id = to
    }
    if (ring.length >= 3) rings.push(ring)
  }
  return rings
}

/** Squared distance from p to the segment ab. */
function segDist2(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  const ex = a[0] + t * dx - p[0]
  const ey = a[1] + t * dy - p[1]
  return ex * ex + ey * ey
}

function douglasPeucker(pts: Vec2[], tol2: number): Vec2[] {
  if (pts.length < 3) return pts
  let worst = 0
  let at = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist2(pts[i], pts[0], pts[pts.length - 1])
    if (d > worst) {
      worst = d
      at = i
    }
  }
  if (worst <= tol2) return [pts[0], pts[pts.length - 1]]
  const left = douglasPeucker(pts.slice(0, at + 1), tol2)
  const right = douglasPeucker(pts.slice(at), tol2)
  return [...left.slice(0, -1), ...right]
}

/** A ring with the steps smoothed away: no point moves more than `tol` off the result. */
export function simplifyRing(ring: Vec2[], tol: number): Vec2[] {
  if (ring.length < 4) return ring
  // Split at the point farthest from the first, so both halves are open runs.
  let far = 0
  let best = -1
  for (let i = 1; i < ring.length; i++) {
    const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2
    if (d > best) {
      best = d
      far = i
    }
  }
  const tol2 = tol * tol
  const a = douglasPeucker(ring.slice(0, far + 1), tol2)
  const b = douglasPeucker([...ring.slice(far), ring[0]], tol2)
  const out = [...a.slice(0, -1), ...b.slice(0, -1)]
  return out.length >= 3 && Math.abs(signedArea(out)) > 1e-9 ? out : ring
}
