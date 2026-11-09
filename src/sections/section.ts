// A section: what a cut along a line through the house and the ground shows. Pure geometry in
// metres, from the same helpers the plan, the 3D view and the cut and fill use: the ground from
// the terrain's heightfield, the finished ground from the earthworks, floors at floorRL, walls from
// wallPolygons, piers from pierOutlines, and the roof from roofGeometry's mesh.

import type { Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import { buildingOutline, planarFaces, wallPolygons } from '../plan/geometry'
import {
  areaKind,
  DECK_DEPTH,
  FLOOR_STRUCTURE,
  floorRL,
  houseWalls,
  isRetaining,
  levelById,
  SLAB_THICKNESS,
  sortedLevels,
  toSite,
  wallDir,
  type SectionLine,
} from '../plan/model'
import { pierOutlines } from '../plan/platforms'
import { retainingProfile, topAt } from '../plan/retaining'
import { roofGeometry, type RoofMesh } from '../plan/roof'
import { compassWord, intersectSpans, postStations, spansInside, stations, subtractSpans, type Box, type DrawingInput, type LevelMark, type Pt } from './common'

/** A floor where the cut passes through it. */
export interface CutFloor {
  level: string
  name: string
  /** RLs of the finished floor and the ceiling. */
  rl: number
  ceiling: number
  spans: [number, number][]
}

export interface SectionDrawing {
  kind: 'section'
  id: string
  title: string
  /** Length of the line (m); the drawing runs from 0 (end a) to this (end b). */
  length: number
  /** The ground along the line inside the block, as surveyed, and after cut and fill. */
  natural: Pt[][]
  finished: Pt[][]
  /** Where the line crosses the boundary (m along it), with the natural ground there. */
  boundaries: { s: number; rl: number }[]
  floors: CutFloor[]
  /** Concrete slabs on the ground (the house's and outdoor ones), and framed floors and decks. */
  slabs: Box[]
  framing: Box[]
  /** Piers and posts, from the underside of the floor to the finished ground. */
  piers: Box[]
  /** House walls the line cuts, in pieces where it passes through a window or door. */
  walls: Box[]
  retaining: Box[]
  /** Each roof the line cuts, as a closed outline. */
  roofs: Pt[][]
  /** RLs to label on the left. */
  levels: LevelMark[]
  /** Which way each end of the line points, in words: [left end, right end]. */
  ends: [string, string]
  /** Which way the drawing looks. */
  looking: string
  zMin: number
  zMax: number
}

const PIER_W = 0.1
const POST_W = 0.09

/**
 * The top of a roof mesh along a line, exactly: the line is cut
 * wherever it crosses an edge of an upward-facing triangle, and between those points the roof is
 * one plane. Returns each run under the roof as points (distance along, height above the mesh base).
 */
export function roofProfile(mesh: RoofMesh, a: Vec2, b: Vec2): Pt[][] {
  const P = mesh.pos
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return []
  const tops: number[][] = []
  for (let i = 0; i < mesh.tris.length; i += 3) {
    const [i0, i1, i2] = [mesh.tris[i], mesh.tris[i + 1], mesh.tris[i + 2]]
    const x0 = P[3 * i0]
    const y0 = P[3 * i0 + 1]
    const area = (P[3 * i1] - x0) * (P[3 * i2 + 1] - y0) - (P[3 * i1 + 1] - y0) * (P[3 * i2] - x0)
    // Facing up: anticlockwise seen from above. Upright faces (gable ends, fascias) have no area.
    if (area > 1e-9) tops.push([i0, i1, i2])
  }
  const ts = [0, 1]
  for (const tri of tops) {
    for (let e = 0; e < 3; e++) {
      const p = tri[e]
      const q = tri[(e + 1) % 3]
      const px = P[3 * p]
      const py = P[3 * p + 1]
      const ex = P[3 * q] - px
      const ey = P[3 * q + 1] - py
      const den = dx * ey - dy * ex
      if (Math.abs(den) < 1e-12) continue
      const t = ((px - a[0]) * ey - (py - a[1]) * ex) / den
      const u = ((px - a[0]) * dy - (py - a[1]) * dx) / den
      if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t)
    }
  }
  ts.sort((p, q) => p - q)
  /** The upward-facing triangle over a point and the roof's height there (its plane, carried on past its edges). */
  const under = (x: number, y: number) => {
    for (const [i0, i1, i2] of tops) {
      const ax = P[3 * i0]
      const ay = P[3 * i0 + 1]
      const bx = P[3 * i1] - ax
      const by = P[3 * i1 + 1] - ay
      const cx = P[3 * i2] - ax
      const cy = P[3 * i2 + 1] - ay
      const den = bx * cy - by * cx
      const px = x - ax
      const py = y - ay
      const v = (px * cy - py * cx) / den
      const w = (bx * py - by * px) / den
      if (v >= -1e-9 && w >= -1e-9 && v + w <= 1 + 1e-9) {
        const z0 = P[3 * i0 + 2]
        const dzb = P[3 * i1 + 2] - z0
        const dzc = P[3 * i2 + 2] - z0
        return (qx: number, qy: number) => {
          const rx = qx - ax
          const ry = qy - ay
          return z0 + ((rx * cy - ry * cx) / den) * dzb + ((bx * ry - by * rx) / den) * dzc
        }
      }
    }
    return null
  }
  const runs: Pt[][] = []
  let run: Pt[] | null = null
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i]
    const t1 = ts[i + 1]
    if (t1 - t0 < 1e-9) continue
    const m = (t0 + t1) / 2
    const plane = under(a[0] + dx * m, a[1] + dy * m)
    if (!plane) {
      run = null
      continue
    }
    const z0 = plane(a[0] + dx * t0, a[1] + dy * t0)
    const z1 = plane(a[0] + dx * t1, a[1] + dy * t1)
    if (!run) {
      run = [[t0 * len, z0]]
      runs.push(run)
    }
    run.push([t1 * len, z1])
  }
  return runs
}

/** The ground along a line inside the block: runs of points about `step` apart (m). */
function groundRuns(f: Heightfield, a: Vec2, b: Vec2, inside: [number, number][], step: number): Pt[][] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  return inside.map(([s0, s1]) =>
    stations(s0, s1, step).map((s): Pt => {
      const t = s / len
      return [s, f.sample(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)]
    }),
  )
}

/** What a section line cuts through. */
export function sectionDrawing(line: SectionLine, input: DrawingInput): SectionDrawing {
  const { plan, survey } = input
  const natural = input.terrain.grid
  const finished = input.finished ?? natural
  const { a, b } = line
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const dir: Vec2 = len > 1e-9 ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0]
  const at = (s: number): Vec2 => [a[0] + dir[0] * s, a[1] + dir[1] * s]
  const site = (p: Vec2) => toSite(p, plan.placement, survey.origin)
  const sa = site(a)
  const sb = site(b)
  const groundAt = (f: Heightfield, s: number) => {
    const p = site(at(s))
    return f.sample(p[0], p[1])
  }

  // The ground, on the block only: outside it there is no survey to read.
  const inside = spansInside(sa, sb, [survey.boundary])
  const step = Math.max(Math.min(0.25, natural.cell / 2), len / 800)
  const nat = groundRuns(natural, sa, sb, inside, step)
  const fin = groundRuns(finished, sa, sb, inside, step)
  const boundaries: SectionDrawing['boundaries'] = []
  for (const [s0, s1] of inside) {
    if (s0 > 1e-6) boundaries.push({ s: s0, rl: groundAt(natural, s0) })
    if (s1 < len - 1e-6) boundaries.push({ s: s1, rl: groundAt(natural, s1) })
  }

  const levels = sortedLevels(plan)
  const lowest = levels[0]
  const floors: CutFloor[] = []
  const slabs: Box[] = []
  const framing: Box[] = []
  const piers: Box[] = []
  const walls: Box[] = []
  const pierSpans = spansInside(a, b, pierOutlines(plan))
  const post = (s: number, top: number, w: number) => {
    const g = groundAt(finished, s)
    if (top - g > 0.02) piers.push({ s0: s - w / 2, s1: s + w / 2, z0: g, z1: top })
  }

  for (const level of levels) {
    const lw = houseWalls(plan.walls.filter(w => w.level === level.id))
    const rl = floorRL(plan, level.id)
    const spans = spansInside(a, b, buildingOutline(planarFaces(lw)).outlines)
    if (spans.length) floors.push({ level: level.id, name: level.name, rl, ceiling: rl + level.height, spans })
    // The floor itself: a slab on the ground under the lowest level (bar its rooms on piers), framing elsewhere.
    const onPiers = level === lowest ? intersectSpans(spans, pierSpans) : []
    const solid = level === lowest ? subtractSpans(spans, onPiers) : []
    for (const [s0, s1] of solid) slabs.push({ s0, s1, z0: rl - FLOOR_STRUCTURE, z1: rl })
    for (const [s0, s1] of level === lowest ? onPiers : spans) framing.push({ s0, s1, z0: rl - FLOOR_STRUCTURE, z1: rl })
    for (const [s0, s1] of onPiers) for (const s of postStations(s0, s1)) post(s, rl - FLOOR_STRUCTURE, PIER_W)

    // Walls the line passes through, with the gap where it passes through an opening.
    const polys = wallPolygons(lw)
    for (const w of lw) {
      const poly = polys.get(w.id)
      if (!poly) continue
      const d = wallDir(w)
      for (const [s0, s1] of spansInside(a, b, [poly])) {
        const m = at((s0 + s1) / 2)
        const along = (m[0] - w.a[0]) * d[0] + (m[1] - w.a[1]) * d[1]
        const op = plan.openings.find(o => o.wall === w.id && Math.abs(along - o.offset) < o.width / 2)
        const pieces: [number, number][] = op
          ? [
              ...(op.sill > 0 ? [[0, op.sill] as [number, number]] : []),
              ...(op.sill + op.height < level.height ? [[op.sill + op.height, level.height] as [number, number]] : []),
            ]
          : [[0, level.height]]
        for (const [z0, z1] of pieces) walls.push({ s0, s1, z0: rl + z0, z1: rl + z1 })
      }
    }
  }

  // Outdoor slabs and decks, at their own levels.
  for (const ar of plan.areas) {
    const kind = areaKind(ar)
    if ((kind !== 'slab' && kind !== 'deck') || ar.pts.length < 3 || !levelById(plan, ar.level)) continue
    const top = floorRL(plan, ar.level) + (ar.top ?? 0)
    for (const [s0, s1] of spansInside(a, b, [ar.pts])) {
      if (kind === 'slab') slabs.push({ s0, s1, z0: top - SLAB_THICKNESS, z1: top })
      else {
        framing.push({ s0, s1, z0: top - DECK_DEPTH, z1: top })
        for (const s of postStations(s0, s1)) post(s, top - DECK_DEPTH, POST_W)
      }
    }
  }

  // Retaining walls: from a little under the lower ground to the wall's top, as its panel works it out.
  const retainingWalls = plan.walls.filter(isRetaining)
  const rpolys = wallPolygons(retainingWalls)
  const retaining: Box[] = []
  for (const w of retainingWalls) {
    const poly = rpolys.get(w.id)
    if (!poly) continue
    const cuts = spansInside(a, b, [poly])
    if (!cuts.length) continue
    const prof = retainingProfile(w, plan, survey.origin, finished)
    const d = wallDir(w)
    for (const [s0, s1] of cuts) {
      const m = at((s0 + s1) / 2)
      const along = (m[0] - w.a[0]) * d[0] + (m[1] - w.a[1]) * d[1]
      const near = prof.samples.reduce((p, q) => (Math.abs(q.s - along) < Math.abs(p.s - along) ? q : p))
      retaining.push({ s0, s1, z0: Math.min(near.left, near.right) - 0.3, z1: topAt(w, near) })
    }
  }

  // Roofs: the cut through each, from the top of its walls.
  const roofs: Pt[][] = []
  for (const r of plan.roofs) {
    const level = levelById(plan, r.level)
    const g = roofGeometry(r)
    if (!level || g.error) continue
    const base = floorRL(plan, level.id) + level.height
    for (const run of roofProfile(g.mesh, a, b)) {
      const top = run.map(([s, z]): Pt => [s, base + z])
      roofs.push([...top, [top[top.length - 1][0], base], [top[0][0], base]])
    }
  }

  const marks: LevelMark[] = floors.map(f => ({ rl: f.rl, text: 'FFL', name: f.name, at: f.spans[0][0] }))
  if (roofs.length) {
    const peak = roofs.flat().reduce((p, q) => (q[1] > p[1] ? q : p))
    marks.push({ rl: peak[1], text: 'Roof', at: peak[0] })
  }

  const zs = [
    ...nat.flat().map(p => p[1]),
    ...fin.flat().map(p => p[1]),
    ...[...slabs, ...framing, ...walls, ...retaining, ...piers].flatMap(x => [x.z0, x.z1]),
    ...floors.flatMap(f => [f.rl, f.ceiling]),
    ...roofs.flat().map(p => p[1]),
  ]
  const zMin = zs.length ? Math.min(...zs) : floorRL(plan) - 1
  const zMax = zs.length ? Math.max(...zs) : floorRL(plan) + 3
  const rot = plan.placement.rotation
  return {
    kind: 'section',
    id: line.id,
    title: `Section ${line.label}–${line.label}`,
    length: len,
    natural: nat,
    finished: fin,
    boundaries,
    floors,
    slabs,
    framing,
    piers,
    walls,
    retaining,
    roofs,
    levels: marks,
    ends: [compassWord([-dir[0], -dir[1]], rot), compassWord(dir, rot)],
    looking: compassWord([-dir[1], dir[0]], rot),
    zMin,
    zMax,
  }
}
