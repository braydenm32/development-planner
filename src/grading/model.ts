// Grading painted with the Cut and Fill brushes (Earthworks › Cut & fill): ground brought down,
// or up, to a level. Each target level is one area of painted squares on a coarse grid fixed to
// the survey's eastings and northings, so the painting stays put when the house moves, and is
// kept small as runs along each row. The areas feed the earthworks as platforms (see
// gradingPlatforms), with batters at their edges like any other levelled ground.

import type { Platform } from '../lib/earthworks'
import type { Vec2 } from '../lib/geom'

/** Cut brings ground above the level down to it and leaves lower ground alone; Fill raises ground below it and leaves higher ground alone. */
export type GradeMode = 'cut' | 'fill'

/** What a stroke does: paint with a mode at a level, or rub out. */
export type BrushMode = GradeMode | 'erase'

/** Ground painted to one level. */
export interface GradeArea {
  id: string
  mode: GradeMode
  /** The level it's brought to (RL, m). */
  rl: number
  /** Painted squares, as [row, first column, last column] runs on the grading grid. */
  rows: [number, number, number][]
}

/** A suggested retaining wall the person said no to, remembered by where it was (survey coordinates) and which way it ran. */
export interface DismissedWall {
  at: Vec2
  /** Direction of the line, degrees in [0, 180). */
  dir: number
}

/** The plan's painted grading. Missing in plans without any. */
export interface Grading {
  /** Side of a painted square (m). Square (i, j) covers easting i·cell to (i + 1)·cell, northing j·cell to (j + 1)·cell. */
  cell: number
  areas: GradeArea[]
  dismissed?: DismissedWall[]
}

/** Side of a painted square: fine enough to follow a brush, coarse enough to keep a plan small (m). */
export const GRADE_CELL = 0.5

/** Brush sizes, as a radius (m). */
export const BRUSH_MIN = 0.5
export const BRUSH_MAX = 10
export const BRUSH_DEFAULT = 1.5

/** Two levels this close (m) are the same target: painting at either adds to one area. */
const SAME_LEVEL = 0.0005

const key = (i: number, j: number) => `${i},${j}`
const unkey = (k: string): [number, number] => {
  const c = k.indexOf(',')
  return [Number(k.slice(0, c)), Number(k.slice(c + 1))]
}

let counter = 0
const gradeId = () => `grade_${Date.now().toString(36)}${(counter = (counter + 1) % 1e6).toString(36)}${Math.random().toString(36).slice(2, 5)}`

/** Every painted square of an area, as "i,j" keys. */
export function areaCells(a: Pick<GradeArea, 'rows'>): Set<string> {
  const out = new Set<string>()
  for (const [j, i0, i1] of a.rows) for (let i = i0; i <= i1; i++) out.add(key(i, j))
  return out
}

/** Squares as runs along each row, bottom row first. */
export function rowsOf(cells: Iterable<string>): [number, number, number][] {
  const byRow = new Map<number, number[]>()
  for (const k of cells) {
    const [i, j] = unkey(k)
    const r = byRow.get(j)
    if (r) r.push(i)
    else byRow.set(j, [i])
  }
  const out: [number, number, number][] = []
  for (const j of [...byRow.keys()].sort((a, b) => a - b)) {
    const is = byRow.get(j)!.sort((a, b) => a - b)
    let start = is[0]
    for (let n = 1; n <= is.length; n++) {
      if (n < is.length && is[n] === is[n - 1] + 1) continue
      out.push([j, start, is[n - 1]])
      start = is[n]
    }
  }
  return out
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

/**
 * The squares a brush of `radius` covers along a path (survey coordinates): every square whose
 * middle is within the radius of the path. A single point is a round dab.
 */
export function strokeCells(path: Vec2[], radius: number, cell = GRADE_CELL, into = new Set<string>()): Set<string> {
  if (!path.length) return into
  const segs: [Vec2, Vec2][] = path.length === 1 ? [[path[0], path[0]]] : path.slice(1).map((p, n) => [path[n], p])
  for (const [a, b] of segs) {
    const i0 = Math.floor((Math.min(a[0], b[0]) - radius) / cell)
    const i1 = Math.floor((Math.max(a[0], b[0]) + radius) / cell)
    const j0 = Math.floor((Math.min(a[1], b[1]) - radius) / cell)
    const j1 = Math.floor((Math.max(a[1], b[1]) + radius) / cell)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (distToSegment([(i + 0.5) * cell, (j + 0.5) * cell], a, b) <= radius) into.add(key(i, j))
      }
    }
  }
  return into
}

export interface Stroke {
  mode: BrushMode
  /** The level painted to; unused for erase. */
  rl?: number
  /** The squares it covers ("i,j" keys on the plan's grading grid). */
  cells: Set<string>
}

/** The plan's grading, if it has any. */
export const gradingOf = (plan: { grading?: Grading }): Grading | undefined => plan.grading

/**
 * Grading after a stroke: painted squares join the area at the stroke's mode and level (a new one
 * if there's none), leaving any other area they were in, since a square has one level; an eraser
 * takes them out of every area. Areas left empty go. The same object when nothing changes.
 */
export function applyStroke(g: Grading | undefined, s: Stroke): Grading | undefined {
  if (!s.cells.size) return g
  const paint = s.mode !== 'erase' && s.rl !== undefined && Number.isFinite(s.rl)
  if (!paint && !g?.areas.length) return g
  const cell = g?.cell ?? GRADE_CELL
  const isTarget = (a: GradeArea) => paint && a.mode === s.mode && Math.abs(a.rl - (s.rl as number)) < SAME_LEVEL
  let changed = false
  const areas: GradeArea[] = []
  let hasTarget = false
  for (const a of g?.areas ?? []) {
    const cells = areaCells(a)
    const before = cells.size
    if (isTarget(a)) {
      hasTarget = true
      for (const c of s.cells) cells.add(c)
    } else for (const c of s.cells) cells.delete(c)
    // A target only gains squares and the rest only lose them, so the count says whether it changed.
    if (cells.size === before) {
      areas.push(a)
      continue
    }
    changed = true
    if (cells.size) areas.push({ ...a, rows: rowsOf(cells) })
  }
  if (paint && !hasTarget) {
    changed = true
    areas.push({ id: gradeId(), mode: s.mode as GradeMode, rl: Math.round((s.rl as number) * 1000) / 1000, rows: rowsOf(s.cells) })
  }
  if (!changed) return g
  if (!areas.length && !g?.dismissed?.length) return undefined
  return { ...g, cell, areas }
}

/** The plan after a stroke: one change, so one undo step; the same plan when the stroke changes nothing. */
export function paintPlan<P extends { grading?: Grading }>(plan: P, s: Stroke): P {
  const before = plan.grading
  const after = applyStroke(before, s)
  if (after === before) return plan
  if (after) return { ...plan, grading: after }
  const rest = { ...plan }
  delete rest.grading
  return rest
}

/** Painted ground (m²). */
export const areaM2 = (a: Pick<GradeArea, 'rows'>, cell = GRADE_CELL) => a.rows.reduce((t, [, i0, i1]) => t + (i1 - i0 + 1), 0) * cell * cell

/** The platform id an area goes into the earthworks as. */
export const gradePlatformId = (id: string) => `grade:${id}`

/**
 * The painted areas as levelled ground for the earthworks, in the survey's local frame: level at
 * the area's RL out to its painted edge, then battered back at the project's slopes. Cut areas only
 * cut, fill areas only fill; each gives way to the house pad where they meet, and stays at its level
 * when Balance moves the floor.
 */
export function gradingPlatforms(plan: { grading?: Grading }, origin: Vec2): Platform[] {
  const g = plan.grading
  if (!g) return []
  return g.areas
    .filter(a => a.rows.length && Number.isFinite(a.rl))
    .map(a => ({
      id: gradePlatformId(a.id),
      include: [],
      exclude: [],
      cells: { cell: g.cell, x0: -origin[0], y0: -origin[1], rows: a.rows },
      level: a.rl,
      fill: a.mode === 'fill',
      ...(a.mode === 'fill' ? { cut: false } : {}),
      margin: 0,
      soft: true,
      fixed: true,
    }))
}

/** The painted edge of an area as line pieces, in survey coordinates: runs along rows and columns merged. */
export function areaOutline(a: Pick<GradeArea, 'rows'>, cell = GRADE_CELL): [Vec2, Vec2][] {
  const cells = areaCells(a)
  const has = (i: number, j: number) => cells.has(key(i, j))
  // Horizontal edges keyed by the line they lie on, vertical ones likewise, then joined into runs.
  const h = new Map<number, number[]>()
  const v = new Map<number, number[]>()
  const push = (m: Map<number, number[]>, line: number, at: number) => {
    const l = m.get(line)
    if (l) l.push(at)
    else m.set(line, [at])
  }
  for (const k of cells) {
    const [i, j] = unkey(k)
    if (!has(i, j - 1)) push(h, j * 2, i)
    if (!has(i, j + 1)) push(h, (j + 1) * 2 + 1, i)
    if (!has(i - 1, j)) push(v, i * 2, j)
    if (!has(i + 1, j)) push(v, (i + 1) * 2 + 1, j)
  }
  const out: [Vec2, Vec2][] = []
  const runs = (m: Map<number, number[]>, emit: (line: number, a: number, b: number) => void) => {
    for (const [line, ats] of m) {
      ats.sort((x, y) => x - y)
      let s = ats[0]
      for (let n = 1; n <= ats.length; n++) {
        if (n < ats.length && ats[n] === ats[n - 1] + 1) continue
        emit(line >> 1, s, ats[n - 1] + 1)
        s = ats[n]
      }
    }
  }
  runs(h, (j, a, b) => out.push([[a * cell, j * cell], [b * cell, j * cell]]))
  runs(v, (i, a, b) => out.push([[i * cell, a * cell], [i * cell, b * cell]]))
  return out
}

/** A painted square near the middle of an area, for its label (survey coordinates of the square's middle). */
export function areaLabelAt(a: Pick<GradeArea, 'rows'>, cell = GRADE_CELL): Vec2 | null {
  const cells = [...areaCells(a)].map(unkey)
  if (!cells.length) return null
  const mi = cells.reduce((t, c) => t + c[0], 0) / cells.length
  const mj = cells.reduce((t, c) => t + c[1], 0) / cells.length
  let best = cells[0]
  for (const c of cells) if (Math.hypot(c[0] - mi, c[1] - mj) < Math.hypot(best[0] - mi, best[1] - mj)) best = c
  return [(best[0] + 0.5) * cell, (best[1] + 0.5) * cell]
}

/** "Cut to RL 44.20" */
export const areaName = (a: Pick<GradeArea, 'mode' | 'rl'>) => `${a.mode === 'cut' ? 'Cut' : 'Fill'} to RL ${a.rl.toFixed(2)}`

const isRun = (r: unknown): r is [number, number, number] => Array.isArray(r) && r.length === 3 && r.every(n => Number.isInteger(n)) && r[1] <= r[2]

/** Grading from a saved plan, with anything malformed left out; undefined when there's nothing usable. */
export function normalizeGrading(g: unknown): Grading | undefined {
  const x = g as Grading | null
  if (!x || typeof x !== 'object' || !Array.isArray(x.areas)) return undefined
  const cell = typeof x.cell === 'number' && x.cell > 0 ? x.cell : GRADE_CELL
  const areas = x.areas.filter(
    (a): a is GradeArea => !!a && typeof a.id === 'string' && (a.mode === 'cut' || a.mode === 'fill') && typeof a.rl === 'number' && Number.isFinite(a.rl) && Array.isArray(a.rows) && a.rows.every(isRun),
  )
  const dismissed = Array.isArray(x.dismissed) ? x.dismissed.filter(d => d && Array.isArray(d.at) && d.at.length === 2 && typeof d.dir === 'number') : undefined
  return { cell, areas, ...(dismissed?.length ? { dismissed } : {}) }
}
