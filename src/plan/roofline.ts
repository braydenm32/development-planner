// Where a roof sits: its eaves line, as an RL. A roof sits on its own level's walls unless it's
// given an eaves RL of its own, or matched to another level's ceiling or another roof's eaves, so
// roofs on a split-level house can share one roofline. Every drawing, the 3D view and the numbers
// read a roof's height from roofEavesRL, so they all agree.

import { pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import { floorRL, houseWalls, levelById, sortedLevels, type Level, type Plan, type Roof, type RoofEaves, type Wall } from './model'
import { growRing, levelOutlines } from './roof'

/** Ceilings this close (m) line up, for one roof over both and for the Floors helper. */
export const CEILING_MATCH = 0.005

/** RL of a level's ceiling: its floor plus its floor-to-ceiling height. */
export function ceilingRL(plan: Plan, levelId: string): number {
  return floorRL(plan, levelId) + (levelById(plan, levelId)?.height ?? 0)
}

/**
 * RL of a roof's eaves line (the top of the walls it sits on), which its mesh is built up from.
 * A roof matched to a roof that's gone, or to a level that's gone, sits on its own walls again;
 * a ring of roofs matched to each other does too.
 */
export function roofEavesRL(plan: Plan, roof: Roof, seen: Set<string> = new Set()): number {
  const own = () => ceilingRL(plan, roof.level)
  const e = roof.eaves
  if (!e) return own()
  if ('rl' in e) return Number.isFinite(e.rl) ? e.rl : own()
  if ('level' in e) return levelById(plan, e.level) ? ceilingRL(plan, e.level) : own()
  const other = plan.roofs.find(r => r.id === e.roof)
  if (!other || other.id === roof.id || seen.has(roof.id)) return own()
  seen.add(roof.id)
  return roofEavesRL(plan, other, seen)
}

/** The levels whose ceiling lines up with `levelId`'s, that one first. */
export function levelsSharingCeiling(plan: Plan, levelId: string): Level[] {
  const at = ceilingRL(plan, levelId)
  const own = levelById(plan, levelId)
  const others = sortedLevels(plan).filter(l => l.id !== levelId && Math.abs(ceilingRL(plan, l.id) - at) < CEILING_MATCH)
  return own ? [own, ...others] : others
}

/** "Roof over Entry", or "Roof 2 over Entry" when its level has more than one. */
export function roofName(plan: Plan, roof: Roof): string {
  const level = levelById(plan, roof.level)?.name ?? 'the house'
  const same = plan.roofs.filter(r => r.level === roof.level)
  const n = same.findIndex(r => r.id === roof.id)
  return same.length > 1 ? `Roof ${n + 1} over ${level}` : `Roof over ${level}`
}

/** What a roof's roofline is matched to, for the panel's picker: '' for its own walls. */
export function roofLineKey(roof: Roof): string {
  const e = roof.eaves
  if (!e) return ''
  if ('roof' in e) return `roof:${e.roof}`
  if ('level' in e) return `level:${e.level}`
  return 'rl'
}

/**
 * Match a roof's roofline: to a level's ceiling (`level:<id>`), to another roof (`roof:<id>`,
 * which also takes its pitch, so the two read as one roof plane), or back to its own walls ('').
 * Matching its own level is the same as its own walls, and drops the field.
 */
export function matchRoofline(plan: Plan, roofId: string, key: string): Plan {
  const roof = plan.roofs.find(r => r.id === roofId)
  if (!roof) return plan
  let patch: Partial<Roof> & { eaves?: RoofEaves }
  if (key.startsWith('roof:')) {
    const other = plan.roofs.find(r => r.id === key.slice(5))
    if (!other || other.id === roof.id) return plan
    patch = { eaves: { roof: other.id }, pitch: other.pitch }
  } else if (key.startsWith('level:') && key.slice(6) !== roof.level && levelById(plan, key.slice(6))) {
    patch = { eaves: { level: key.slice(6) } }
  } else patch = { eaves: undefined }
  return { ...plan, roofs: plan.roofs.map(r => (r.id === roofId ? withEaves(r, patch) : r)) }
}

/** A typed eaves RL. The roof's own ceiling RL puts it back on its walls. */
export function setEavesRL(plan: Plan, roofId: string, rl: number): Plan {
  const roof = plan.roofs.find(r => r.id === roofId)
  if (!roof || !Number.isFinite(rl)) return plan
  const own = Math.abs(rl - ceilingRL(plan, roof.level)) < 0.0005
  return { ...plan, roofs: plan.roofs.map(r => (r.id === roofId ? withEaves(r, { eaves: own ? undefined : { rl: Math.round(rl * 1000) / 1000 } }) : r)) }
}

/** A roof with a patch, dropping `eaves` when it's set to undefined so saved plans stay tidy. */
function withEaves(r: Roof, patch: Partial<Roof>): Roof {
  const next = { ...r, ...patch }
  if (next.eaves === undefined) delete next.eaves
  return next
}

/** The other level whose ceiling lines up with this one's, if any (the nearest, by floor). */
export function ceilingLinedUpWith(plan: Plan, levelId: string): Level | undefined {
  return levelsSharingCeiling(plan, levelId).filter(l => l.id !== levelId)[0]
}

/**
 * The ceiling height that puts `levelId`'s ceiling level with `withId`'s; null when that would
 * make the room lower than `min` (m).
 */
export function ceilingHeightToMatch(plan: Plan, levelId: string, withId: string, min = 1.8): number | null {
  const l = levelById(plan, levelId)
  if (!l || !levelById(plan, withId)) return null
  const h = Math.round((ceilingRL(plan, withId) - floorRL(plan, levelId)) * 1000) / 1000
  return h >= min ? h : null
}

/**
 * The walls a roof over `levelId` sits on: that level's, and every other level's whose ceiling
 * lines up with it, so Roof this building puts one roof over a split level whose ceilings meet.
 * Walls drawn on both levels along the line where they meet are joined by planarFaces.
 */
export function wallsUnderRoofline(plan: Plan, levelId: string): Wall[] {
  const ids = new Set(levelsSharingCeiling(plan, levelId).map(l => l.id))
  return plan.walls.filter(w => ids.has(w.level))
}

/** The roofs to show and pick on `levelId`'s plan: its own, and those over levels whose ceiling lines up with it. */
export function roofsOverLevel(plan: Plan, levelId: string): Roof[] {
  const ids = new Set(levelsSharingCeiling(plan, levelId).map(l => l.id))
  return plan.roofs.filter(r => ids.has(r.level))
}

/** Each level's outlines, worked out once per plan, for wallTopAt's "is another level in the way". */
const outlineCache = new WeakMap<Plan, Map<string, Vec2[][]>>()
function outlinesOf(plan: Plan, levelId: string): Vec2[][] {
  let m = outlineCache.get(plan)
  if (!m) outlineCache.set(plan, (m = new Map()))
  let o = m.get(levelId)
  if (!o) m.set(levelId, (o = levelOutlines(houseWalls(plan.walls.filter(w => w.level === levelId)))))
  return o
}

/**
 * RL of the top of `levelId`'s outside walls at plan point p. That's its ceiling, unless a roof
 * over p has its eaves higher up: then the walls rise to meet that roof, so no gap shows under it.
 * Where another level fills some of that height at p (an upper storey over this wing, or the
 * next wing's own wall along the line where two wings meet), the roof sits on that level
 * instead and doesn't lift these walls. Lower eaves change nothing.
 */
export function wallTopAt(plan: Plan, levelId: string, p: Vec2): number {
  const ceiling = ceilingRL(plan, levelId)
  let top = Infinity
  for (const r of plan.roofs) {
    if (r.pts.length < 3) continue
    const e = roofEavesRL(plan, r)
    if (e <= ceiling + 1e-4 || e >= top) continue
    const ring = signedArea(r.pts) < 0 ? [...r.pts].reverse() : r.pts
    if (!pointInPolygon(p[0], p[1], growRing(ring, 0.01))) continue
    const between = plan.levels.some(l => {
      if (l.id === levelId || floorRL(plan, l.id) >= e - 1e-3 || ceilingRL(plan, l.id) <= ceiling + 1e-3) return false
      return outlinesOf(plan, l.id).some(o => pointInPolygon(p[0], p[1], o))
    })
    if (!between) top = e
  }
  return Number.isFinite(top) ? top : ceiling
}

/** RL of the top of a wall: outside walls rise to a roof whose eaves are above the ceiling; the rest stop at the ceiling. */
export function wallTopRL(plan: Plan, wall: Wall): number {
  if (wall.kind !== 'external') return ceilingRL(plan, wall.level)
  return wallTopAt(plan, wall.level, [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2])
}

/** A point just inside a ring at the middle of its edge i to i+1, whichever way the ring runs, for wallTopAt along an outline. */
export function insideEdgeMid(ring: Vec2[], i: number, d = 0.05): Vec2 {
  const a = ring[i]
  const b = ring[(i + 1) % ring.length]
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const s = signedArea(ring) > 0 ? 1 : -1
  return [(a[0] + b[0]) / 2 - (dy / len) * d * s, (a[1] + b[1]) / 2 + (dx / len) * d * s]
}
