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
import { defaultGables, simplifyRing } from './roof'
import { followLevels, linkStairs, stairLayout } from './stairs'
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
  }
  return { ...plan, roofs: [...plan.roofs, roof] }
}

export function updateRoof(plan: Plan, id: string, patch: Partial<Roof>): Plan {
  return { ...plan, roofs: plan.roofs.map(r => (r.id === id ? { ...r, ...patch } : r)) }
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
  }
}

/** Add a level above the top one, copying the top level's external walls as a start. */
export function addLevelAbove(plan: Plan): { plan: Plan; id: string } {
  const top = sortedLevels(plan).at(-1)!
  const level: Level = {
    id: newId('level'),
    name: plan.levels.length === 1 ? 'First floor' : `Level ${plan.levels.length + 1}`,
    elevation: Math.round((top.elevation + top.height + FLOOR_STRUCTURE) * 1000) / 1000,
    height: top.height,
  }
  const copied = plan.walls
    .filter(w => w.level === top.id && w.kind === 'external')
    .map(w => ({ ...w, id: newId('wall'), level: level.id }))
  // A stair on the old top level that climbs a storey now arrives on the new floor.
  return { plan: linkStairs({ ...plan, levels: [...plan.levels, level], walls: [...plan.walls, ...copied] }), id: level.id }
}

/** A name for a new level no other level has: "Level 4", or the next number free. */
function newLevelName(plan: Plan): string {
  const taken = new Set(plan.levels.map(l => l.name.toLowerCase()))
  let n = plan.levels.length + 1
  while (taken.has(`level ${n}`)) n++
  return `Level ${n}`
}

/**
 * Add a level a storey below the lowest one. It starts empty: a level under the house is usually a
 * split level beside it or a basement, and either is drawn afresh.
 */
export function addLevelBelow(plan: Plan): { plan: Plan; id: string } {
  const low = sortedLevels(plan)[0]!
  const height = low.height
  return addLevelAt(plan, floorRL(plan, low.id) - height - FLOOR_STRUCTURE, height)
}

/**
 * Add a level with its floor at an RL: a split level beside the others, a step up or down.
 * It starts empty, with the lowest level's ceiling height unless one is given.
 */
export function addLevelAt(plan: Plan, rl: number, height = sortedLevels(plan)[0]?.height ?? 2.7): { plan: Plan; id: string } {
  const level: Level = {
    id: newId('level'),
    name: newLevelName(plan),
    elevation: Math.round((rl - plan.placement.ffl) * 1000) / 1000,
    height,
  }
  return { plan: linkStairs({ ...plan, levels: [...plan.levels, level] }), id: level.id }
}

/** Set a level's floor RL: its height above the placement's FFL follows. */
export const setLevelRL = (plan: Plan, id: string, rl: number): Plan => updateLevel(plan, id, { elevation: Math.round((rl - plan.placement.ffl) * 1000) / 1000 })

export function deleteLevel(plan: Plan, id: string): Plan {
  if (plan.levels.length <= 1) return plan
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
