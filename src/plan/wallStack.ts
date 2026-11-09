/**
 * Walls that sit on one another, such as a retaining wall under a house's external wall: which
 * one a click picks, how a second click steps to the next, and which walls share a selected
 * wall's line.
 */
import { closestOnSegment } from './geometry'
import type { Wall, WallKind } from './model'
import type { Vec2 } from '../lib/geom'

/** What each kind of wall is called in a sentence. */
export const WALL_KIND_WORDS: Record<WallKind, string> = { external: 'external wall', internal: 'internal wall', retaining: 'retaining wall' }

/**
 * The walls under a point that sit on one another, the one drawn on top first (walls are drawn in
 * the plan's order, so the last one is on top). `hits` says whether the point is on a wall. Walls
 * that only meet the top one at a corner or a T are left out, so a click at a corner still picks
 * one wall.
 */
export function wallStackAt(walls: readonly Wall[], hits: (w: Wall) => boolean): Wall[] {
  const under = [...walls].reverse().filter(hits)
  const top = under[0]
  if (under.length < 2) return under
  const sharing = new Set(wallsSharing(under, top).map(w => w.id))
  return under.filter(w => w === top || sharing.has(w.id))
}

/** The wall a click picks from a stack: the selected one when it's there, so it can still be dragged, else the top one. */
export function pickFromStack(stack: readonly Wall[], selectedId: string | undefined): Wall | undefined {
  return stack.find(w => w.id === selectedId) ?? stack[0]
}

/** The wall after `id` in a stack, round to the top again after the last. */
export function nextInStack(stack: readonly Wall[], id: string): Wall | undefined {
  if (!stack.length) return undefined
  const i = stack.findIndex(w => w.id === id)
  return stack[(i + 1) % stack.length]
}

/** The line under the plan when a click lands on more than one wall, or null for one wall. */
export function stackNotice(stack: readonly Wall[], id: string): string | null {
  if (stack.length < 2) return null
  const i = stack.findIndex(w => w.id === id)
  const names = stack.map(w => WALL_KIND_WORDS[w.kind])
  const list = names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  const at = Math.max(0, i)
  return `${stack.length} walls here (${list}). Selected the ${WALL_KIND_WORDS[stack[at].kind]}, ${at + 1} of ${stack.length}. Click it again for the next.`
}

/** Shortest overlap along a wall that counts as sitting on it (m), so walls meeting at a corner or a T don't. */
export const MIN_SHARED = 0.3

/**
 * The other walls on the same level that run along a wall, over or under it, for at least
 * MIN_SHARED of its length: each wall's band (its thickness) overlaps the other's centreline.
 */
export function wallsSharing(walls: readonly Wall[], wall: Wall): Wall[] {
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])
  if (len === 0) return []
  const steps = Math.max(8, Math.ceil(len / 0.05))
  return walls.filter(o => {
    if (o.id === wall.id || o.level !== wall.level) return false
    const reach = (o.thickness + wall.thickness) / 2
    let inside = 0
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const p: Vec2 = [wall.a[0] + (wall.b[0] - wall.a[0]) * t, wall.a[1] + (wall.b[1] - wall.a[1]) * t]
      const c = closestOnSegment(p, o.a, o.b)
      // Past the other wall's ends doesn't count.
      if (c.t > 0 && c.t < 1 && c.dist < reach) inside++
    }
    return (inside / steps) * len >= MIN_SHARED
  })
}
