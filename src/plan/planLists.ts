// The plan as lists: every wall, door, window, stair and piece of furniture on a level, named so
// it can be told from the next, for Design › Walls & doors and Design › Furniture. A row picks its
// item, so everything on the plan can be reached, picked and changed without a pointer (WCAG 2.1.1);
// the rooms and outdoor areas already have theirs (Design › Rooms & areas). Also here: adding a wall
// by a typed length and direction, a door or window at a typed distance along a wall, and a piece of
// furniture into a room. Pure, so it is tested without a page.

import { pointInPolygon, type Vec2 } from '../lib/geom'
import { bearingName } from '../lib/terrain'
import { doorWindowSchedule } from '../export/schedule'
import { furnitureCorners, furnitureName, newFurniture } from './furniture'
import { buildingOutline, faceAround, planarFaces, roomShape } from './geometry'
import { houseWalls, levelById, pointOnWall, toSite, wallDir, wallLength, type OpeningKind, type Plan, type Room, type Wall } from './model'
import { addFurniture, addOpening, addWall, wallAlreadyThere, wallStyleAt } from './ops'
import { wallClear } from './openingFit'
import { ringsCentre } from './placement'
import type { OpeningDefaults, Selection } from './store'

export interface PlanRow {
  id: string
  sel: Selection
  /** What it is: "External wall", "Door D1", "Queen bed". */
  name: string
  /** The plain word for it, for "Change or delete this wall". */
  kind: string
  /** Where it is, to tell it from the others: "north side · Study / Laundry", "Entry / Hall". */
  where: string
  /** Its size, at the row's end. */
  detail: string
  /** Points to frame on the plan when it is picked (house frame). */
  pts: Vec2[]
}

const mm = (m: number) => `${Math.round(m * 1000)} mm`
const KIND = { external: 'External wall', internal: 'Internal wall', retaining: 'Retaining wall' } as const
/** How far either side of a wall's centreline to look for the rooms beside it (m). */
const SIDE = 0.15

/** The rooms of a level with the outline each sits in. */
function roomOutlines(plan: Plan, level: string): { room: Room; ring: Vec2[] }[] {
  const faces = planarFaces(plan.walls.filter(w => w.level === level))
  const out: { room: Room; ring: Vec2[] }[] = []
  for (const room of plan.rooms.filter(r => r.level === level)) {
    const shape = roomShape(room, faces)
    if (shape) out.push({ room, ring: shape.centre })
  }
  return out
}

/** The rooms a wall runs beside, looked for at five points along it on both sides. */
function roomsBeside(w: Wall, rooms: { room: Room; ring: Vec2[] }[]): string[] {
  const d = wallDir(w)
  const len = wallLength(w)
  const names: string[] = []
  for (const t of [0.5, 0.1, 0.3, 0.7, 0.9]) {
    const c = pointOnWall(w, len * t)
    for (const s of [SIDE + w.thickness / 2, -(SIDE + w.thickness / 2)]) {
      const p: Vec2 = [c[0] - d[1] * s, c[1] + d[0] * s]
      const hit = rooms.find(r => pointInPolygon(p[0], p[1], r.ring))
      if (hit && !names.includes(hit.room.name)) names.push(hit.room.name)
    }
  }
  return names
}

/** The house walls on a level, in the order they were drawn. Retaining walls have their own list in Earthworks. */
export function wallRows(plan: Plan, level: string): PlanRow[] {
  const walls = houseWalls(plan.walls.filter(w => w.level === level))
  const rooms = roomOutlines(plan, level)
  const centre = ringsCentre(buildingOutline(planarFaces(walls)).outlines)
  // Compass sides are true ones: the house may sit turned on its block.
  const site = (p: Vec2) => toSite(p, plan.placement, [0, 0])
  return walls.map(w => {
    const mid: Vec2 = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]
    const beside = roomsBeside(w, rooms)
    const parts: string[] = []
    if (w.kind === 'external' && centre) {
      const [m, c] = [site(mid), site(centre)]
      if (Math.hypot(m[0] - c[0], m[1] - c[1]) > 0.5) parts.push(`${bearingName(((Math.atan2(m[0] - c[0], m[1] - c[1]) * 180) / Math.PI + 360) % 360)} side`)
    }
    // The rooms it runs beside, as the door and window schedule writes them: "Hall / Study".
    if (beside.length) parts.push(`${beside.slice(0, 3).join(' / ')}${beside.length > 3 ? ' / …' : ''}`)
    return { id: w.id, sel: { type: 'wall', id: w.id }, name: KIND[w.kind], kind: 'wall', where: parts.join(' · '), detail: mm(wallLength(w)), pts: [w.a, w.b] }
  })
}

/** The doors, windows, openings and garage doors on a level, with the marks the schedule gives them (D1, W1). */
export function openingRows(plan: Plan, level: string): PlanRow[] {
  const floor = levelById(plan, level)?.name
  const out: PlanRow[] = []
  for (const r of doorWindowSchedule(plan)) {
    const o = plan.openings.find(x => x.id === r.opening)
    const w = o && plan.walls.find(x => x.id === o.wall)
    if (!o || !w || w.level !== level || r.floor !== floor) continue
    out.push({
      id: o.id,
      sel: { type: 'opening', id: o.id },
      name: `${r.type} ${r.id}`,
      kind: r.type.toLowerCase(),
      where: r.room === 'Outside' ? '' : r.room,
      detail: `${Math.round(o.width * 1000)} × ${mm(o.height)}`,
      pts: [pointOnWall(w, o.offset - o.width / 2), pointOnWall(w, o.offset + o.width / 2)],
    })
  }
  return out
}

const SHAPES = { straight: 'Straight', l: 'L-shaped', u: 'U-shaped' } as const

export function stairRows(plan: Plan, level: string): PlanRow[] {
  return plan.stairs
    .filter(s => s.level === level)
    .map((s, i, all) => {
      const to = s.toLevel ? levelById(plan, s.toLevel)?.name : undefined
      return {
        id: s.id,
        sel: { type: 'stair', id: s.id },
        name: all.length > 1 ? `Stair ${i + 1}` : 'Stair',
        kind: 'stair',
        where: to ? `up to ${to}` : '',
        detail: `${SHAPES[s.shape]} · ${mm(s.width)} wide`,
        pts: [s.at],
      }
    })
}

export function furnitureRows(plan: Plan, level: string): PlanRow[] {
  const rooms = roomOutlines(plan, level)
  return plan.furniture
    .filter(f => f.level === level)
    .map(f => {
      const room = rooms.find(r => pointInPolygon(f.at[0], f.at[1], r.ring))
      return {
        id: f.id,
        sel: { type: 'furniture', id: f.id },
        name: furnitureName(f),
        kind: 'piece',
        where: room ? `in ${room.room.name}` : '',
        detail: `${Math.round(f.width * 1000)} × ${mm(f.depth)}`,
        pts: furnitureCorners(f),
      }
    })
}

// ---- Adding without a pointer ----

/** Which way a new wall runs: a turn from the wall it starts on, or an angle on the plan (degrees anticlockwise from its x axis). */
export type Heading = 'straight' | 'left' | 'right' | number

/** The plan angle (degrees) a heading means, given the way the wall it starts from was running (null: none). */
export function headingAngle(h: Heading, running: Vec2 | null): number {
  if (typeof h === 'number') return ((h % 360) + 360) % 360
  const base = running ? (Math.atan2(running[1], running[0]) * 180) / Math.PI : 0
  return (((base + (h === 'left' ? 90 : h === 'right' ? -90 : 0)) % 360) + 360) % 360
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** Where a wall of this length ends, to the millimetre, so walls typed round an outline meet at its start. */
export function wallEndFrom(from: Vec2, length: number, angle: number): Vec2 {
  const t = (angle * Math.PI) / 180
  return [round(from[0] + Math.cos(t) * length), round(from[1] + Math.sin(t) * length)]
}

/** An end of a wall to start the next from, and the way the wall runs into it. */
export function wallEndOf(w: Pick<Wall, 'a' | 'b'>, end: 'a' | 'b'): { at: Vec2; running: Vec2 } {
  const d = wallDir(w)
  return end === 'b' ? { at: w.b, running: d } : { at: w.a, running: [-d[0], -d[1]] }
}

export type Added = { plan: Plan; id: string } | { plan: Plan; id: null; why: string }

/**
 * Add a wall from a point, by its length and angle, as the Wall tool would have drawn it: inside
 * the house it is an internal wall, and one on top of a wall already there adds nothing.
 */
export function addWallFrom(plan: Plan, level: string, from: Vec2, length: number, angle: number, style: { kind: Wall['kind']; thickness: number }): Added {
  if (!(length >= 0.05)) return { plan, id: null, why: 'A wall needs a length of 50 mm or more.' }
  const to = wallEndFrom(from, length, angle)
  if (wallAlreadyThere(plan, level, from, to, style.kind)) return { plan, id: null, why: 'There’s already a wall there, so no new one was added.' }
  const next = addWall(plan, level, from, to, wallStyleAt(plan, level, from, to, style))
  const made = next.walls.at(-1)
  return made && next !== plan ? { plan: next, id: made.id } : { plan, id: null, why: 'That wall could not be added.' }
}

/** Where along a wall an opening can sit: its clear run between the walls that turn off its ends (m from its start). */
export const openingRun = (plan: Plan, w: Wall) => wallClear(plan.walls, w)

/** Add a door, window, opening or garage door with its middle `offset` metres along a wall, at the tool's size. */
export function addOpeningAt(plan: Plan, wallId: string, kind: OpeningKind, offset: number, d: OpeningDefaults): Added {
  const w = plan.walls.find(x => x.id === wallId)
  if (!w) return { plan, id: null, why: 'Pick a wall first.' }
  const next = addOpening(plan, w, kind, offset, d)
  const made = next.openings.at(-1)
  return made && next !== plan ? { plan: next, id: made.id } : { plan, id: null, why: 'That wall has no room for it. Pick a longer wall, or make it narrower in the tool’s settings.' }
}

/** Put a piece of furniture in the middle of a room; from there its own fields turn it and the arrow keys move it. */
export function addFurnitureIn(plan: Plan, roomId: string, kind: string, rotation = 0): Added {
  const room = plan.rooms.find(r => r.id === roomId)
  if (!room) return { plan, id: null, why: 'Pick a room first.' }
  const face = faceAround(room.at, planarFaces(plan.walls.filter(w => w.level === room.level)))
  // The middle of the room's outline; a room not closed in yet takes it at its label.
  const at: Vec2 = face ? [face.pts.reduce((t, p) => t + p[0], 0) / face.pts.length, face.pts.reduce((t, p) => t + p[1], 0) / face.pts.length] : room.at
  const inside = face && !pointInPolygon(at[0], at[1], face.pts) ? room.at : at
  // To the nearest 10 mm, as a piece dropped with the pointer is.
  const f = newFurniture(kind, room.level, [Math.round(inside[0] * 100) / 100, Math.round(inside[1] * 100) / 100], rotation)
  if (!f) return { plan, id: null, why: 'Pick a piece of furniture first.' }
  return { plan: addFurniture(plan, f), id: f.id }
}
