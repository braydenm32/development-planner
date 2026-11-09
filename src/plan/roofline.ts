// Where a roof sits: its eaves line, as an RL. A roof sits on its own level's walls unless it's
// given an eaves RL of its own, or matched to another level's ceiling or another roof's eaves, so
// roofs on a split-level house can share one roofline. Every drawing, the 3D view and the numbers
// read a roof's height from roofEavesRL, so they all agree.

import { floorRL, levelById, sortedLevels, type Level, type Plan, type Roof, type RoofEaves, type Wall } from './model'

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
