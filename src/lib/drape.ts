import { bounds, clipPolygonToRect, convexHull, signedArea, type Vec2 } from './geom'
import type { Heightfield } from './terrain'
import { triangulate } from './triangulate'

/**
 * Lay a polygon (survey local frame) over the ground: triangles that follow the
 * grid, as xyz triples with z = ground level + lift.
 */
export function drapePolygon(grid: Heightfield, poly: Vec2[], lift: number): number[] {
  const out: number[] = []
  if (poly.length < 3 || Math.abs(signedArea(poly)) < 1e-9) return out
  const b = bounds(poly)
  const { cell, x0, y0 } = grid
  const i0 = Math.floor((b.minX - x0) / cell)
  const i1 = Math.ceil((b.maxX - x0) / cell)
  const j0 = Math.floor((b.minY - y0) / cell)
  const j1 = Math.ceil((b.maxY - y0) / cell)
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      const r = { minX: x0 + i * cell, minY: y0 + j * cell, maxX: x0 + (i + 1) * cell, maxY: y0 + (j + 1) * cell }
      const piece = clipPolygonToRect(poly, r)
      if (piece.length < 3 || Math.abs(signedArea(piece)) < 1e-10) continue
      const ccw = signedArea(piece) > 0
      for (const [a, bb, c] of triangulate(piece)) {
        for (const k of ccw ? [a, bb, c] : [a, c, bb]) {
          const p = piece[k]
          out.push(p[0], p[1], grid.sample(p[0], p[1]) + lift)
        }
      }
    }
  }
  return out
}

/** About a car's wheelbase: the run the steepest grade along a driveway is measured over (m). */
export const DRIVE_RUN = 3
/** Steeper than 1 in 4 along a driveway is hard to drive on. */
export const MAX_DRIVE_GRADE = 0.25

export interface DriveGrade {
  /** Length along the drive's long axis (m). */
  length: number
  /** From one end of the centreline to the other (rise over run). */
  average: number
  /** Steepest over any DRIVE_RUN of the centreline, or over its whole length if shorter. */
  steepest: number
  /** Steepest fall across the drive, edge to edge at right angles to its axis. */
  crossFall: number
}

/** Long and short directions of a polygon: the sides of the smallest rectangle round it. */
function longAxis(poly: Vec2[]): { u: Vec2; v: Vec2 } {
  const hull = convexHull(poly)
  let best = { area: Infinity, e: [1, 0] as Vec2, long: true }
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-9) continue
    const e: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    const s = hull.map(p => p[0] * e[0] + p[1] * e[1])
    const t = hull.map(p => -p[0] * e[1] + p[1] * e[0])
    const ls = Math.max(...s) - Math.min(...s)
    const lt = Math.max(...t) - Math.min(...t)
    if (ls * lt < best.area - 1e-12) best = { area: ls * lt, e, long: ls >= lt }
  }
  const u: Vec2 = best.long ? best.e : [-best.e[1], best.e[0]]
  return { u, v: [-u[1], u[0]] }
}

/** Anything with a level at each point: the ground's grid, or a driveway built to its own levels. */
export type Surface = Pick<Heightfield, 'sample' | 'cell'>

/** A driveway's long axis, its outline along and across it, and the stations just inside each end. */
interface DriveFrame {
  /** Along the drive, and across it. */
  u: Vec2
  v: Vec2
  /** Where the drive is at a station along it: its widest stretch across. */
  across: (s: number) => [number, number] | null
  length: number
  s0: number
  s1: number
}

function driveFrame(poly: Vec2[]): DriveFrame | null {
  if (poly.length < 3 || Math.abs(signedArea(poly)) < 1e-9) return null
  const { u, v } = longAxis(poly)
  // The outline in (along, across) coordinates.
  const st = poly.map(p => [p[0] * u[0] + p[1] * u[1], p[0] * v[0] + p[1] * v[1]] as Vec2)
  const across = (s: number): [number, number] | null => {
    const ts: number[] = []
    for (let i = 0; i < st.length; i++) {
      const a = st[i]
      const b = st[(i + 1) % st.length]
      if (a[0] <= s !== b[0] <= s) ts.push(a[1] + ((s - a[0]) / (b[0] - a[0])) * (b[1] - a[1]))
    }
    ts.sort((p, q) => p - q)
    let best: [number, number] | null = null
    for (let i = 0; i + 1 < ts.length; i += 2) if (!best || ts[i + 1] - ts[i] > best[1] - best[0]) best = [ts[i], ts[i + 1]]
    return best
  }
  const ss = st.map(p => p[0])
  const length = Math.max(...ss) - Math.min(...ss)
  if (length < 1e-6) return null
  // Just inside each end, where the stretch across is still the drive's own.
  return { u, v, across, length, s0: Math.min(...ss) + 1e-6 * length, s1: Math.max(...ss) - 1e-6 * length }
}

/** A point given as (along, across) the drive. */
const atStation = (f: DriveFrame, s: number, t: number): Vec2 => [s * f.u[0] + t * f.v[0], s * f.u[1] + t * f.v[1]]

/** The middle of the drive across a station. */
function centreAt(f: DriveFrame, s: number): Vec2 | null {
  const c = f.across(s)
  return c ? atStation(f, s, (c[0] + c[1]) / 2) : null
}

/**
 * How steep a driveway is to drive, on the given ground: grades along the centreline of its
 * long axis (the long side of the smallest rectangle round it), and the fall across it.
 * With `own`, only over the stretch of centreline where it holds (where the drive is built to
 * its own levels, not where the house pad has taken over); `length` is still the whole drive's.
 */
export function drivewayGrade(grid: Surface, poly: Vec2[], own?: (p: Vec2) => boolean): DriveGrade | null {
  const f = driveFrame(poly)
  if (!f) return null
  let { s0, s1 } = f
  const length = f.length
  if (own) {
    const n = Math.max(1, Math.ceil((s1 - s0) / (grid.cell / 2)))
    const kept: number[] = []
    for (let k = 0; k <= n; k++) {
      const s = f.s0 + ((f.s1 - f.s0) * k) / n
      const c = centreAt(f, s)
      if (c && own(c)) kept.push(s)
    }
    if (kept.length < 2) return null
    s0 = kept[0]
    s1 = kept[kept.length - 1]
  }
  const z = (s: number, t: number) => {
    const p = atStation(f, s, t)
    return grid.sample(p[0], p[1])
  }
  const across = f.across
  const centre = (s: number) => {
    const c = across(s)
    return c ? z(s, (c[0] + c[1]) / 2) : NaN
  }
  const span = s1 - s0
  const run = Math.min(DRIVE_RUN, span)
  const n = Math.max(1, Math.ceil(span / (grid.cell / 2)))
  // The run that ends at the far end, then every run starting at a station.
  let steepest = Math.abs(centre(s1) - centre(s1 - run)) / run
  let crossFall = 0
  for (let k = 0; k <= n; k++) {
    const s = s0 + (span * k) / n
    if (s + run <= s1) steepest = Math.max(steepest, Math.abs(centre(s + run) - centre(s)) / run)
    const c = across(s)
    if (c && c[1] - c[0] > 1e-6) crossFall = Math.max(crossFall, Math.abs(z(s, c[1]) - z(s, c[0])) / (c[1] - c[0]))
  }
  return { length, average: Math.abs(centre(s1) - centre(s0)) / span, steepest, crossFall }
}

/**
 * The middle of each end of a driveway, where its grade along it is measured from and to, and
 * the direction along it (from a towards b): the chainage its levels are graded along.
 */
export function driveEnds(poly: Vec2[]): { a: Vec2; b: Vec2; u: Vec2; length: number } | null {
  const f = driveFrame(poly)
  if (!f) return null
  const a = centreAt(f, f.s0)
  const b = centreAt(f, f.s1)
  return a && b ? { a, b, u: f.u, length: f.length } : null
}

/**
 * How wide a driveway is across its long axis: the narrowest and widest stretch, and at each end
 * (just inside it), sampled every 0.25 m. Null for an outline with no length.
 */
export function driveWidth(poly: Vec2[]): { min: number; max: number; a: number; b: number } | null {
  const f = driveFrame(poly)
  if (!f) return null
  const w = (s: number) => {
    const c = f.across(s)
    return c ? c[1] - c[0] : 0
  }
  const n = Math.max(2, Math.ceil(f.length / 0.25))
  // Away from the very ends, where a skewed end tapers to a point.
  const inset = Math.min(0.25, f.length / 4)
  const ws: number[] = []
  for (let k = 0; k <= n; k++) ws.push(w(f.s0 + inset + ((f.s1 - f.s0 - 2 * inset) * k) / n))
  return { min: Math.min(...ws), max: Math.max(...ws), a: ws[0], b: ws[ws.length - 1] }
}

/** A grade as "1 in 7.9 (13%)", or "level (0%)" when it rounds to 0 %. */
export function gradeText(g: number): string {
  return g < 0.005 ? 'level (0%)' : `1 in ${(1 / g).toFixed(1)} (${(g * 100).toFixed(0)}%)`
}

/** Whether the steepest stretch along the drive is drivable. */
export function driveVerdict(g: DriveGrade): string {
  return g.steepest > MAX_DRIVE_GRADE ? 'Too steep: over 1 in 4' : 'OK to drive'
}
