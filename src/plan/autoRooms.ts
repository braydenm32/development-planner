// Rooms that make themselves, as other floor planners' do: a space walls have just closed round
// (or a room a new wall has just cut in two) gets a room, "Room 3", ready to be named, in the
// same undo step as the wall that made it. The store runs this on every kept change to the walls
// (src/plan/store.ts), so it holds however the walls came: drawn, dragged shut, made from a
// sketch, pasted, copied up to a new level or drawn in one go with the Rectangle room tool.
//
// A plan is never touched when it opens, and a space that was already closed and had no room
// (an older plan, or a label deleted on purpose over a void) stays as it is until a wall cuts it.

import { centroidOf, pointInPolygon, type Vec2 } from '../lib/geom'
import { closestOnSegment, faceAround, planarFaces, type Face } from './geometry'
import { houseWalls, newId, type Plan, type Room, type Wall, type WallKind } from './model'
import { addWall, wallStyleAt } from './ops'

/** A closed space smaller than this is a sliver between walls, not a room (m²): Check everything leaves those out too. */
export const MIN_ROOM_AREA = 1

/** A rectangle room's shortest side (m). */
export const MIN_RECT_SIDE = 0.3

const near = (a: Vec2, b: Vec2, tol = 1e-3) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol
const mm = (v: number) => Math.round(v * 1000) / 1000

/** How far a point is from the nearest side of an outline. */
const toEdge = (p: Vec2, ring: Vec2[]) => ring.reduce((d, q, i) => Math.min(d, closestOnSegment(p, q, ring[(i + 1) % ring.length]).dist), Infinity)

/** The closed spaces on a level. */
const spacesOn = (plan: Pick<Plan, 'walls'>, level: string) => planarFaces(plan.walls.filter(w => w.level === level)).filter(f => f.area > 0)

/** Closed spaces standing free inside another (a room drawn in the middle of a bigger one). */
function islandsIn(face: Face, faces: Face[]): Face[] {
  return faces.filter(h => {
    if (h === face || h.area >= face.area) return false
    let inside = false
    for (const p of h.pts) {
      if (toEdge(p, face.pts) <= 1e-3) continue
      if (!pointInPolygon(p[0], p[1], face.pts)) return false
      inside = true
    }
    return inside
  })
}

/**
 * Where a space's label sits: its middle, or, where the middle is outside it or hard against a
 * wall (an L-shaped room, a room round another), the spot furthest from its walls.
 */
export function labelSpot(face: Face, faces: Face[] = [face]): Vec2 {
  const holes = islandsIn(face, faces)
  const rings = [face.pts, ...holes.map(h => h.pts)]
  const clear = (p: Vec2) => (pointInPolygon(p[0], p[1], face.pts) && !holes.some(h => pointInPolygon(p[0], p[1], h.pts)) ? Math.min(...rings.map(r => toEdge(p, r))) : -1)
  const xs = face.pts.map(p => p[0])
  const ys = face.pts.map(p => p[1])
  let box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  let best: Vec2 = face.pts[0]
  let bestClear = -1
  // A coarse grid, then a finer one round the best of it.
  const N = 16
  for (let pass = 0; pass < 2; pass++) {
    const dx = (box.x1 - box.x0) / N
    const dy = (box.y1 - box.y0) / N
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const p: Vec2 = [box.x0 + (i + 0.5) * dx, box.y0 + (j + 0.5) * dy]
        const c = clear(p)
        if (c > bestClear) {
          bestClear = c
          best = p
        }
      }
    box = { x0: best[0] - dx, y0: best[1] - dy, x1: best[0] + dx, y1: best[1] + dy }
  }
  // The middle wins wherever it's nearly as clear: a plain room's label is dead centre.
  const mid = centroidOf(face.pts)
  const at = clear(mid) >= bestClear * 0.8 ? mid : best
  return [mm(at[0]), mm(at[1])]
}

/** "Room 3": the first number no room on the plan has. */
export function nextRoomName(plan: Pick<Plan, 'rooms'>): string {
  const taken = new Set(plan.rooms.map(r => r.name.trim().toLowerCase()))
  let n = 1
  while (taken.has(`room ${n}`)) n++
  return `Room ${n}`
}

/** A room nobody has named or given a type yet: "Room 3", as it was made. */
export const stillToName = (r: Pick<Room, 'name' | 'type'>) => !r.type && (!r.name.trim() || /^Room \d+$/.test(r.name.trim()))

/** Levels whose house walls differ between two plans. */
function levelsWithChangedWalls(before: Plan, after: Plan): string[] {
  const sig = (p: Plan) => {
    const by = new Map<string, string>()
    for (const w of houseWalls(p.walls)) by.set(w.level, `${by.get(w.level) ?? ''}${w.id}:${w.a}:${w.b};`)
    return by
  }
  const was = sig(before)
  const now = sig(after)
  return after.levels.map(l => l.id).filter(id => now.has(id) && now.get(id) !== was.get(id))
}

/**
 * `after`, with a room in every space its walls have newly closed round since `before`: a space
 * that wasn't enclosed, or each part of one a wall has cut in two. A room whose label sat in the
 * middle of its space keeps to the middle of what the space has become (so a wall drawn through
 * it never lands on the label). A change that touched no house wall gives back `after` itself.
 */
export function roomsForNewSpaces(before: Plan, after: Plan): Plan {
  if (before.walls === after.walls) return after
  let plan = after
  for (const level of levelsWithChangedWalls(before, after)) plan = roomsOnLevel(before, plan, level)
  return plan
}

function roomsOnLevel(before: Plan, after: Plan, level: string): Plan {
  const now = spacesOn(after, level)
  if (!now.length) return after
  const was = spacesOn(before, level)
  const memo = (all: Face[]) => {
    const m = new Map<Face, Vec2>()
    return (f: Face) => m.get(f) ?? m.set(f, labelSpot(f, all)).get(f)!
  }
  const spotWas = memo(was)
  const spotNow = memo(now)
  // The space each one was part of before, if it was enclosed then.
  const from = new Map(now.map(f => [f, faceAround(spotNow(f), was)]))
  const partsOf = (g: Face) => now.filter(f => from.get(f) === g)
  /**
   * What a space has become: the part its middle is in, or the biggest part when a wall now runs
   * through its middle or a room has been drawn standing over it.
   */
  const heir = (g: Face): Face | null => {
    const parts = partsOf(g)
    if (!parts.length) return null
    const at = faceAround(spotWas(g), now)
    const stays = at && parts.includes(at) && toEdge(spotWas(g), at.pts) > 0.06 && !parts.some(p => p !== at && islandsIn(p, now).includes(at))
    return stays ? at : parts.reduce((a, b) => (b.area > a.area ? b : a))
  }

  let rooms = after.rooms
  for (const r of after.rooms) {
    if (r.level !== level) continue
    const g = faceAround(r.at, was)
    if (!g || !near(r.at, spotWas(g))) continue
    const f = heir(g)
    if (!f || near(r.at, spotNow(f))) continue
    rooms = rooms.map(x => (x === r ? { ...x, at: spotNow(f) } : x))
  }

  const made: Room[] = []
  const hasRoom = (f: Face) => [...rooms, ...made].some(r => r.level === level && faceAround(r.at, now) === f)
  for (const f of [...now].sort((a, b) => b.area - a.area)) {
    if (f.area < MIN_ROOM_AREA || hasRoom(f)) continue
    const g = from.get(f)
    // Already a closed space with no room, only reshaped: left as it was.
    if (g && partsOf(g).length < 2) continue
    made.push({ id: newId('room'), level, name: nextRoomName({ rooms: [...rooms, ...made] }), at: spotNow(f) })
  }
  return rooms === after.rooms && !made.length ? after : { ...after, rooms: [...rooms, ...made] }
}

/** The line for the hint bar when a change made rooms, or null when it made none. */
export function roomsMadeNote(before: Pick<Plan, 'rooms'>, after: Pick<Plan, 'rooms'>): string | null {
  const had = new Set(before.rooms.map(r => r.id))
  const made = after.rooms.filter(r => !had.has(r.id))
  if (!made.length) return null
  return made.length === 1
    ? `The walls close round a space, so it’s a room now: ${made[0].name}. Select it to name it and pick its type.`
    : `The walls close round ${made.length} spaces, so they’re rooms now. Select one to name it and pick its type.`
}

/** Whether a change gave the house its first floor: no closed outline on any level before, one after (the plan then zooms to the house). */
export function closesFirstOutline(before: Plan, after: Plan): boolean {
  const closed = (p: Plan) => p.levels.some(l => spacesOn(p, l.id).length > 0)
  return !closed(before) && closed(after)
}

// ---------------------------------------------------------------------------
// The Rectangle room tool

/** The parts of a new wall from a to b that no house wall on the level already runs along. */
function uncovered(walls: Wall[], a: Vec2, b: Vec2): [Vec2, Vec2][] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const d: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  const along = (p: Vec2) => (p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]
  const off = (p: Vec2) => Math.abs((p[0] - a[0]) * d[1] - (p[1] - a[1]) * d[0])
  const taken = walls
    .filter(w => off(w.a) <= 1e-3 && off(w.b) <= 1e-3)
    .map(w => [Math.min(along(w.a), along(w.b)), Math.max(along(w.a), along(w.b))] as [number, number])
    .sort((p, q) => p[0] - q[0])
  const out: [Vec2, Vec2][] = []
  const at = (t: number): Vec2 => [mm(a[0] + d[0] * t), mm(a[1] + d[1] * t)]
  let t = 0
  for (const [t0, t1] of [...taken, [len, len] as [number, number]]) {
    if (t0 - t > 0.01) out.push([at(t), at(Math.min(t0, len))])
    t = Math.max(t, t1)
    if (t >= len) break
  }
  return out
}

/**
 * Four walls round a rectangle, from one corner to the opposite one, square to the house. A side
 * that runs along a wall already there (a room drawn against the last one) adds only the part
 * that's missing; sides inside the house are internal walls, as the Wall tool draws them. A
 * rectangle with a side under 300 mm changes nothing. The store makes the room.
 */
export function rectangleWalls(plan: Plan, level: string, a: Vec2, c: Vec2, style: { kind: WallKind; thickness: number }): Plan {
  if (Math.abs(c[0] - a[0]) < MIN_RECT_SIDE || Math.abs(c[1] - a[1]) < MIN_RECT_SIDE) return plan
  const corners: Vec2[] = [a, [c[0], a[1]], c, [a[0], c[1]]]
  const there = houseWalls(plan.walls).filter(w => w.level === level)
  let next = plan
  corners.forEach((p, i) => {
    for (const [from, to] of uncovered(there, p, corners[(i + 1) % 4])) next = addWall(next, level, from, to, wallStyleAt(plan, level, from, to, style))
  })
  return next
}

/** The far corner of a rectangle typed as "4000 x 3000" (mm, width then depth), from a corner towards a point; null until both are typed. */
export function typedRectangle(typed: string, from: Vec2, toward: Vec2, widthAlong: 0 | 1 = 0): Vec2 | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*$/i.exec(typed)
  if (!m) return null
  const w = parseFloat(m[1]) / 1000
  const d = parseFloat(m[2]) / 1000
  if (!(w > 0) || !(d > 0)) return null
  const size: Vec2 = widthAlong === 0 ? [w, d] : [d, w]
  return [mm(from[0] + (toward[0] < from[0] ? -1 : 1) * size[0]), mm(from[1] + (toward[1] < from[1] ? -1 : 1) * size[1])]
}
