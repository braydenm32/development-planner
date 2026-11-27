// How walls stay joined when one is moved or its length is typed: a wall that butts into another
// (a T) follows it, and a typed length slides the walls round the moving end so the plan stays
// square. Pure functions on a plan (src/plan/ops.ts calls them).

import { pointInPolygon, type Vec2 } from '../lib/geom'
import { closestOnSegment, planarFaces } from './geometry'
import { isRetaining, OPENING_NAMES, wallLength, type Opening, type Plan, type Wall } from './model'
import { wallClear } from './openingFit'

const TOL = 1e-3
const same = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) <= TOL && Math.abs(a[1] - b[1]) <= TOL
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0]
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1]
const unit = (v: Vec2): Vec2 => {
  const l = Math.hypot(v[0], v[1]) || 1
  return [v[0] / l, v[1] / l]
}
/** Walls closer to parallel than this (about a degree) count as parallel. */
const PARALLEL = 0.0175
/** A wall can't be typed or squeezed shorter than this (m). */
export const MIN_WALL = 0.05

/** p is on the wall's line between its ends, and not at either end. */
const inside = (p: Vec2, w: Pick<Wall, 'a' | 'b'>) => !same(p, w.a) && !same(p, w.b) && closestOnSegment(p, w.a, w.b).dist <= TOL

/** Move every wall end on the level that sits at `from`, and nothing else. */
export function shiftJoint(plan: Plan, level: string, from: Vec2, to: Vec2): Plan {
  const walls = plan.walls.map(w => {
    if (w.level !== level) return w
    const a = same(w.a, from) ? to : w.a
    const b = same(w.b, from) ? to : w.b
    return a === w.a && b === w.b ? w : { ...w, a: [a[0], a[1]] as Vec2, b: [b[0], b[1]] as Vec2 }
  })
  return { ...plan, walls }
}

/**
 * After walls have moved (`before` to `after`): a wall that butted into one of them, its end on
 * the moved wall's run, keeps that end on it. It stretches or trims along its own line, so it
 * neither pokes through nor stops short and the rooms either side stay closed.
 */
export function followTees(before: Plan, after: Plan): Plan {
  const was = new Map(before.walls.map(w => [w.id, w]))
  const moved = after.walls.filter(w => {
    const w0 = was.get(w.id)
    return !!w0 && (!same(w0.a, w.a) || !same(w0.b, w.b))
  })
  if (!moved.length) return after
  let changed = false
  const walls = after.walls.map(t => {
    const t0 = was.get(t.id)
    if (!t0) return t
    let next = t
    for (const end of ['a', 'b'] as const) {
      // An end that has moved already (a joint, or the wall itself) is where it was put.
      if (!same(t0[end], t[end])) continue
      const p = t0[end]
      const m = moved.find(x => x.id !== t.id && x.level === t.level && inside(p, was.get(x.id)!))
      if (!m) continue
      const q = next[end === 'a' ? 'b' : 'a']
      const u = unit(sub(p, t0[end === 'a' ? 'b' : 'a']))
      const to = meet(q, u, p, was.get(m.id)!, m)
      // Left alone if the wall it meets has moved past its other end.
      if (!to || dot(sub(to, q), u) < MIN_WALL || (Math.abs(to[0] - p[0]) < 1e-9 && Math.abs(to[1] - p[1]) < 1e-9)) continue
      next = { ...next, [end]: to }
      changed = true
    }
    return next
  })
  return changed ? { ...after, walls } : after
}

/** Where the line from q along u meets the moved wall; for a wall parallel to it, p carried along with the wall. */
function meet(q: Vec2, u: Vec2, p: Vec2, m0: Wall, m1: Wall): Vec2 | null {
  const v = sub(m1.b, m1.a)
  const len = Math.hypot(v[0], v[1])
  if (len < TOL) return null
  const den = cross(u, v)
  if (Math.abs(den) / len > PARALLEL) {
    const s = cross(sub(m1.a, q), v) / den
    return [q[0] + u[0] * s, q[1] + u[1] * s]
  }
  const t = closestOnSegment(p, m0.a, m0.b).t
  return [p[0] + (m1.a[0] - m0.a[0]) * (1 - t) + (m1.b[0] - m0.b[0]) * t, p[1] + (m1.a[1] - m0.a[1]) * (1 - t) + (m1.b[1] - m0.b[1]) * t]
}

export type WallEnd = 'a' | 'b'

/**
 * The plan with a wall's length set by moving one end along the wall. The walls joined at that end
 * slide with it, whole, as if dragged; the walls joined to those do too, until a wall parallel to
 * the one being changed takes up the difference by getting longer or shorter. So a rectangle stays
 * a rectangle. `moved` is how many walls changed.
 */
function resize(plan: Plan, id: string, length: number, end: WallEnd): { plan: Plan; moved: number } | null {
  const w = plan.walls.find(x => x.id === id)
  if (!w) return null
  const fixed = w[end === 'a' ? 'b' : 'a']
  const d = unit(sub(w[end], fixed))
  const delta: Vec2 = [fixed[0] + d[0] * length - w[end][0], fixed[1] + d[1] * length - w[end][1]]
  if (Math.hypot(delta[0], delta[1]) < 1e-9) return { plan, moved: 0 }
  const level = plan.walls.filter(x => x.level === w.level)
  const parallel = (x: Wall) => Math.abs(cross(unit(sub(x.b, x.a)), d)) < PARALLEL
  // The points that slide by delta: the moving end, then the far end of every wall that slides whole.
  const nodes: Vec2[] = [w[end]]
  const has = (p: Vec2) => nodes.some(n => same(n, p))
  const add = (p: Vec2) => {
    // The other end of the wall being changed stays where it is, whatever is joined round to it.
    if (!has(p) && !same(p, fixed)) nodes.push(p)
  }
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    for (const x of level) {
      if (x.id === id || parallel(x)) continue
      if (same(x.a, n)) add(x.b)
      else if (same(x.b, n)) add(x.a)
      else if (inside(n, x)) {
        // It butts into this wall, which slides whole with it.
        add(x.a)
        add(x.b)
      }
    }
  }
  const shift = (p: Vec2): Vec2 => (has(p) ? [p[0] + delta[0], p[1] + delta[1]] : p)
  const walls = plan.walls.map(x => {
    if (x.level !== w.level) return x
    const a = shift(x.a)
    const b = shift(x.b)
    return a === x.a && b === x.b ? x : { ...x, a, b }
  })
  const next = keepOpeningsPut(plan, followTees(plan, { ...plan, walls }))
  return { plan: next, moved: next.walls.filter((x, i) => x !== plan.walls[i]).length }
}

/**
 * Doors and windows are measured from their wall's start. Where a wall has only stretched at its
 * start, they stay where they are on the plan instead of sliding along with that end.
 */
function keepOpeningsPut(before: Plan, after: Plan): Plan {
  const was = new Map(before.walls.map(w => [w.id, w]))
  const by = new Map<string, number>()
  for (const w of after.walls) {
    const w0 = was.get(w.id)
    if (!w0 || same(w0.a, w.a) || !same(w0.b, w.b)) continue
    by.set(w.id, dot(sub(w0.a, w.a), unit(sub(w.b, w.a))))
  }
  if (!by.size) return after
  return { ...after, openings: after.openings.map(o => (by.has(o.wall) ? { ...o, offset: o.offset + by.get(o.wall)! } : o)) }
}

/** The end whose move changes fewer walls, so more of the plan stays where it is (the far end when they're even). */
export function stillerEnd(plan: Plan, id: string): WallEnd {
  const w = plan.walls.find(x => x.id === id)
  if (!w) return 'b'
  const len = wallLength(w)
  const a = resize(plan, id, len + 1, 'a')?.moved ?? 0
  const b = resize(plan, id, len + 1, 'b')?.moved ?? 0
  return a < b ? 'a' : 'b'
}

/** What stops the wall `id` being a length: a wall squeezed to nothing, or a door or window left without room. Null when it's fine. */
function trouble(before: Plan, after: Plan, id: string): string | null {
  const was = new Map(before.walls.map(w => [w.id, w]))
  const now = new Map(after.walls.map(w => [w.id, w]))
  for (const w of after.walls) {
    const w0 = was.get(w.id)
    if (!w0 || w0 === w || w.id === id) continue
    if (wallLength(w0) >= MIN_WALL && dot(sub(w.b, w.a), unit(sub(w0.b, w0.a))) < MIN_WALL - 1e-6) return 'or a wall joined to it is squeezed to nothing'
  }
  const old = new Map(before.openings.map(o => [o.id, o]))
  for (const o of after.openings) {
    const w = now.get(o.wall)
    const w0 = was.get(o.wall)
    if (!w || !w0 || w === w0) continue
    // One that already ran into a corner (an older plan) is held only to the wall's ends.
    const run = fits(old.get(o.id) ?? o, wallClear(before.walls, w0)) ? wallClear(after.walls, w) : { from: 0, to: wallLength(w) }
    if (fits(o, run)) continue
    const name = OPENING_NAMES[o.kind].toLowerCase()
    return o.wall === id ? `to keep its ${name} in the wall` : `to keep the ${name} in a wall that changes with it`
  }
  return null
}

const fits = (o: Opening, run: { from: number; to: number }) => o.offset - o.width / 2 >= run.from - 1e-6 && o.offset + o.width / 2 <= run.to + 1e-6

/**
 * Why a wall can't be typed to this length, in the number boxes' words ("Min 5070 mm, to keep its
 * garage door in the wall"), or null when it can. The limit is the nearest length that works.
 */
export function wallLengthProblem(plan: Plan, id: string, length: number, end: WallEnd = stillerEnd(plan, id)): string | null {
  const w = plan.walls.find(x => x.id === id)
  if (!w) return null
  const r = resize(plan, id, length, end)
  let bad = r && trouble(plan, r.plan, id)
  if (!bad) return null
  // The nearest length that works, between the wall as it is (which does) and what was typed,
  // and what gets in the way just past it.
  let ok = wallLength(w)
  let no = length
  for (let i = 0; i < 40 && Math.abs(no - ok) > 1e-4; i++) {
    const mid = (ok + no) / 2
    const m = resize(plan, id, mid, end)
    const why = m && trouble(plan, m.plan, id)
    if (why) {
      no = mid
      bad = why
    } else ok = mid
  }
  const shorter = length < wallLength(w)
  // The search stops within a tenth of a millimetre of the limit.
  const limit = shorter ? Math.ceil(ok * 1000 - 0.2) : Math.floor(ok * 1000 + 0.2)
  return `${shorter ? 'Min' : 'Max'} ${limit} mm, ${bad}`
}

/** Change a wall's length from one end, keeping the plan square (see resize). Unchanged when the length can't be had. */
export function resizeWall(plan: Plan, id: string, length: number, end: WallEnd = stillerEnd(plan, id)): Plan {
  if (length < MIN_WALL) return plan
  const r = resize(plan, id, length, end)
  if (!r || trouble(plan, r.plan, id)) return plan
  return r.plan
}

/**
 * Whether a wall from a to b would stand wholly inside the house on its level: both ends on or
 * inside a closed outline of house walls and its middle inside one. Such a wall is an inside wall.
 */
export function insideHouse(walls: Wall[], level: string, a: Vec2, b: Vec2): boolean {
  const faces = planarFaces(walls.filter(w => w.level === level && !isRetaining(w))).filter(f => f.area > 0)
  if (!faces.length) return false
  const within = (p: Vec2, strict: boolean) =>
    faces.some(f => {
      const edge = f.pts.some((q, i) => closestOnSegment(p, q, f.pts[(i + 1) % f.pts.length]).dist <= TOL)
      return strict ? !edge && pointInPolygon(p[0], p[1], f.pts) : edge || pointInPolygon(p[0], p[1], f.pts)
    })
  // Its middle is inside a room when it's off every wall there; the two quarter points settle a wall that crosses one.
  const at = (t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  return within(a, false) && within(b, false) && [0.25, 0.5, 0.75].some(t => within(at(t), true)) && [0.25, 0.5, 0.75].every(t => within(at(t), false))
}
