// A plan from a project file, with the entries that can't be drawn left out and counted. A file
// the app wrote has none; one edited by hand, cut short or written by a broken copy may hold a
// wall with no ends, a door on a wall that isn't there or a room with no position. Left in, they
// draw as nothing (or worse); left out silently, the person never learns the file was damaged.
// So they're dropped here and named in the review before the project opens.

import type { Vec2 } from '../lib/geom'
import { OPENING_NAMES, type Plan } from '../plan/model'

/** What was left out, in the plan's own words: { thing: 'wall', count: 2 }. */
export interface Dropped {
  thing: string
  count: number
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const pt = (v: unknown): v is Vec2 => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1])
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {})) : [])
const ring = (v: unknown, min: number) => Array.isArray(v) && v.length >= min && v.every(pt)

/** Thrown when the plan itself can't be read at all: the file is damaged, and says how. */
export class DamagedPlan extends Error {}

/**
 * The plan with only the entries that can be drawn, and what was dropped. Throws DamagedPlan when
 * there is nothing to build on: levels that can't be read, or no place on the block.
 */
export function readablePlan(raw: Plan): { plan: Plan; dropped: Dropped[] } {
  const p = raw as unknown as Record<string, unknown>
  const dropped = new Map<string, number>()
  const drop = (thing: string) => dropped.set(thing, (dropped.get(thing) ?? 0) + 1)
  /** Keep the entries that pass, counting the rest under what they're called. */
  const keep = <T>(v: unknown, ok: (x: Record<string, unknown>) => boolean, thing: string | ((x: Record<string, unknown>) => string)): T[] =>
    list(v).filter(x => {
      if (ok(x)) return true
      drop(typeof thing === 'string' ? thing : thing(x))
      return false
    }) as unknown as T[]

  const levels = keep<Plan['levels'][number]>(p.levels, l => str(l.id) && num(l.elevation) && num(l.height) && l.height > 0, 'level').map(l => ({ ...l, name: str(l.name) ? l.name : 'Level' }))
  // A plan with no levels at all is an empty one, as it always was; levels that were there and can't be read are damage.
  if (!Array.isArray(p.levels) || (p.levels.length > 0 && !levels.length)) throw new DamagedPlan('its plan’s levels can’t be read')
  const pl = p.placement as Record<string, unknown> | undefined
  if (!pl || !num(pl.e) || !num(pl.n) || !num(pl.rotation) || !num(pl.ffl)) throw new DamagedPlan('its plan doesn’t say where the house sits')
  const onLevel = (x: Record<string, unknown>) => str(x.id) && levels.some(l => l.id === x.level)

  const walls = keep<Plan['walls'][number]>(p.walls, w => onLevel(w) && pt(w.a) && pt(w.b) && num(w.thickness) && w.thickness > 0 && (w.kind === 'external' || w.kind === 'internal' || w.kind === 'retaining'), 'wall')
  const wallIds = new Set(walls.map(w => w.id))
  const openings = keep<Plan['openings'][number]>(
    p.openings,
    o => str(o.id) && wallIds.has(o.wall as string) && num(o.offset) && num(o.width) && o.width > 0 && num(o.height) && num(o.sill),
    o => (OPENING_NAMES[o.kind as keyof typeof OPENING_NAMES] ?? 'Opening').toLowerCase(),
  )
  const rooms = keep<Plan['rooms'][number]>(p.rooms, r => onLevel(r) && pt(r.at), 'room').map(r => ({ ...r, name: typeof r.name === 'string' ? r.name : String(r.name ?? 'Room') }))
  const areas = keep<Plan['areas'][number]>(p.areas, a => onLevel(a) && ring(a.pts, 3), 'outdoor area').map(a => ({ ...a, name: typeof a.name === 'string' ? a.name : '' }))
  const roofs = keep<Plan['roofs'][number]>(p.roofs, r => onLevel(r) && ring(r.pts, 3) && num(r.pitch) && num(r.overhang) && str(r.type), 'roof')
  const stairs = keep<Plan['stairs'][number]>(p.stairs, s => onLevel(s) && pt(s.at) && num(s.angle) && num(s.width) && num(s.base) && num(s.rise) && num(s.going), 'stair')
  const furniture = keep<Plan['furniture'][number]>(p.furniture, f => onLevel(f) && str(f.kind) && pt(f.at) && num(f.rotation) && num(f.width) && num(f.depth) && num(f.height), 'piece of furniture')
  const notes = keep<NonNullable<Plan['notes']>[number]>(p.notes, n => onLevel(n) && pt(n.at) && typeof n.text === 'string', 'note')

  return {
    plan: { ...raw, levels, walls, openings, rooms, areas, roofs, stairs, furniture, ...(p.notes !== undefined ? { notes } : {}) },
    dropped: [...dropped].map(([thing, count]) => ({ thing, count })),
  }
}

const PLURAL: Record<string, string> = { 'piece of furniture': 'pieces of furniture' }

/** "1 wall, 1 room and 2 doors": what was left out, for the review. Empty when nothing was. */
export function droppedWords(dropped: Dropped[]): string {
  const parts = dropped.map(d => `${d.count} ${d.count === 1 ? d.thing : (PLURAL[d.thing] ?? `${d.thing}s`)}`)
  if (parts.length < 2) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
