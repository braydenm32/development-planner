import { pointInPolygon, type Vec2 } from './geom'
import { Heightfield } from './terrain'

/**
 * A platform whose level runs along one direction and is flat across it, as a driveway built to
 * its own levels is. Points level with `a` along `u` are at `za`, points level with `b` at `zb`,
 * and the level runs straight between them; before `a` and past `b` it stays at the end's.
 */
export interface Ramp {
  /** The middle of each end, in the survey's local frame. */
  a: Vec2
  b: Vec2
  /** The direction along the ramp, a unit vector. */
  u: Vec2
  /** RL at each end, or null where the end follows the finished ground there (from the other platforms). */
  za: number | null
  zb: number | null
  /** How much of a balancing shift each end follows: 1 for an end at the floor's slab, 0 (the default) for a fixed level. */
  followA?: number
  followB?: number
}

/** A piece of ground to be levelled, in the survey's local frame. */
export interface Platform {
  /** Names the platform, so its own ground can be found again (a driveway's area id). */
  id?: string
  /** Rings the platform covers... */
  include: Vec2[][]
  /** ...less these. */
  exclude: Vec2[][]
  /** RL of the levelled ground. */
  level: number
  /** Its level runs along this instead, and `level`, `fixed` are unused. */
  ramp?: Ramp
  /** False when the ground only needs cutting down to the level, as under a floor on piers. */
  fill: boolean
  /** False when the ground only needs filling up to the level, never cut down (the Fill brush). Missing means true. */
  cut?: boolean
  /** Cells painted on a square grid (the grading brush), covered as well as `include`. */
  cells?: CellMask
  /** Level ground this far past the edge instead of the settings' margin (m). */
  margin?: number
  /**
   * Gives way to the other platforms: where one of them is level, this one is left out.
   * Level ground beside a retaining wall gives way to the house pad.
   */
  soft?: boolean
  /** Gives way to every other platform, soft ones too: a driveway gives way to the house pad and the level ground beside retaining walls. */
  softer?: boolean
  /** Stays at its level when the platforms are raised or lowered to balance cut and fill. */
  fixed?: boolean
}

/**
 * Squares painted on a grid, in the survey's local frame: column i runs from x0 + i·cell to
 * x0 + (i + 1)·cell, row j likewise from y0. Each row entry is [j, first i, last i].
 */
export interface CellMask {
  cell: number
  x0: number
  y0: number
  rows: [number, number, number][]
}

/** A line the earthworks can't cross, such as a retaining wall, in the survey's local frame. */
export type Barrier = [Vec2, Vec2]

export interface EarthworksOptions {
  /** Level ground this far past the platform's edge (m). */
  margin: number
  /** Batters as horizontal run per 1 m of height; 0 means a retaining wall. */
  cutBatter: number
  fillBatter: number
}

export interface PreparedEarthworks {
  natural: Heightfield
  inside: Uint8Array
  /** Nearest boundary edge for nodes within a cell of the boundary, otherwise -1. */
  edgeNear: Int16Array
  platforms: PreparedPlatform[]
  opts: EarthworksOptions
  /** Some platforms give way to others. */
  anySoft: boolean
}

export interface PreparedPlatform {
  id?: string
  level: number
  fill: boolean
  cut: boolean
  dist: Float32Array
  soft: boolean
  fixed: boolean
  /** 0 for a firm platform, 1 for a soft one, 2 for one softer still: each gives way to a lower rank where it is level. */
  rank: number
  /** Its level runs along a ramp. */
  isRamp: boolean
  /** A ramp's level at each node, and how much of a balancing shift it follows there. */
  levels: Float32Array | null
  follow: Float32Array | null
  /** A ramp's level at each end, its own or the finished ground's there. */
  ends: [number, number] | null
}

export interface EarthworksResult {
  /** The finished ground. */
  grid: Heightfield
  /** Volumes in m³. */
  cut: number
  fill: number
  /** Deepest cut and fill in m. */
  maxCut: number
  maxFill: number
  /** Boundary edges (by index) where the earthworks run into the boundary. */
  boundaryEdges: number[]
}

const FAR = 1e20

/** The rank of a platform that gives way to every other (a driveway). */
const SOFTEST = 2

/** Squared Euclidean distance transform of one line (Felzenszwalb and Huttenlocher). */
function edt1d(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    out[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

/** Distance (in cells) from every node to the nearest marked node. */
function distanceField(mask: Uint8Array, nx: number, ny: number): Float32Array {
  const d = new Float64Array(nx * ny)
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : FAR
  const m = Math.max(nx, ny)
  const f = new Float64Array(m)
  const out = new Float64Array(m)
  const v = new Int32Array(m)
  const z = new Float64Array(m + 1)
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) f[j] = d[j * nx + i]
    edt1d(f, ny, out, v, z)
    for (let j = 0; j < ny; j++) d[j * nx + i] = out[j]
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) f[i] = d[j * nx + i]
    edt1d(f, nx, out, v, z)
    for (let i = 0; i < nx; i++) d[j * nx + i] = out[i]
  }
  const r = new Float32Array(nx * ny)
  for (let i = 0; i < r.length; i++) r[i] = d[i] >= FAR / 2 ? Infinity : Math.sqrt(d[i])
  return r
}

// The four grid directions stored at each node; the other four are read from the neighbour.
const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 1],
]

const orient = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

/** Do segments pq and ab cross or touch? */
export function crosses(p: Vec2, q: Vec2, a: Vec2, b: Vec2): boolean {
  const d1 = orient(a, b, p)
  const d2 = orient(a, b, q)
  const d3 = orient(p, q, a)
  const d4 = orient(p, q, b)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  const on = (u: Vec2, v: Vec2, w: Vec2, d: number) =>
    Math.abs(d) < 1e-12 && Math.min(u[0], v[0]) - 1e-9 <= w[0] && w[0] <= Math.max(u[0], v[0]) + 1e-9 && Math.min(u[1], v[1]) - 1e-9 <= w[1] && w[1] <= Math.max(u[1], v[1]) + 1e-9
  return on(a, b, p, d1) || on(a, b, q, d2) || on(p, q, a, d3) || on(p, q, b, d4)
}

/** For each node, a bit for each of DIRS whose step to the neighbour crosses a barrier. */
function blockedSteps(field: Heightfield, barriers: Barrier[]): Uint8Array {
  const { nx, ny, cell, x0, y0 } = field
  const blocked = new Uint8Array(nx * ny)
  for (const [a, b] of barriers) {
    const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - x0) / cell) - 1)
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0]) - x0) / cell) + 1)
    const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - y0) / cell) - 1)
    const j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1]) - y0) / cell) + 1)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const p: Vec2 = [x0 + i * cell, y0 + j * cell]
        DIRS.forEach(([di, dj], bit) => {
          const q: Vec2 = [p[0] + di * cell, p[1] + dj * cell]
          if (crosses(p, q, a, b)) blocked[j * nx + i] |= 1 << bit
        })
      }
    }
  }
  return blocked
}

/**
 * Distance (in cells) from every node to the nearest marked node, stepping between
 * neighbouring nodes (8 ways) and never across a blocked step.
 */
function stepDistance(mask: Uint8Array, nx: number, ny: number, blocked: Uint8Array | null): Float32Array {
  const dist = new Float32Array(nx * ny).fill(Infinity)
  // A binary heap of node indices keyed by distance.
  const heap: number[] = []
  const push = (k: number) => {
    heap.push(k)
    let i = heap.length - 1
    while (i > 0) {
      const up = (i - 1) >> 1
      if (dist[heap[up]] <= dist[heap[i]]) break
      ;[heap[up], heap[i]] = [heap[i], heap[up]]
      i = up
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l
        if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue
    dist[k] = 0
    push(k)
  }
  const done = new Uint8Array(nx * ny)
  while (heap.length) {
    const k = pop()
    if (done[k]) continue
    done[k] = 1
    const i = k % nx
    const j = (k - i) / nx
    for (let n = 0; n < 8; n++) {
      const [di, dj] = n < 4 ? DIRS[n] : [-DIRS[n - 4][0], -DIRS[n - 4][1]]
      const ii = i + di
      const jj = j + dj
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue
      const kk = jj * nx + ii
      if (blocked && (n < 4 ? blocked[k] & (1 << n) : blocked[kk] & (1 << (n - 4)))) continue
      const d = dist[k] + (di && dj ? Math.SQRT2 : 1)
      if (d < dist[kk]) {
        dist[kk] = d
        push(kk)
      }
    }
  }
  return dist
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

const masks = new WeakMap<Heightfield, { boundary: Vec2[]; inside: Uint8Array; edgeNear: Int16Array }>()

/** Which grid nodes are on the site, and which boundary edge each one near the boundary is next to. */
function siteMask(natural: Heightfield, boundary: Vec2[]): { inside: Uint8Array; edgeNear: Int16Array } {
  const hit = masks.get(natural)
  if (hit && hit.boundary === boundary) return hit
  const { nx, ny, cell, x0, y0 } = natural
  const inside = new Uint8Array(nx * ny)
  const edgeNear = new Int16Array(nx * ny).fill(-1)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const p: Vec2 = [x0 + i * cell, y0 + j * cell]
      if (!pointInPolygon(p[0], p[1], boundary)) continue
      const k = j * nx + i
      inside[k] = 1
      let best = -1
      let bestD = cell * 1.5
      boundary.forEach((a, e) => {
        const d = distToSegment(p, a, boundary[(e + 1) % boundary.length])
        if (d < bestD) {
          bestD = d
          best = e
        }
      })
      edgeNear[k] = best
    }
  }
  masks.set(natural, { boundary, inside, edgeNear })
  return { inside, edgeNear }
}

/** Mark the grid nodes that fall inside painted squares (each square holds its lower-left edges, not its upper-right). */
function markCells(mask: Uint8Array, f: Heightfield, m: CellMask) {
  const first = (v: number, o: number) => Math.max(0, Math.ceil((v - o) / f.cell - 1e-9))
  for (const [j, i0, i1] of m.rows) {
    const ja = first(m.y0 + j * m.cell, f.y0)
    const jb = Math.min(f.ny, first(m.y0 + (j + 1) * m.cell, f.y0))
    const ia = first(m.x0 + i0 * m.cell, f.x0)
    const ib = Math.min(f.nx, first(m.x0 + (i1 + 1) * m.cell, f.x0))
    for (let jj = ja; jj < jb; jj++) for (let ii = ia; ii < ib; ii++) mask[jj * f.nx + ii] = 1
  }
}

export function prepareEarthworks(
  natural: Heightfield,
  boundary: Vec2[],
  platforms: Platform[],
  opts: EarthworksOptions,
  barriers: Barrier[] = [],
): PreparedEarthworks {
  const { nx, ny, cell, x0, y0 } = natural
  const { inside, edgeNear } = siteMask(natural, boundary)
  const blocked = barriers.length ? blockedSteps(natural, barriers) : null
  const prepared = platforms.map(pf => {
    const mask = new Uint8Array(nx * ny)
    if (pf.include.length) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const x = x0 + i * cell
          const y = y0 + j * cell
          if (pf.include.some(r => pointInPolygon(x, y, r))) mask[j * nx + i] = 1
        }
      }
    }
    if (pf.cells) markCells(mask, natural, pf.cells)
    if (pf.exclude.length) {
      for (let k = 0; k < mask.length; k++) {
        if (!mask[k]) continue
        const i = k % nx
        if (pf.exclude.some(r => pointInPolygon(x0 + i * cell, y0 + ((k - i) / nx) * cell, r))) mask[k] = 0
      }
    }
    const dist = distanceField(mask, nx, ny)
    if (blocked) {
      // Batters can't pass through a barrier, so ground behind one is reached the long way
      // round its end, or not at all. The straight-line distance gets the extra length of
      // the detour, measured on the grid with and without the barriers.
      const around = stepDistance(mask, nx, ny, blocked)
      const direct = stepDistance(mask, nx, ny, null)
      for (let k = 0; k < dist.length; k++) dist[k] = around[k] === Infinity ? Infinity : dist[k] + Math.max(0, around[k] - direct[k])
    }
    // The platform's edge lies about half a cell past its outermost node.
    const margin = pf.margin ?? opts.margin
    for (let k = 0; k < dist.length; k++) dist[k] = dist[k] === 0 ? 0 : Math.max(0, (dist[k] - 0.5) * cell - margin)
    const out: PreparedPlatform = {
      id: pf.id,
      level: pf.level,
      fill: pf.fill,
      cut: pf.cut !== false,
      dist,
      soft: !!pf.soft,
      fixed: pf.ramp ? !pf.ramp.followA && !pf.ramp.followB : !!pf.fixed,
      rank: pf.softer ? SOFTEST : pf.soft ? 1 : 0,
      isRamp: !!pf.ramp,
      levels: null,
      follow: null,
      ends: null,
    }
    return out
  })
  const prep: PreparedEarthworks = { natural, inside, edgeNear, platforms: prepared, opts, anySoft: prepared.some(p => p.rank > 0) }
  // Ramps last: an end without a level follows the finished ground the other platforms make.
  platforms.forEach((pf, n) => {
    const r = pf.ramp
    if (!r) return
    const za = r.za ?? otherGroundAt(prep, r.a)
    const zb = r.zb ?? otherGroundAt(prep, r.b)
    const p = prepared[n]
    p.ends = [za, zb]
    p.levels = new Float32Array(nx * ny)
    p.follow = new Float32Array(nx * ny)
    // Along the ramp from a to b; nodes beside it take the level level with them, so its
    // batters start from the ramp's edge at the same station.
    const sa = r.a[0] * r.u[0] + r.a[1] * r.u[1]
    const span = r.b[0] * r.u[0] + r.b[1] * r.u[1] - sa
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const t = span > 1e-9 ? Math.min(Math.max(((x0 + i * cell) * r.u[0] + (y0 + j * cell) * r.u[1] - sa) / span, 0), 1) : 0
        p.levels[j * nx + i] = za + (zb - za) * t
        p.follow[j * nx + i] = (r.followA ?? 0) + ((r.followB ?? 0) - (r.followA ?? 0)) * t
      }
    }
  })
  return prep
}

/**
 * The finished ground at a point from every platform but the ramps: what a driveway's end
 * without a level of its own follows.
 */
export function otherGroundAt(prep: PreparedEarthworks, p: Vec2): number {
  const f = prep.natural
  const fx = Math.min(Math.max((p[0] - f.x0) / f.cell, 0), f.nx - 1)
  const fy = Math.min(Math.max((p[1] - f.y0) / f.cell, 0), f.ny - 1)
  const i = Math.min(Math.floor(fx), f.nx - 2)
  const j = Math.min(Math.floor(fy), f.ny - 2)
  const tx = fx - i
  const ty = fy - j
  const z = (ii: number, jj: number) => designAt(prep, jj * f.nx + ii, 0, true)
  return (z(i, j) * (1 - tx) + z(i + 1, j) * tx) * (1 - ty) + (z(i, j + 1) * (1 - tx) + z(i + 1, j + 1) * tx) * ty
}

/**
 * Whether the platform named `id` sets the finished ground at a point: it is level at each grid
 * node the ground there is read from, and no platform it gives way to is. False where it has
 * given way (a driveway under the house pad) or near its edge, where its batters come in.
 */
export function setsGroundAt(prep: PreparedEarthworks, id: string, p: Vec2): boolean {
  const own = prep.platforms.find(q => q.id === id)
  if (!own) return false
  const f = prep.natural
  const i0 = Math.floor((p[0] - f.x0) / f.cell)
  const j0 = Math.floor((p[1] - f.y0) / f.cell)
  for (let j = j0; j <= j0 + 1; j++) {
    for (let i = i0; i <= i0 + 1; i++) {
      if (i < 0 || j < 0 || i >= f.nx || j >= f.ny) return false
      const k = j * f.nx + i
      if (own.dist[k] !== 0 || prep.platforms.some(q => q !== own && q.rank < own.rank && q.dist[k] === 0)) return false
    }
  }
  return true
}

/**
 * What set the finished ground at a node: the platform (by its index in prep.platforms) and whether
 * the node is on its level ground or one of its batters. Null where the ground is left natural.
 */
export interface GroundSource {
  platform: number
  how: 'level' | 'cut' | 'fill'
}

/**
 * Finished level at node k with every platform (except fixed ones) raised by `shift`, and
 * without the ramps if `noRamps`. With `why`, also what set it there (see GroundSource).
 */
function designAt(prep: PreparedEarthworks, k: number, shift: number, noRamps = false, why?: { source: GroundSource | null }): number {
  // Worked out just past the boundary too, so the site's edge follows the finished
  // ground; only nodes on the site count towards the volumes.
  const g = prep.natural.z[k]
  let cut = Infinity
  let fill = -Infinity
  const { cutBatter, fillBatter } = prep.opts
  // Where a platform is level, the ones that give way to it are left out. And where only the
  // softest (a driveway) is level, it alone sets the ground: it is built to its own levels, and
  // the batters of the pad and benches stop at its edge.
  let firmest = Infinity
  if (prep.anySoft) for (const p of prep.platforms) if (p.dist[k] === 0 && !(noRamps && p.isRamp)) firmest = Math.min(firmest, p.rank)
  let cutBy = -1
  let fillBy = -1
  for (let n = 0; n < prep.platforms.length; n++) {
    const p = prep.platforms[n]
    const d = p.dist[k]
    if (d === Infinity || p.rank > firmest || (firmest === SOFTEST && p.rank < SOFTEST) || (noRamps && p.isRamp)) continue
    const level = p.levels && p.follow ? p.levels[k] + shift * p.follow[k] : p.fixed ? p.level : p.level + shift
    if (p.cut) {
      const c = d === 0 ? level : level + d / cutBatter
      if (c < cut) {
        cut = c
        cutBy = n
      }
    }
    if (p.fill) {
      const f = d === 0 ? level : level - d / fillBatter
      if (f > fill) {
        fill = f
        fillBy = n
      }
    }
  }
  const z = Math.min(Math.max(g, fill), cut)
  if (why) {
    // The lowest cut wins over everything; otherwise the highest fill, where it's above the ground.
    const by = cut < Math.max(g, fill) ? cutBy : fill > g ? fillBy : -1
    why.source = by < 0 ? null : { platform: by, how: prep.platforms[by].dist[k] === 0 ? 'level' : by === cutBy && cut < Math.max(g, fill) ? 'cut' : 'fill' }
  }
  return z
}

/** What set the finished ground at node k (no balancing shift): a platform's level ground or batter, or null for natural ground. */
export function groundSourceAt(prep: PreparedEarthworks, k: number, shift = 0): GroundSource | null {
  const why: { source: GroundSource | null } = { source: null }
  designAt(prep, k, shift, false, why)
  return why.source
}

function volumes(prep: PreparedEarthworks, shift: number): { cut: number; fill: number } {
  const a = prep.natural.cell * prep.natural.cell
  let cut = 0
  let fill = 0
  for (let k = 0; k < prep.inside.length; k++) {
    if (!prep.inside[k]) continue
    const dz = designAt(prep, k, shift) - prep.natural.z[k]
    if (dz < 0) cut -= dz * a
    else fill += dz * a
  }
  return { cut, fill }
}

/**
 * Cut and fill (m³) with the platforms `drop` picks left out: what the rest would dig and fill
 * without them. The difference from the whole is what those platforms add.
 */
export function volumesWithout(prep: PreparedEarthworks, drop: (p: PreparedPlatform) => boolean): { cut: number; fill: number } {
  const platforms = prep.platforms.filter(p => !drop(p))
  return volumes({ ...prep, platforms, anySoft: platforms.some(p => p.rank > 0) }, 0)
}

export function evaluateEarthworks(prep: PreparedEarthworks, shift = 0): EarthworksResult {
  const n = prep.natural
  const z = new Float32Array(n.z.length)
  const a = n.cell * n.cell
  let cut = 0
  let fill = 0
  let maxCut = 0
  let maxFill = 0
  const edges = new Set<number>()
  for (let k = 0; k < z.length; k++) {
    z[k] = designAt(prep, k, shift)
    if (!prep.inside[k]) continue
    const dz = z[k] - n.z[k]
    if (dz < 0) {
      cut -= dz * a
      maxCut = Math.max(maxCut, -dz)
    } else {
      fill += dz * a
      maxFill = Math.max(maxFill, dz)
    }
    if (Math.abs(dz) > 0.05 && prep.edgeNear[k] >= 0) edges.add(prep.edgeNear[k])
  }
  return {
    grid: new Heightfield(n.x0, n.y0, n.cell, n.nx, n.ny, z),
    cut,
    fill,
    maxCut,
    maxFill,
    boundaryEdges: [...edges].sort((p, q) => p - q),
  }
}

/** How far to raise (or lower) every platform (but fixed ones) so cut and fill balance, or null if they can't. */
export function balancingShift(prep: PreparedEarthworks, range = 6): number | null {
  if (!prep.platforms.some(p => !p.fixed)) return null
  const f = (s: number) => {
    const v = volumes(prep, s)
    return v.fill - v.cut
  }
  let lo = -range
  let hi = range
  if (f(lo) > 0 || f(hi) < 0) return null
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) < 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
