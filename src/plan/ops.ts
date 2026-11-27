import { signedArea, type Vec2 } from '../lib/geom'
import {
  FLOOR_STRUCTURE,
  floorRL,
  houseWalls,
  newId,
  sortedLevels,
  wallDir,
  wallLength,
  type Area,
  type AreaKind,
  type Furniture,
  type Level,
  type Opening,
  type OpeningKind,
  type Plan,
  type Room,
  type Roof,
  type Stair,
  type Wall,
  type WallKind,
} from './model'
import { furnitureCorners, resized } from './furniture'
import { defaultGables, keepPlateLift, simplifyRing } from './roof'
import { roofCoveredBy, roofEavesRL, setEavesRL } from './roofline'
import { followLevels, linkStairs, stairLayout } from './stairs'
import { levelLeftAbove } from './storeys'
import type { OpeningDefaults, RoofDefaults, Selection, StairDefaults } from './store'

const TOL = 1e-3
const same = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) <= TOL && Math.abs(a[1] - b[1]) <= TOL

export function addWall(plan: Plan, level: string, a: Vec2, b: Vec2, style: { kind: WallKind; thickness: number }): Plan {
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01) return plan
  const wall: Wall = { id: newId('wall'), level, a: [a[0], a[1]], b: [b[0], b[1]], ...style }
  return { ...plan, walls: [...plan.walls, wall] }
}

/** Move every wall end on the level that sits at `from`, so joined walls stay joined. */
export function moveJoint(plan: Plan, level: string, from: Vec2, to: Vec2): Plan {
  const walls = plan.walls.map(w => {
    if (w.level !== level) return w
    const a = same(w.a, from) ? to : w.a
    const b = same(w.b, from) ? to : w.b
    return a === w.a && b === w.b ? w : { ...w, a: [a[0], a[1]] as Vec2, b: [b[0], b[1]] as Vec2 }
  })
  return { ...plan, walls }
}

/** Shift a whole wall; walls joined at its ends stretch to follow. */
export function moveWall(plan: Plan, id: string, delta: Vec2, start: Plan): Plan {
  const w0 = start.walls.find(w => w.id === id)
  if (!w0) return plan
  const a: Vec2 = [w0.a[0] + delta[0], w0.a[1] + delta[1]]
  const b: Vec2 = [w0.b[0] + delta[0], w0.b[1] + delta[1]]
  let next = moveJoint(start, w0.level, w0.a, a)
  next = moveJoint(next, w0.level, w0.b, b)
  return next
}

/** Change a wall's length by moving its end point (and anything joined there). */
export function setWallLength(plan: Plan, id: string, length: number): Plan {
  const w = plan.walls.find(x => x.id === id)
  if (!w || length < 0.05) return plan
  const d = wallDir(w)
  return moveJoint(plan, w.level, w.b, [w.a[0] + d[0] * length, w.a[1] + d[1] * length])
}

export function updateWall(plan: Plan, id: string, patch: Partial<Wall>): Plan {
  return { ...plan, walls: plan.walls.map(w => (w.id === id ? { ...w, ...patch } : w)) }
}

export function addOpening(plan: Plan, wall: Wall, kind: OpeningKind, offset: number, d: OpeningDefaults): Plan {
  const len = wallLength(wall)
  const width = Math.min(d.width, len - 0.05)
  if (width < 0.3) return plan
  const o: Opening = {
    id: newId(kind),
    wall: wall.id,
    kind,
    offset: Math.min(Math.max(offset, width / 2), len - width / 2),
    width,
    height: d.height,
    sill: kind === 'window' ? d.sill : 0,
    flipHinge: false,
    flipSwing: false,
  }
  return { ...plan, openings: [...plan.openings, o] }
}

export function updateOpening(plan: Plan, id: string, patch: Partial<Opening>): Plan {
  return { ...plan, openings: plan.openings.map(o => (o.id === id ? { ...o, ...patch } : o)) }
}

export function addRoom(plan: Plan, level: string, at: Vec2, name: string): Plan {
  return { ...plan, rooms: [...plan.rooms, { id: newId('room'), level, name, at }] }
}

export function updateRoom(plan: Plan, id: string, patch: Partial<Room>): Plan {
  return { ...plan, rooms: plan.rooms.map(r => (r.id === id ? { ...r, ...patch } : r)) }
}

export function addArea(plan: Plan, level: string, pts: Vec2[], name: string, kind: AreaKind = 'slab'): Plan {
  const area: Area = { id: newId('area'), level, name, pts, kind, top: 0 }
  return { ...plan, areas: [...plan.areas, area] }
}

export function updateArea(plan: Plan, id: string, patch: Partial<Area>): Plan {
  return { ...plan, areas: plan.areas.map(a => (a.id === id ? { ...a, ...patch } : a)) }
}

/** A roof over an outline, with gable ends and the low side guessed from its shape. */
export function addRoof(plan: Plan, level: string, outline: Vec2[], d: RoofDefaults): Plan {
  const ccw = signedArea(outline) < 0 ? [...outline].reverse() : outline
  const pts = simplifyRing(ccw).pts.map(p => [p[0], p[1]] as Vec2)
  if (pts.length < 3) return plan
  const len = pts.map((p, i) => Math.hypot(pts[(i + 1) % pts.length][0] - p[0], pts[(i + 1) % pts.length][1] - p[1]))
  const roof: Roof = {
    id: newId('roof'),
    level,
    pts,
    type: d.type,
    pitch: d.pitch,
    overhang: d.overhang,
    gables: defaultGables(pts),
    lowEdge: len.indexOf(Math.max(...len)),
    // The eaves level is taken at the wall plate: a wider overhang never lifts the ridge.
    plateLift: 0,
  }
  return { ...plan, roofs: [...plan.roofs, roof] }
}

export function updateRoof(plan: Plan, id: string, patch: Partial<Roof>): Plan {
  // An older roof keeps its height at the wall when its overhang or pitch changes (keepPlateLift).
  return { ...plan, roofs: plan.roofs.map(r => (r.id === id ? keepPlateLift(r, { ...r, ...patch }) : r)) }
}

/** Height from one level's floor to the floor above, or a typical storey if it's the top level. */
export function defaultRise(plan: Plan, level: string): number {
  const ls = sortedLevels(plan)
  const i = ls.findIndex(l => l.id === level)
  if (i < 0) return 2.7 + FLOOR_STRUCTURE
  if (i + 1 < ls.length) return Math.round((ls[i + 1].elevation - ls[i].elevation) * 1000) / 1000
  return Math.round((ls[i].height + FLOOR_STRUCTURE) * 1000) / 1000
}

/** The next level up from `level`, if there is one. */
export function levelAbove(plan: Plan, level: string): Level | undefined {
  const ls = sortedLevels(plan)
  const i = ls.findIndex(l => l.id === level)
  return i >= 0 ? ls[i + 1] : undefined
}

export function newStair(plan: Plan, level: string, at: Vec2, angle: number, d: StairDefaults): Stair {
  return {
    id: newId('stair'),
    level,
    at: [at[0], at[1]],
    angle,
    width: d.width,
    base: 0,
    rise: defaultRise(plan, level),
    // Joined to the floor above, so it follows that floor; a stair on the top level is joined
    // once a level goes above it (linkStairs).
    toLevel: levelAbove(plan, level)?.id,
    going: 0.25,
    shape: d.shape,
    turn: d.turn,
  }
}

export function addStair(plan: Plan, stair: Stair): Plan {
  return { ...plan, stairs: [...plan.stairs, stair] }
}

export function updateStair(plan: Plan, id: string, patch: Partial<Stair>): Plan {
  return { ...plan, stairs: plan.stairs.map(s => (s.id === id ? { ...s, ...patch } : s)) }
}

export function addFurniture(plan: Plan, item: Furniture): Plan {
  return { ...plan, furniture: [...plan.furniture, item] }
}

export function updateFurniture(plan: Plan, id: string, patch: Partial<Furniture>): Plan {
  return { ...plan, furniture: plan.furniture.map(f => (f.id === id ? { ...f, ...patch } : f)) }
}

/** Change a piece of furniture's size, keeping its back where it is. */
export function resizeFurniture(plan: Plan, id: string, size: Partial<Pick<Furniture, 'width' | 'depth' | 'height'>>): Plan {
  return { ...plan, furniture: plan.furniture.map(f => (f.id === id ? resized(f, size) : f)) }
}

export function deleteSelection(plan: Plan, sel: Selection): Plan {
  switch (sel.type) {
    case 'wall':
      return {
        ...plan,
        walls: plan.walls.filter(w => w.id !== sel.id),
        openings: plan.openings.filter(o => o.wall !== sel.id),
      }
    case 'opening':
      return { ...plan, openings: plan.openings.filter(o => o.id !== sel.id) }
    case 'room':
      return { ...plan, rooms: plan.rooms.filter(r => r.id !== sel.id) }
    case 'area':
      return { ...plan, areas: plan.areas.filter(a => a.id !== sel.id) }
    case 'roof':
      return { ...plan, roofs: plan.roofs.filter(r => r.id !== sel.id) }
    case 'stair':
      return { ...plan, stairs: plan.stairs.filter(s => s.id !== sel.id) }
    case 'furniture':
      return { ...plan, furniture: plan.furniture.filter(f => f.id !== sel.id) }
    case 'sketch':
      return { ...plan, sketch: (plan.sketch ?? []).filter(s => s.id !== sel.id) }
  }
}

/**
 * Add a level above the top one, copying the top level's external walls as a start. Roofs the
 * new storey would bury (those wholly under its walls) move up onto it in the same step, sitting
 * on its walls: `roofsMoved` says how many, for the toast.
 */
export function addLevelAbove(plan: Plan): { plan: Plan; id: string; roofsMoved: number } {
  const top = sortedLevels(plan).at(-1)!
  const level: Level = {
    id: newId('level'),
    name: newLevelName(plan, 'above'),
    elevation: Math.round((top.elevation + top.height + FLOOR_STRUCTURE) * 1000) / 1000,
    height: top.height,
  }
  const copied = plan.walls
    .filter(w => w.level === top.id && w.kind === 'external')
    .map(w => ({ ...w, id: newId('wall'), level: level.id }))
  // A stair on the old top level that climbs a storey now arrives on the new floor.
  const added = linkStairs({ ...plan, levels: [...plan.levels, level], walls: [...plan.walls, ...copied] })
  const buried = new Set(added.roofs.filter(r => !roofCoveredBy(plan, r) && roofCoveredBy(added, r)?.id === level.id).map(r => r.id))
  if (!buried.size) return { plan: added, id: level.id, roofsMoved: 0 }
  const roofs = added.roofs.map(r => {
    if (!buried.has(r.id)) return r
    // On the new level's walls; a roofline shared with another roof that moves too is kept.
    const { eaves, ...rest } = r
    return eaves && 'roof' in eaves && buried.has(eaves.roof) ? { ...r, level: level.id } : { ...rest, level: level.id }
  })
  const moved = { ...added, roofs }
  // A roof that stays where it is but followed one that moved keeps the eaves it had.
  const kept = moved.roofs.map(r => {
    if (buried.has(r.id) || Math.abs(roofEavesRL(moved, r) - roofEavesRL(plan, r)) < 1e-6) return r
    return setEavesRL(moved, r.id, roofEavesRL(plan, r)).roofs.find(x => x.id === r.id)!
  })
  return { plan: { ...moved, roofs: kept }, id: level.id, roofsMoved: buried.size }
}

/** Where a new level goes: a storey above the top one, a storey below the lowest, or beside the others at an RL. */
export type LevelPlace = 'above' | 'below' | 'beside'

/** What new levels are called, by where they go, in the order they're tried. */
const LEVEL_NAMES: Record<LevelPlace, string[]> = {
  above: ['First floor', 'Second floor', 'Third floor', 'Upper floor'],
  below: ['Lower floor', 'Basement level'],
  beside: ['Split level'],
}

/**
 * A name for a new level that says where it is and no other level has: "First floor", then
 * "Second floor", above; "Lower floor", then "Basement level", below; "Split level" beside.
 * Once those are taken, the last with the next number free ("Split level 2").
 */
export function newLevelName(plan: Plan, place: LevelPlace): string {
  const taken = new Set(plan.levels.map(l => l.name.trim().toLowerCase()))
  const free = LEVEL_NAMES[place].find(n => !taken.has(n.toLowerCase()))
  if (free) return free
  const last = LEVEL_NAMES[place].at(-1)!
  let n = 2
  while (taken.has(`${last} ${n}`.toLowerCase())) n++
  return `${last} ${n}`
}

/**
 * Add a level a storey below the lowest one. It starts empty: a level under the house is usually a
 * split level beside it or a basement, and either is drawn afresh.
 */
export function addLevelBelow(plan: Plan): { plan: Plan; id: string } {
  const low = sortedLevels(plan)[0]!
  const height = low.height
  return addLevelAt(plan, floorRL(plan, low.id) - height - FLOOR_STRUCTURE, height, 'below')
}

/**
 * Add a level with its floor at an RL: a split level beside the others, a step up or down.
 * It starts empty, with the lowest level's ceiling height unless one is given.
 */
export function addLevelAt(plan: Plan, rl: number, height = sortedLevels(plan)[0]?.height ?? 2.7, place: LevelPlace = 'beside'): { plan: Plan; id: string } {
  const level: Level = {
    id: newId('level'),
    name: newLevelName(plan, place),
    elevation: Math.round((rl - plan.placement.ffl) * 1000) / 1000,
    height,
  }
  return { plan: linkStairs({ ...plan, levels: [...plan.levels, level] }), id: level.id }
}

/** Set a level's floor RL: its height above the placement's FFL follows. */
export const setLevelRL = (plan: Plan, id: string, rl: number): Plan => updateLevel(plan, id, { elevation: Math.round((rl - plan.placement.ffl) * 1000) / 1000 })

/**
 * Delete a level and everything on it. With `lower`, when that leaves the level that was built
 * over it as the lowest, up in the air (levelLeftAbove), every level that stays comes down by
 * that much, so the house sits where the deleted floor was; a roof with a typed eaves RL comes
 * down with them, and a "First floor" that is now the ground floor is called that.
 */
export function deleteLevel(plan: Plan, id: string, lower = false): Plan {
  if (plan.levels.length <= 1) return plan
  const left = lower ? levelLeftAbove(plan, id) : null
  const without = removeLevel(plan, id)
  if (!left) return without
  const rename = left.level.name === 'First floor' && !without.levels.some(l => l.name.trim().toLowerCase() === 'ground floor')
  return followLevels({
    ...without,
    levels: without.levels.map(l => ({ ...l, elevation: Math.round((l.elevation - left.drop) * 1000) / 1000, ...(rename && l.id === left.level.id ? { name: 'Ground floor' } : {}) })),
    roofs: without.roofs.map(r => (r.eaves && 'rl' in r.eaves ? { ...r, eaves: { rl: Math.round((r.eaves.rl - left.drop) * 1000) / 1000 } } : r)),
  })
}

function removeLevel(plan: Plan, id: string): Plan {
  const walls = new Set(plan.walls.filter(w => w.level === id).map(w => w.id))
  // Stairs that went up to it are let go, keeping their tops (followLevels).
  return followLevels({
    ...plan,
    levels: plan.levels.filter(l => l.id !== id),
    walls: plan.walls.filter(w => w.level !== id),
    openings: plan.openings.filter(o => !walls.has(o.wall)),
    rooms: plan.rooms.filter(r => r.level !== id),
    areas: plan.areas.filter(a => a.level !== id),
    roofs: plan.roofs.filter(r => r.level !== id),
    stairs: plan.stairs.filter(s => s.level !== id),
    furniture: plan.furniture.filter(f => f.level !== id),
    notes: (plan.notes ?? []).filter(n => n.level !== id),
    // The sketch shows on every level, so it isn't lost with one: it moves to a level that stays.
    ...(plan.sketch ? { sketch: plan.sketch.map(s => (s.level === id ? { ...s, level: sortedLevels(plan).find(l => l.id !== id)!.id } : s)) } : {}),
  })
}

export function updateLevel(plan: Plan, id: string, patch: Partial<Level>): Plan {
  // Stairs joined to a level follow it when its height changes.
  return followLevels({ ...plan, levels: plan.levels.map(l => (l.id === id ? { ...l, ...patch } : l)) })
}

/** Bounding box of everything drawn on the plan (all levels), or null if empty. */
export function planBounds(plan: Plan): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const pts: Vec2[] = [
    ...plan.walls.flatMap(w => [w.a, w.b]),
    ...plan.areas.flatMap(a => a.pts),
    ...plan.roofs.flatMap(r => r.pts),
    ...plan.stairs.flatMap(s => stairLayout(s).outline),
    ...plan.furniture.flatMap(furnitureCorners),
  ]
  if (!pts.length) return null
  return {
    minX: Math.min(...pts.map(p => p[0])),
    minY: Math.min(...pts.map(p => p[1])),
    maxX: Math.max(...pts.map(p => p[0])),
    maxY: Math.max(...pts.map(p => p[1])),
  }
}

/**
 * Bounding box of the house: its walls on every level, leaving out retaining walls, outdoor
 * areas, roofs' eaves and furniture, so Fit house frames the house and not the driveway or the
 * lawn. Everything drawn (planBounds) when there are no house walls yet; null if nothing is.
 */
export function houseBounds(plan: Plan): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const pts = houseWalls(plan.walls).flatMap(w => [w.a, w.b])
  if (!pts.length) return planBounds(plan)
  return {
    minX: Math.min(...pts.map(p => p[0])),
    minY: Math.min(...pts.map(p => p[1])),
    maxX: Math.max(...pts.map(p => p[0])),
    maxY: Math.max(...pts.map(p => p[1])),
  }
}
