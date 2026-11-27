// Which face of a wall the Wall tool draws by (DB-10): its centre (as it always has), its outside
// face, or its inside face. Builders set out to the outside of the frame and read rooms face to
// face, so with a face picked, the points clicked and the lengths typed are that face, and the
// wall's centreline is put half its thickness to the side the wall's body goes. Walls are still
// kept by their centrelines, so nothing in a saved project changes.
//
// Which side the body goes: for a run of walls that turns, the way it turns (an outline drawn by
// its outside face has its walls inside it; by its inside face, outside it). Before the run has
// turned (a first straight wall), a marker beside the face shows the side, and H or the card's
// Flip button flips it. The rectangle room: Inside is the clear room size, Outside the overall.

import { create } from 'zustand'
import type { Vec2 } from '../lib/geom'
import type { Plan, Wall, WallKind } from './model'
import { addWall, wallAlreadyThere, wallStyleAt } from './ops'

export type WallFace = 'centre' | 'outside' | 'inside'

/** +1: the wall's body is to the left of the way the face is drawn (the house frame's left); -1: to the right. */
export type Side = 1 | -1

export const WALL_FACES: { id: WallFace; label: string }[] = [
  { id: 'centre', label: 'Centre' },
  { id: 'outside', label: 'Outside face' },
  { id: 'inside', label: 'Inside face' },
]

/** The key that flips the side marker while a first wall is drawn by a face. */
export const FLIP_KEY = 'H'

interface FaceStore {
  face: WallFace
  /** The side marker flipped from where it starts, for a wall that hasn't turned yet. Not kept: each visit starts unflipped. */
  flipped: boolean
}

const KEY = 'wall-face-v1'

function load(): WallFace {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'outside' || v === 'inside' ? v : 'centre'
  } catch {
    return 'centre'
  }
}

export const useWallFace = create<FaceStore>(() => ({ face: load(), flipped: false }))

/** Pick the face to draw by: remembered in this browser for next time. */
export function setWallFace(face: WallFace) {
  useWallFace.setState({ face, flipped: false })
  try {
    localStorage.setItem(KEY, face)
  } catch {
    // Not kept; it still holds for this visit.
  }
}

export const flipWallSide = () => useWallFace.setState(s => ({ flipped: !s.flipped }))

/** Twice the signed area of a polygon (positive when its corners run anticlockwise in the house frame). */
function area2(pts: Vec2[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a
}

/**
 * The side the wall's body goes from the face points drawn so far (the last one may be the
 * pointer). Once the run turns, its turn decides, for the whole run: drawn by the outside face
 * the body is on the side the outline closes round, by the inside face the other side. Before
 * that (or for a run that only zigzags), the marker's side, `marker`.
 */
export function bodySide(face: WallFace, pts: Vec2[], marker: Side): Side {
  if (face === 'centre' || pts.length < 3) return marker
  const a = area2(pts) / 2
  // Less than a sliver (a tenth of a square metre per metre run): not turned yet.
  let run = 0
  for (let i = 1; i < pts.length; i++) run += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  if (Math.abs(a) < 0.1 * Math.max(run, 1)) return marker
  const enclosedLeft: Side = a > 0 ? 1 : -1
  return face === 'outside' ? enclosedLeft : (-enclosedLeft as Side)
}

/**
 * Where the marker starts for a first wall: the body to the right of the way it's drawn, as it
 * looks on screen, for the outside face (an outline drawn clockwise has its walls inside), and to
 * the left for the inside face. `screenRight` is the house-frame side that looks right on screen.
 */
export function startSide(face: WallFace, screenRight: Side, flipped: boolean): Side {
  const s = face === 'inside' ? -screenRight : screenRight
  return (flipped ? -s : s) as Side
}

const left = (a: Vec2, b: Vec2): Vec2 => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]
}

/** Where two offset lines meet: through `p` along `d`, and through `q` along `e`; null when (nearly) parallel. */
function meet(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const den = d[0] * e[1] - d[1] * e[0]
  if (Math.abs(den) < 1e-6) return null
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
  return [p[0] + d[0] * t, p[1] + d[1] * t]
}

/**
 * The centreline of a run of walls drawn by a face: each side of `face` moved square off it by
 * `halves[i]` (half that wall's thickness) to `side`, the corners where they meet. The ends of an
 * open run go straight across; `closed` (the last point is the first) meets the ends too.
 */
export function centreFromFace(face: Vec2[], halves: number[], side: Side, closed = false): Vec2[] {
  const n = face.length
  if (n < 2) return face.map(p => [p[0], p[1]] as Vec2)
  const segs = face.slice(1).map((b, i) => {
    const a = face[i]
    const nl = left(a, b)
    const h = (halves[i] ?? halves[halves.length - 1] ?? 0) * side
    const d: Vec2 = [b[0] - a[0], b[1] - a[1]]
    return { a: [a[0] + nl[0] * h, a[1] + nl[1] * h] as Vec2, b: [b[0] + nl[0] * h, b[1] + nl[1] * h] as Vec2, d }
  })
  const out: Vec2[] = [segs[0].a]
  for (let i = 1; i < n - 1; i++) out.push(meet(segs[i - 1].a, segs[i - 1].d, segs[i].a, segs[i].d) ?? segs[i].a)
  out.push(segs[segs.length - 1].b)
  if (closed && segs.length > 2) {
    const corner = meet(segs[segs.length - 1].a, segs[segs.length - 1].d, segs[0].a, segs[0].d) ?? segs[0].a
    out[0] = corner
    out[out.length - 1] = corner
  }
  return out
}

/**
 * The rectangle room's centreline corners from the corners clicked (or typed): drawn by the
 * outside face they're the outside corners, so the walls come in half a thickness; by the inside
 * face, the room's clear corners, so the walls go out. `t` is the wall's thickness.
 */
export function rectCentre(face: WallFace, a: Vec2, c: Vec2, t: number): [Vec2, Vec2] {
  const g = face === 'outside' ? -t / 2 : face === 'inside' ? t / 2 : 0
  const sx = c[0] >= a[0] ? 1 : -1
  const sy = c[1] >= a[1] ? 1 : -1
  return [
    [a[0] - sx * g, a[1] - sy * g],
    [c[0] + sx * g, c[1] + sy * g],
  ]
}

/** What the live size says it measures: "outside", "inside", or nothing for the centreline. */
export const faceWord = (face: WallFace): string => (face === 'outside' ? 'outside face' : face === 'inside' ? 'inside face' : '')

/** The walls of the run drawn by a face so far, in order, so each new corner can set the last one's end. */
export interface FaceRun {
  ids: string[]
}

/**
 * One click of a run drawn by a face: `face` is every face point of the run, the new one last
 * (`closes`: it is the first one again). The run's walls so far are moved onto the new centreline
 * (their shared corner now meets the new wall's) and the new wall is added, as one change. Returns
 * the plan and the run with the new wall, or the plan unchanged when the wall is already there.
 */
export function faceRunStep(
  plan: Plan,
  level: string,
  run: FaceRun,
  face: Vec2[],
  closes: boolean,
  side: Side,
  style: { kind: WallKind; thickness: number },
): { plan: Plan; run: FaceRun; added: Wall | null; style: { kind: WallKind; thickness: number } } {
  // The run's walls, while they are all still there (an undo mid-run starts the run afresh from the last corner).
  const had = run.ids.map(id => plan.walls.find(w => w.id === id))
  const whole = had.length === face.length - 2 && had.every(Boolean)
  const walls = whole ? (had as Wall[]) : []
  const pts = whole ? face : face.slice(-2)
  const ids = whole ? run.ids : []
  const halvesWith = (t: number) => [...walls.map(w => w.thickness / 2), t / 2]
  let c = centreFromFace(pts, halvesWith(style.thickness), side, closes && whole)
  // A wall wholly inside the house is an inside wall, whatever outside type the tool is set to.
  const used = wallStyleAt(plan, level, c[c.length - 2], c[c.length - 1], style)
  if (used.thickness !== style.thickness) c = centreFromFace(pts, halvesWith(used.thickness), side, closes && whole)
  const moved: Plan = { ...plan, walls: plan.walls.map(w => {
    const i = ids.indexOf(w.id)
    return i < 0 ? w : { ...w, a: [c[i][0], c[i][1]] as Vec2, b: [c[i + 1][0], c[i + 1][1]] as Vec2 }
  }) }
  const a = c[c.length - 2]
  const b = c[c.length - 1]
  if (wallAlreadyThere(moved, level, a, b, used.kind)) return { plan: moved, run: { ids }, added: null, style: used }
  const next = addWall(moved, level, a, b, used)
  const added = next === moved ? null : next.walls[next.walls.length - 1]
  return { plan: next, run: { ids: added ? [...ids, added.id] : ids }, added, style: used }
}
