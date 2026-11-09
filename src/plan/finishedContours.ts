import { pointInPolygon, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Heightfield } from '../lib/terrain'
import type { WallStrip } from '../lib/terrainMesh'
import { superlevel } from './groundOverlay'
import { fromSite, toSite, type Placement } from './model'

// Contours of the finished ground, the way a builder's site plan shows them: the proposed contours
// solid where the ground has been cut or filled, the existing ones faint there, and the survey's own
// contours as they are everywhere else. The finished ground is the earthworks' grid, so the lines match
// the 3D ground and the cut and fill totals.

/** Finished ground more than this far (m) from the natural ground counts as cut or filled. */
export const CHANGED = 0.02

export interface ContourRun {
  /** RL. */
  z: number
  major: boolean
  /** In the survey's local frame. */
  pts: Vec2[]
}

export interface FinishedContours {
  /** Is any of the block cut or filled? */
  any: boolean
  /** The contour interval (m), from the survey, and the interval of the labelled ones. */
  minor: number
  major: number
  /** The survey's contours where the ground is as it was. */
  natural: ContourRun[]
  /** The survey's contours where the ground has been cut or filled. */
  existing: ContourRun[]
  /** The finished ground's contours where it differs from the natural ground. */
  finished: ContourRun[]
  /** Is the ground at (x, y) in the local frame cut or filled? */
  changedAt: (x: number, y: number) => boolean
}

const NICE = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10]

/** The survey's contour interval: the smallest step between its contours' levels, as a round number, and 1 m (or 5 steps) for the labelled ones. */
export function contourInterval(survey: Pick<Survey, 'contours'>): { minor: number; major: number } {
  const zs = [...new Set(survey.contours.map(c => Math.round(c.z * 1000) / 1000))].sort((a, b) => a - b)
  let gap = Infinity
  for (let i = 1; i < zs.length; i++) if (zs[i] - zs[i - 1] > 1e-3) gap = Math.min(gap, zs[i] - zs[i - 1])
  const minor = gap === Infinity ? 0.25 : NICE.reduce((best, n) => (Math.abs(Math.log(n / gap)) < Math.abs(Math.log(best / gap)) ? n : best))
  return { minor, major: minor < 1 ? 1 : minor * 5 }
}

const NO_WALLS: WallStrip[] = []
const cache = new WeakMap<Heightfield, { survey: Survey; natural: Heightfield; walls: WallStrip[]; value: FinishedContours }>()

/**
 * Worked out once for each earthworks result (its finished grid), however often the plan redraws.
 * `walls` are the retaining walls, which the finished contours stop at rather than crowding into the
 * step the grid makes across each one.
 */
export function finishedContours(survey: Survey, natural: Heightfield, finished: Heightfield, walls: WallStrip[] = NO_WALLS): FinishedContours {
  const hit = cache.get(finished)
  if (hit && hit.survey === survey && hit.natural === natural && hit.walls === walls) return hit.value
  const value = build(survey, natural, finished, walls)
  cache.set(finished, { survey, natural, walls, value })
  return value
}

function build(survey: Survey, natural: Heightfield, finished: Heightfield, walls: WallStrip[]): FinishedContours {
  const { minor, major } = contourInterval(survey)
  const isMajor = (z: number) => Math.abs(z / major - Math.round(z / major)) < 1e-6
  const inside = (p: Vec2) => pointInPolygon(p[0], p[1], survey.boundary)
  const changedAt = (x: number, y: number) => Math.abs(finished.sample(x, y) - natural.sample(x, y)) > CHANGED

  // The survey's contours, split where they pass in and out of the works, in pieces of half a grid cell.
  const keep: ContourRun[] = []
  const faint: ContourRun[] = []
  const step = finished.cell / 2
  for (const c of survey.contours) {
    let kind = 0 // 0 off the block, 1 as it was, 2 cut or filled
    let pts: Vec2[] = []
    const flush = () => {
      if (kind && pts.length > 1) (kind === 1 ? keep : faint).push({ z: c.z, major: c.major, pts })
      pts = []
    }
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const a: Vec2 = [c.pts[i][0], c.pts[i][1]]
      const b: Vec2 = [c.pts[i + 1][0], c.pts[i + 1][1]]
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
      const at = (f: number): Vec2 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
      for (let k = 0; k < n; k++) {
        const m = at((k + 0.5) / n)
        const here = !inside(m) ? 0 : changedAt(m[0], m[1]) ? 2 : 1
        if (here !== kind) {
          const p = at(k / n)
          // The run so far ends where this piece starts (at a segment's start it already does).
          if (k > 0 && pts.length) pts.push(p)
          flush()
          kind = here
          pts = [p]
        } else if (!pts.length) pts = [a]
      }
      pts.push(b)
    }
    flush()
  }

  // The step across a retaining wall lies within a grid cell or so of it; contours stop there.
  const reach = finished.cell * 1.5
  const inWall = ([x, y]: Vec2) =>
    walls.some(w => {
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])
      if (len < 1e-9) return false
      const ux = (w.b[0] - w.a[0]) / len
      const uy = (w.b[1] - w.a[1]) / len
      const t = (x - w.a[0]) * ux + (y - w.a[1]) * uy
      return t >= 0 && t <= len && Math.abs(-(x - w.a[0]) * uy + (y - w.a[1]) * ux) < Math.max(reach, w.half)
    })

  // Where the finished ground differs, and how high and low it goes there.
  let lo = Infinity
  let hi = -Infinity
  for (let k = 0; k < finished.z.length; k++) {
    if (Math.abs(finished.z[k] - natural.z[k]) <= CHANGED) continue
    lo = Math.min(lo, finished.z[k])
    hi = Math.max(hi, finished.z[k])
  }
  const lines: ContourRun[] = []
  if (lo <= hi) {
    const vals = Float64Array.from(finished.z)
    for (let i = Math.ceil(lo / minor - 1e-9); i * minor <= hi + 1e-9; i++) {
      const z = Math.round(i * minor * 1000) / 1000
      for (const pts of contourLines(finished, z, vals)) {
        const on = pts.map(p => inside(p) && changedAt(p[0], p[1]) && !inWall(p))
        // The runs through the works, each carried one point on so it reaches the natural contour it becomes.
        for (let s = 0; s < pts.length; s++) {
          if (!on[s]) continue
          let e = s
          while (e + 1 < pts.length && on[e + 1]) e++
          const from = s > 0 && inside(pts[s - 1]) && !inWall(pts[s - 1]) ? s - 1 : s
          const to = e + 1 < pts.length && inside(pts[e + 1]) && !inWall(pts[e + 1]) ? e + 1 : e
          // Scraps under a metre (or four grid cells) are the grid's noise on nearly level ground, not contours.
          const run = pts.slice(from, to + 1)
          if (to > from && length(run) >= Math.max(1, 4 * finished.cell)) lines.push({ z, major: isMajor(z), pts: run })
          s = e
        }
      }
    }
  }
  return { any: lo <= hi, minor, major, natural: keep, existing: faint, finished: lines, changedAt }
}

/** The contour at RL z over the whole of a grid, as lines in the grid's frame; `vals` is the grid's heights, if already to hand. */
export function contourLines(grid: Heightfield, z: number, vals = Float64Array.from(grid.z)): Vec2[][] {
  const { nx, ny, cell, x0, y0 } = grid
  return superlevel(vals, nx, ny, z).lines.map(line => line.map(([u, v]): Vec2 => [x0 + u * cell, y0 + v * cell]))
}

function length(pts: Vec2[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return len
}

/** Where to write a run's RL: its middle point, if it's long enough (m) to carry a label. */
export function labelPoint(run: ContourRun, min: number): Vec2 | null {
  const len = length(run.pts)
  if (len < min) return null
  let half = len / 2
  for (let i = 1; i < run.pts.length; i++) {
    const [a, b] = [run.pts[i - 1], run.pts[i]]
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (d >= half && d > 0) return [a[0] + ((b[0] - a[0]) * half) / d, a[1] + ((b[1] - a[1]) * half) / d]
    half -= d
  }
  return run.pts[run.pts.length - 1]
}

/** An RL as a contour label: whole metres as "84", others to the centimetre. */
export function contourText(z: number): string {
  return Math.abs(z - Math.round(z)) < 1e-6 ? z.toFixed(0) : z.toFixed(2)
}

/** The contours on the plan, in the house's frame, split by kind. */
export interface PlanContours {
  natural: { minor: Vec2[][]; major: Vec2[][] }
  existing: { minor: Vec2[][]; major: Vec2[][] }
  finished: { minor: Vec2[][]; major: Vec2[][] }
  labels: { p: Vec2; text: string; finished: boolean }[]
}

/**
 * The contours for the plan once the ground has been cut or filled. `natural` labels are the plan's
 * usual ones; those that now sit on cut or filled ground are dropped, and the finished contours get their own.
 */
export function planContours(fc: FinishedContours, pl: Placement, origin: Vec2, natural: { p: Vec2; text: string }[]): PlanContours {
  const tf = (p: Vec2) => fromSite(p, pl, origin)
  const split = (runs: ContourRun[]) => ({
    minor: runs.filter(r => !r.major).map(r => r.pts.map(tf)),
    major: runs.filter(r => r.major).map(r => r.pts.map(tf)),
  })
  const labels: PlanContours['labels'] = natural
    .filter(l => {
      const s = toSite(l.p, pl, origin)
      return !fc.changedAt(s[0], s[1])
    })
    .map(l => ({ ...l, finished: false }))
  for (const r of fc.finished) {
    if (!r.major) continue
    const p = labelPoint(r, 2)
    if (p) labels.push({ p: tf(p), text: contourText(r.z), finished: true })
  }
  return { natural: split(fc.natural), existing: split(fc.existing), finished: split(fc.finished), labels }
}

const PREF = 'plan-finished-contours-v1'

/** The finished contours switch as last set in this browser: on, off, or null when it hasn't been touched. */
export function readFinishedPref(): boolean | null {
  try {
    const v = localStorage.getItem(PREF)
    return v === 'on' ? true : v === 'off' ? false : null
  } catch {
    return null
  }
}

/**
 * Whether to draw the finished contours: as the user chose, else only in Earthworks, where the
 * ground is the subject. On Design › Plan they crowd the house, so there they wait to be asked for.
 */
export const finishedShown = (pref: boolean | null, earthworks: boolean): boolean => pref ?? earthworks

export function saveFinishedPref(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? 'on' : 'off')
  } catch {
    // Not kept; it still works for this visit.
  }
}
