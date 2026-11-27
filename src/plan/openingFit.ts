// Doors, windows and garage doors against the wall they sit in: the clear run between the walls
// that turn off its ends, the wall's height, and keeping an opening inside both. An opening is
// never dropped for being too big: it's narrowed to fit, and the store says so (src/plan/store.ts).

import type { Vec2 } from '../lib/geom'
import { closestOnSegment } from './geometry'
import { isRetaining, levelById, OPENING_NAMES, wallLength, type Opening, type Plan, type Wall } from './model'

const TOL = 1e-3
const same = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) <= TOL && Math.abs(a[1] - b[1]) <= TOL

/** The narrowest a door or window can be (m). */
export const MIN_OPENING = 0.3
/** A wall with less clear run than this (m) can't hold an opening at all. */
const MIN_RUN = 0.1

/**
 * The clear run of a wall, as distances along its centreline from its start: between the faces of
 * the walls that turn off its two ends (a corner, or a wall it butts into), which take up half
 * their thickness each. An opening inside it doesn't cut into the return wall.
 */
export function wallClear(walls: Wall[], w: Wall): { from: number; to: number } {
  const len = wallLength(w)
  if (len < TOL) return { from: 0, to: 0 }
  const d: Vec2 = [(w.b[0] - w.a[0]) / len, (w.b[1] - w.a[1]) / len]
  const nib = (e: Vec2) => {
    let n = 0
    for (const o of walls) {
      if (o.id === w.id || o.level !== w.level || isRetaining(o) !== isRetaining(w)) continue
      if (!same(o.a, e) && !same(o.b, e) && closestOnSegment(e, o.a, o.b).dist > TOL) continue
      const l = wallLength(o)
      if (l < TOL) continue
      // How square it is to this wall: a wall running on in line takes nothing.
      const sin = Math.abs(((o.b[0] - o.a[0]) * d[1] - (o.b[1] - o.a[1]) * d[0]) / l)
      if (sin < 0.0175) continue
      n = Math.max(n, o.thickness / 2 / Math.max(sin, 0.5))
    }
    return n
  }
  const from = Math.min(nib(w.a), len / 2)
  return { from, to: Math.max(len - nib(w.b), len / 2) }
}

/** Height of a wall's level, floor to ceiling (m): what an opening's head has to stay under. */
export function openingWallHeight(plan: Plan, w: Wall): number {
  return levelById(plan, w.level)?.height ?? Infinity
}

/** The widest an opening can be in its wall (m). */
export const widestOpening = (walls: Wall[], w: Wall): number => {
  const run = wallClear(walls, w)
  return Math.max(0, run.to - run.from)
}

/** What clampOpenings did to an opening that no longer fitted. */
export interface OpeningFix {
  id: string
  kind: Opening['kind']
  /** Its new width, or null when it had to go (its wall is too short to hold one). */
  width: number | null
}

/**
 * Keep openings inside their wall's clear run after a change: slid along, and narrowed when the
 * wall is now shorter than they are. One goes only with its wall, or when its wall has no room
 * left for any opening; `fixes` lists every one that was narrowed or dropped, so it can be said.
 *
 * With `before` (the plan the change was made to), only the openings the change touched are
 * fitted: one added or edited itself, one whose wall's ends moved, or one whose wall's clear run
 * changed (a wall newly joined at its corner, say). The rest stay exactly as they were, so an
 * unrelated edit never moves a door in an older plan that sits in a corner zone.
 */
export function fitOpenings(plan: Plan, before?: Plan): { plan: Plan; fixes: OpeningFix[] } {
  const walls = new Map(plan.walls.map(w => [w.id, w]))
  const touched = before ? touchedBy(before, plan) : () => true
  const fixes: OpeningFix[] = []
  let changed = false
  const openings = plan.openings.flatMap(o => {
    const w = walls.get(o.wall)
    if (!w) {
      changed = true
      return []
    }
    if (!touched(o, w)) return [o]
    const run = wallClear(plan.walls, w)
    const room = run.to - run.from
    if (room < MIN_RUN) {
      changed = true
      fixes.push({ id: o.id, kind: o.kind, width: null })
      return []
    }
    const width = Math.min(o.width, room)
    const offset = Math.min(Math.max(o.offset, run.from + width / 2), run.to - width / 2)
    if (width === o.width && Math.abs(offset - o.offset) < 1e-9) return [o]
    changed = true
    if (width !== o.width) fixes.push({ id: o.id, kind: o.kind, width })
    return [{ ...o, offset, width }]
  })
  return { plan: changed ? { ...plan, openings } : plan, fixes }
}

/** Whether a change from `before` to `after` touched an opening: itself, its wall's ends, or its wall's clear run. */
function touchedBy(before: Plan, after: Plan): (o: Opening, w: Wall) => boolean {
  if (before.walls === after.walls && before.openings === after.openings) return () => false
  const wallWas = new Map(before.walls.map(w => [w.id, w]))
  const was = new Map(before.openings.map(o => [o.id, o]))
  const moved = new Map<string, boolean>()
  const wallMoved = (w: Wall) => {
    let m = moved.get(w.id)
    if (m === undefined) {
      const w0 = wallWas.get(w.id)
      m = !w0 || w0.level !== w.level || !exact(w0.a, w.a) || !exact(w0.b, w.b)
      if (!m && w0 && before.walls !== after.walls) {
        const r0 = wallClear(before.walls, w0)
        const r = wallClear(after.walls, w)
        m = Math.abs(r0.from - r.from) > 1e-9 || Math.abs(r0.to - r.to) > 1e-9
      }
      moved.set(w.id, m)
    }
    return m
  }
  return (o, w) => {
    const o0 = was.get(o.id)
    if (!o0 || (o0 !== o && (o0.wall !== o.wall || o0.kind !== o.kind || o0.offset !== o.offset || o0.width !== o.width || o0.height !== o.height || o0.sill !== o.sill))) return true
    return wallMoved(w)
  }
}

const exact = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9

/** Whether an opening sits inside its wall's clear run (see wallClear): false for one that cuts into a corner's return wall. */
export function openingClear(walls: Wall[], w: Wall, o: Pick<Opening, 'offset' | 'width'>): boolean {
  const run = wallClear(walls, w)
  return o.offset - o.width / 2 >= run.from - 0.0005 && o.offset + o.width / 2 <= run.to + 0.0005
}

/** Keep openings inside their walls (see fitOpenings). */
export const clampOpenings = (plan: Plan): Plan => fitOpenings(plan).plan

/** What to say about openings that were narrowed or dropped to fit a shorter wall. */
export function fixesText(fixes: OpeningFix[]): string | null {
  if (!fixes.length) return null
  const one = (f: OpeningFix) =>
    f.width === null ? `${OPENING_NAMES[f.kind]} removed: its wall has no room for it now` : `${OPENING_NAMES[f.kind]} narrowed to ${Math.round(f.width * 1000)} mm to fit its wall`
  if (fixes.length === 1) return one(fixes[0])
  const gone = fixes.filter(f => f.width === null).length
  const narrowed = fixes.length - gone
  const parts = [narrowed ? `${narrowed} narrowed` : '', gone ? `${gone} removed` : ''].filter(Boolean)
  return `Doors and windows changed to fit their walls: ${parts.join(', ')}`
}
