import { pointInPolygon, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Heightfield } from '../lib/terrain'
import { levelById, toSite, type Placement, type Plan } from './model'

/** The tint on the plan gets a shade stronger every this many metres between the floor and the natural ground. */
export const BAND_STEP = 0.5
/** Shades each side of the floor; the last one runs on to any depth. */
export const BANDS = 5

/** RL of a level's finished floor: the ground floor's level plus the level's height above it. */
export function levelFloorRL(plan: Plan, levelId: string): number {
  return plan.placement.ffl + (levelById(plan, levelId)?.elevation ?? 0)
}

/**
 * Which shade a spot gets, from how far the floor is above the natural ground there (m):
 * 0 to BANDS - 1 where the floor is above the ground (fill or piers), -1 to -BANDS where
 * it is below (cut), further from 0 the deeper it is.
 */
export function bandOf(above: number, step = BAND_STEP): number {
  return Math.min(BANDS - 1, Math.max(-BANDS, Math.floor(above / step)))
}

/** Natural ground at a point on the plan, or null off the block. */
export function groundAtPlan(p: Vec2, pl: Placement, survey: Pick<Survey, 'origin' | 'boundary'>, grid: Heightfield): number | null {
  const q = toSite(p, pl, survey.origin)
  return pointInPolygon(q[0], q[1], survey.boundary) ? grid.sample(q[0], q[1]) : null
}

/** How far a floor at `rl` is above the natural ground at each point on the plan (negative below it), or null off the block. */
export function cornerOffsets(pts: Vec2[], rl: number, pl: Placement, survey: Pick<Survey, 'origin' | 'boundary'>, grid: Heightfield): (number | null)[] {
  return pts.map(p => {
    const g = groundAtPlan(p, pl, survey, grid)
    return g === null ? null : rl - g
  })
}

/** A height difference written for a corner: "+0.75" above the ground, "−0.40" below it. */
export function formatOffset(above: number): string {
  if (Math.abs(above) < 0.005) return '0.00'
  return `${above > 0 ? '+' : '−'}${Math.abs(above).toFixed(2)}`
}

/** The floor against the natural ground under the pointer, in plain words. */
export function floorVsGround(ground: number, floor: number, lowest: boolean): string {
  const d = floor - ground
  const m = `${Math.abs(d).toFixed(2)} m`
  const floorIs = lowest ? 'floor' : 'this floor is'
  if (Math.abs(d) < 0.005) return `${floorIs} level with the ground`
  if (d < 0) return `${floorIs} ${m} below ground (cut)`
  return `${floorIs} ${m} above ground${lowest ? ' (fill or piers)' : ''}`
}

/** Lowest and highest natural ground under an outline on the plan: at its corners and at every grid point inside. */
export function groundRange(poly: Vec2[], pl: Placement, origin: Vec2, grid: Heightfield): { min: number; max: number } | null {
  if (poly.length < 3) return null
  const site = poly.map(p => toSite(p, pl, origin))
  let min = Infinity
  let max = -Infinity
  const add = (z: number) => {
    if (z < min) min = z
    if (z > max) max = z
  }
  for (const q of site) add(grid.sample(q[0], q[1]))
  const xs = site.map(q => q[0])
  const ys = site.map(q => q[1])
  const i0 = Math.max(0, Math.ceil((Math.min(...xs) - grid.x0) / grid.cell))
  const i1 = Math.min(grid.nx - 1, Math.floor((Math.max(...xs) - grid.x0) / grid.cell))
  const j0 = Math.max(0, Math.ceil((Math.min(...ys) - grid.y0) / grid.cell))
  const j1 = Math.min(grid.ny - 1, Math.floor((Math.max(...ys) - grid.y0) / grid.cell))
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (pointInPolygon(grid.x0 + i * grid.cell, grid.y0 + j * grid.cell, site)) add(grid.at(i, j))
    }
  }
  return { min, max }
}

/** One line on how the natural ground under a room sits against its floor. */
export function groundUnder(range: { min: number; max: number }, floor: number, kind: 'slab' | 'piers' | 'upper'): string {
  const m = (n: number) => `${n.toFixed(2)} m`
  const rls = range.max - range.min < 0.005 ? `RL ${range.min.toFixed(2)}` : `RL ${range.min.toFixed(2)} to ${range.max.toFixed(2)}`
  const cut = range.max - floor
  const fill = floor - range.min
  const parts: string[] = []
  if (kind === 'upper') {
    if (cut <= 0.005) parts.push(`this floor is ${m(-cut)} to ${m(fill)} above it`)
    else if (fill > 0.005) parts.push(`this floor is up to ${m(fill)} above it and ${m(cut)} below it (cut)`)
    else parts.push(`this floor is up to ${m(cut)} below it (cut)`)
  } else {
    if (cut > 0.005) parts.push(`up to ${m(cut)} of cut`)
    if (fill > 0.005) parts.push(kind === 'piers' ? `the floor up to ${m(fill)} above it` : `up to ${m(fill)} of fill`)
    if (!parts.length) parts.push('level with the floor')
  }
  return `Ground under this room ${rls}: ${parts.join(' and ')}.`
}

// ---------------------------------------------------------------------------
// The natural ground against one floor level, over the whole grid.
//
// Each grid cell is split into two triangles along its (i, j)-(i+1, j+1) diagonal, with
// the ground flat across each triangle. For each step of depth the line where the ground
// is that far from the floor is traced and closed along the edge of the grid, giving the
// outline of everywhere at least that far above (or below) the floor. The shades are those
// outlines stacked, so they and the line where the ground meets the floor fit together
// exactly. Geometry is in grid units (u = i, v = j) to keep the SVG paths short:
// x = x0 + u * cell, y = y0 + v * cell in the site frame.

/** Grid edges are keyed by node: index * 3, plus 0 for the edge east, 1 north and 2 north-east. */
const EDGE: [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
]

/**
 * Where `vals` is at least t, in grid units: the lines where it crosses t, each with that
 * side on its left, and the rings outlining it (the lines closed along the edge of the
 * grid), to fill even-odd.
 */
export function superlevel(vals: Float64Array, nx: number, ny: number, t: number): { rings: Vec2[][]; lines: Vec2[][] } {
  const W = nx - 1
  const H = ny - 1
  const inside = (k: number) => vals[k] >= t
  const along = (key: number) => {
    const n = Math.floor(key / 3)
    const [di, dj] = EDGE[key % 3]
    return (t - vals[n]) / (vals[n + di + dj * nx] - vals[n])
  }
  const point = (key: number): Vec2 => {
    const n = Math.floor(key / 3)
    const [di, dj] = EDGE[key % 3]
    const s = along(key)
    return [(n % nx) + di * s, Math.floor(n / nx) + dj * s]
  }

  const next = new Map<number, number>()
  const entered = new Set<number>()
  // A triangle with its corners anticlockwise and the edges between them: a segment across
  // it from edge to edge, with the corners at or above t on its left.
  const triangle = (a: boolean, b: boolean, c: boolean, ab: number, bc: number, ca: number) => {
    if (a === b && b === c) return
    // The corner on its own, and its edges out and in.
    const [lone, out, into] = a !== b && a !== c ? [a, ab, ca] : a === c ? [b, bc, ab] : [c, ca, bc]
    const [from, to] = lone ? [out, into] : [into, out]
    next.set(from, to)
    entered.add(to)
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const n = j * nx + i
      const a = inside(n)
      const b = inside(n + 1)
      const c = inside(n + nx + 1)
      const d = inside(n + nx)
      if (a === b && a === c && a === d) continue
      triangle(a, b, c, n * 3, (n + 1) * 3 + 1, n * 3 + 2)
      triangle(a, c, d, n * 3 + 2, (n + nx) * 3, n * 3 + 1)
    }
  }

  // Follow the segments into lines: open ones start and end on the edge of the grid, the rest are loops.
  const seen = new Set<number>()
  const trace = (start: number) => {
    const keys = [start]
    seen.add(start)
    let k = next.get(start)
    while (k !== undefined && !seen.has(k)) {
      keys.push(k)
      seen.add(k)
      k = next.get(k)
    }
    return { pts: keys.map(point), first: start, last: keys[keys.length - 1] }
  }
  const open = [...next.keys()].filter(k => !entered.has(k)).map(trace)
  const loops: ReturnType<typeof trace>[] = []
  for (const k of next.keys()) if (!seen.has(k)) loops.push(trace(k))
  const rings = loops.map(l => l.pts)

  // Close the open lines anticlockwise along the edge of the grid, which keeps the side at or above t on the left.
  const P = 2 * (W + H)
  /** How far anticlockwise round the edge of the grid from (0, 0) a crossing on it is. */
  const round = (key: number) => {
    const n = Math.floor(key / 3)
    const i = n % nx
    const j = Math.floor(n / nx)
    // Nudged off the grid's corners, so a crossing right at one sorts onto its own side.
    const s = Math.min(Math.max(along(key), 1e-6), 1 - 1e-6)
    if (key % 3 === 0) return j === 0 ? i + s : 2 * W + H - (i + s)
    return i === W ? W + j + s : P - (j + s)
  }
  const corners: [number, Vec2][] = [
    [W, [W, 0]],
    [W + H, [W, H]],
    [2 * W + H, [0, H]],
    [P, [0, 0]],
  ]
  if (!open.length) {
    if (inside(0)) rings.push([[0, 0], [W, 0], [W, H], [0, H]])
  } else {
    const starts = open.map(l => round(l.first))
    const done = new Uint8Array(open.length)
    for (let first = 0; first < open.length; first++) {
      if (done[first]) continue
      const ring: Vec2[] = []
      let cur = first
      while (!done[cur]) {
        done[cur] = 1
        ring.push(...open[cur].pts)
        // On to the next line that starts round the edge, by way of any corners of the grid.
        const end = round(open[cur].last)
        let gap = Infinity
        starts.forEach((s, m) => {
          const g = (s - end + P) % P
          if (g < gap) {
            gap = g
            cur = m
          }
        })
        const passed = corners.map(([c, p]) => [(c - end + P) % P, p] as const).filter(([g]) => g > 0 && g < gap)
        ring.push(...passed.sort((x, y) => x[0] - y[0]).map(([, p]) => p))
      }
      rings.push(ring)
    }
  }
  return { rings, lines: [...open.map(l => l.pts), ...loops.map(l => [...l.pts, l.pts[0]])] }
}

/** How far the floor is above the natural ground at every grid point, and how far below. */
function depths(grid: Heightfield, rl: number): { up: Float64Array; down: Float64Array } {
  const up = new Float64Array(grid.z.length)
  const down = new Float64Array(grid.z.length)
  for (let k = 0; k < up.length; k++) {
    up[k] = rl - grid.z[k]
    down[k] = grid.z[k] - rl
  }
  return { up, down }
}

/**
 * Everywhere the floor is at least `k` steps above the natural ground (`above[k]`) or below
 * it (`below[k]`), as rings in the site frame to fill even-odd. `above[0]` is all the
 * ground lower than the floor, and `below[0]` all the ground higher than it.
 */
export function groundLayers(grid: Heightfield, rl: number, step = BAND_STEP): { above: Vec2[][][]; below: Vec2[][][] } {
  const { up, down } = depths(grid, rl)
  const site = (rings: Vec2[][]) => rings.map(r => r.map(([u, v]): Vec2 => [grid.x0 + u * grid.cell, grid.y0 + v * grid.cell]))
  const layers = (vals: Float64Array) => Array.from({ length: BANDS }, (_, k) => site(superlevel(vals, grid.nx, grid.ny, k * step).rings))
  return { above: layers(up), below: layers(down) }
}

export interface GroundOverlay {
  /** The floor RL it was worked out for. */
  rl: number
  boundary: Vec2[]
  /** Grid units to the site frame: x = x0 + u * cell, y = y0 + v * cell. */
  x0: number
  y0: number
  cell: number
  /** SVG path data (grid units, to fill even-odd) for everywhere the floor is at least k steps above the ground. */
  above: string[]
  /** ...and at least k steps below it. */
  below: string[]
  /** Where the ground meets the floor, as path data in grid units, over the whole grid. */
  meetsPath: string
  /** The same line on the block, as polylines in the site frame. */
  meets: Vec2[][]
  /** The block's boundary in grid units, to clip the shades to. */
  clip: string
}

const num = (n: number) => String(Math.round(n * 100) / 100)
const linePath = (pts: Vec2[]) => `M${pts.map(p => `${num(p[0])} ${num(p[1])}`).join(' ')}`
const ringsPath = (rings: Vec2[][]) => rings.map(r => `${linePath(r)}Z`).join('')

function buildOverlay(grid: Heightfield, boundary: Vec2[], rl: number): GroundOverlay {
  const { nx, ny } = grid
  const { up, down } = depths(grid, rl)
  const above = Array.from({ length: BANDS }, (_, k) => superlevel(up, nx, ny, k * BAND_STEP))
  const below = Array.from({ length: BANDS }, (_, k) => superlevel(down, nx, ny, k * BAND_STEP))
  const lines = above[0].lines
  // Keep the runs of the line that are on the block.
  const meets: Vec2[][] = []
  for (const line of lines) {
    let run: Vec2[] = []
    for (const [u, v] of line) {
      const q: Vec2 = [grid.x0 + u * grid.cell, grid.y0 + v * grid.cell]
      if (pointInPolygon(q[0], q[1], boundary)) run.push(q)
      else {
        if (run.length > 1) meets.push(run)
        run = []
      }
    }
    if (run.length > 1) meets.push(run)
  }
  return {
    rl,
    boundary,
    x0: grid.x0,
    y0: grid.y0,
    cell: grid.cell,
    above: above.map(l => ringsPath(l.rings)),
    below: below.map(l => ringsPath(l.rings)),
    meetsPath: lines.map(linePath).join(''),
    meets,
    clip: ringsPath([boundary.map(([x, y]): Vec2 => [(x - grid.x0) / grid.cell, (y - grid.y0) / grid.cell])]),
  }
}

const cache = new WeakMap<Heightfield, GroundOverlay[]>()

/**
 * The natural ground against a floor at `rl`, in the site frame. It depends only on the
 * survey and the floor level, so moving or turning the house, drawing, and pointing
 * around the plan reuse it; the last few floor levels are kept for flipping between levels.
 */
export function groundOverlay(grid: Heightfield, boundary: Vec2[], rl: number): GroundOverlay {
  const list = cache.get(grid) ?? []
  const hit = list.find(o => o.rl === rl && o.boundary === boundary)
  if (hit) return hit
  const o = buildOverlay(grid, boundary, rl)
  cache.set(grid, [o, ...list].slice(0, 6))
  return o
}

/** How far past the house (and anything else drawn on the level) the ground tint reaches, in metres. */
export const NEAR_HOUSE = 4

/**
 * What the tint stays near, in the plan frame: the outline of this level's walls and its
 * outdoor areas (filled), and every wall and anything being drawn (as lines). An empty level
 * uses the lowest level's, so an upper floor starts with the tint round the house below.
 * Null when nothing at all is drawn yet: the whole block is tinted, to help place the house.
 */
export interface NearShapes {
  filled: Vec2[][]
  lines: Vec2[][]
}

export function nearShapes(plan: Plan, level: string, outline: (levelId: string) => Vec2[][], drafts: Vec2[][]): NearShapes | null {
  const of = (id: string): NearShapes => ({
    filled: [...outline(id), ...plan.areas.filter(a => a.level === id).map(a => a.pts)],
    lines: plan.walls.filter(w => w.level === id).map(w => [w.a, w.b]),
  })
  const draft = drafts.filter(d => d.length > 0)
  let s = of(level)
  if (!s.filled.length && !s.lines.length) {
    const lowest = [...plan.levels].sort((a, b) => a.elevation - b.elevation)[0]
    if (lowest && lowest.id !== level) s = of(lowest.id)
  }
  if (!s.filled.length && !s.lines.length && !draft.length) return null
  return { filled: s.filled, lines: [...s.lines, ...draft] }
}

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Whether a plan point is within `reach` metres of the shapes (inside a filled one counts). */
export function isNear(p: Vec2, s: NearShapes, reach: number): boolean {
  if (s.filled.some(r => pointInPolygon(p[0], p[1], r))) return true
  const near = (pts: Vec2[], closed: boolean) => {
    if (pts.length === 1) return Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) <= reach
    const n = closed ? pts.length : pts.length - 1
    for (let i = 0; i < n; i++) if (segDist(p, pts[i], pts[(i + 1) % pts.length]) <= reach) return true
    return false
  }
  return s.filled.some(r => near(r, true)) || s.lines.some(l => near(l, false))
}
