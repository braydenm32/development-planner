// Walk-through in 3D: the plan as a place to walk in, worked out once per plan, and the moves on
// it. Pure: no three.js, no React, so the tests walk made-up plans without a page. Everything here
// is in the site's frame (metres, x east, y north), as the 3D view lays the house out; heights are
// RLs. The view (./WalkRig.tsx) turns them into the scene's.

import { pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import { EYE_HEIGHT } from '../phone/camera'
import { buildingOutline, planarFaces, roomShape, sliceAlong, wallPieces, wallPolygons } from '../plan/geometry'
import { areaKind, floorRL, houseWalls, isRetaining, sortedLevels, toSite, wallDir, wallLength, type Plan } from '../plan/model'
import { roomTypeInfo } from '../plan/roomTypes'
import { stairArrivesAt, stairLayout } from '../plan/stairs'

/** Eye height above the floor (m). */
export const EYE = EYE_HEIGHT
/** How close the eye comes to a wall (m): enough that the near clip never cuts into it. */
export const RADIUS = 0.25
/** The most the floor may rise or drop in one stride (m): a door's few steps down to the yard, never off an upper floor. */
export const STEP_MAX = 1.0
/** The part of a wall a person's body meets (m above the floor): a sill below it stops you, a door's head above it doesn't. */
const BODY: [number, number] = [0.2, 1.75]
/** No single move is cut into strides longer than this (m), so a fast step never jumps a wall. */
const STRIDE = 0.1

/** A floor to stand on: its outline, any holes (a stair coming up), and its RL. */
export interface WalkFloor {
  pts: Vec2[]
  holes: Vec2[][]
  rl: number
}

/** A solid that stops you, with its box for a quick first test. */
export interface WalkSolid {
  pts: Vec2[]
  box: [number, number, number, number]
}

export interface WalkRoom {
  id: string
  name: string
  pts: Vec2[]
  area: number
  /** A point inside it: the room's own point on the plan. */
  at: Vec2
}

export interface WalkLevel {
  id: string
  name: string
  /** Its finished floor (RL). */
  rl: number
  height: number
  solids: WalkSolid[]
  floors: WalkFloor[]
  rooms: WalkRoom[]
  /** Outdoor areas on it (a deck, a patio), named for the readout. */
  areas: { name: string; pts: Vec2[] }[]
  /** Outlines of the house on this level, for its ceiling. */
  outlines: Vec2[][]
  /** The lowest level: the ground outside the house can be walked on too. */
  outside: boolean
  /** Doors in its outside walls: their middle, and the way into the house. */
  doors: { at: Vec2; inward: Vec2 }[]
}

export interface WalkMap {
  /** Lowest first; levels with no walls left out. */
  levels: WalkLevel[]
  /** The finished ground's RL at a site point; missing, the outside is at the lowest floor. */
  ground?: (p: Vec2) => number
  /** The block's boundary: the outside walk stops at it. */
  boundary?: Vec2[]
}

/** Where someone stands: a level (its index), a point, and the way they look (radians, anticlockwise from east). */
export interface Spot {
  level: number
  at: Vec2
  heading: number
}

const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]]
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k]
const len = (a: Vec2) => Math.hypot(a[0], a[1])
const inside = (p: Vec2, poly: Vec2[]) => pointInPolygon(p[0], p[1], poly)

function solid(pts: Vec2[]): WalkSolid {
  const xs = pts.map(p => p[0])
  const ys = pts.map(p => p[1])
  return { pts, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
}

/** The centre of a polygon's area. */
export function centroid(pts: Vec2[]): Vec2 {
  const a = signedArea(pts)
  if (Math.abs(a) < 1e-9) return scale(pts.reduce(add, [0, 0]), 1 / Math.max(1, pts.length))
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    const k = x0 * y1 - x1 * y0
    cx += (x0 + x1) * k
    cy += (y0 + y1) * k
  }
  return [cx / (6 * a), cy / (6 * a)]
}

/** What a room is called in the readout: its name, its type, or Room. */
const roomName = (r: Plan['rooms'][number]) => r.name.trim() || roomTypeInfo(r)?.label || 'Room'

/**
 * The plan as somewhere to walk: each level's walls as solids (a door, an opening or a low window
 * head lets you through; a sill or a closed garage door doesn't), its floors, rooms and doors.
 */
export function buildWalkMap(plan: Plan, origin: Vec2, ground?: (p: Vec2) => number, boundary?: Vec2[]): WalkMap {
  const site = (p: Vec2) => toSite(p, plan.placement, origin)
  const turn = (d: Vec2): Vec2 => sub(site(d), site([0, 0]))
  const levels: WalkLevel[] = []
  const sorted = sortedLevels(plan)
  sorted.forEach((level, i) => {
    const walls = houseWalls(plan.walls.filter(w => w.level === level.id))
    if (!walls.length) return
    const rl = floorRL(plan, level.id)
    const polys = wallPolygons(walls)
    const solids: WalkSolid[] = []
    for (const w of walls) {
      const poly = polys.get(w.id)
      if (!poly) continue
      const L = wallLength(w)
      const d = wallDir(w)
      // A garage door is drawn shut, so it stops you like the wall.
      const gaps = plan.openings.filter(o => o.wall === w.id && o.kind !== 'garage')
      for (const piece of wallPieces(L, Math.max(level.height, BODY[1] + 0.1), gaps)) {
        if (piece.z1 <= BODY[0] || piece.z0 >= BODY[1]) continue
        const s0 = piece.s0 <= 1e-6 ? -1e3 : piece.s0
        const s1 = piece.s1 >= L - 1e-6 ? 1e3 : piece.s1
        const part = sliceAlong(poly, w.a, d, s0, s1)
        if (part.length >= 3) solids.push(solid(part.map(site)))
      }
    }
    const faces = planarFaces(walls)
    const outlines = buildingOutline(faces).outlines
    const holes = plan.stairs.filter(st => stairArrivesAt(plan, st, level.id)).map(st => stairLayout(st).outline.map(site))
    const floors: WalkFloor[] = outlines.map(o => ({ pts: o.map(site), holes: holes.filter(h => h.every(p => inside(p, o.map(site)))), rl }))
    const areas: WalkLevel['areas'] = []
    for (const a of plan.areas.filter(x => x.level === level.id)) {
      const kind = areaKind(a)
      const pts = a.pts.map(site)
      areas.push({ name: a.name.trim() || 'Outdoor area', pts })
      // A slab or a deck is a floor of its own; a driveway or a garden lies on the ground.
      if (kind === 'slab' || kind === 'deck') floors.push({ pts, holes: [], rl: rl + (a.top ?? 0) })
    }
    const rooms: WalkRoom[] = []
    for (const r of plan.rooms.filter(x => x.level === level.id)) {
      const shape = roomShape(r, faces)
      if (!shape) continue
      rooms.push({ id: r.id, name: roomName(r), pts: shape.inner.map(site), area: shape.area, at: site(r.at) })
    }
    // Doors in the outside walls, and the way in: the side with a room or the house behind it.
    const doors: WalkLevel['doors'] = []
    const outlinesSite = outlines.map(o => o.map(site))
    for (const w of walls.filter(x => x.kind === 'external')) {
      const d = wallDir(w)
      const n: Vec2 = [-d[1], d[0]]
      for (const o of plan.openings.filter(x => x.wall === w.id && x.kind === 'door')) {
        const mid: Vec2 = [w.a[0] + d[0] * o.offset, w.a[1] + d[1] * o.offset]
        const probe = (side: number) => site(add(mid, scale(n, side * (w.thickness / 2 + 0.3))))
        const inHouse = (side: number) => rooms.some(r => inside(probe(side), r.pts)) || outlinesSite.some(ol => inside(probe(side), ol))
        const left = inHouse(1)
        const right = inHouse(-1)
        if (left === right) continue
        doors.push({ at: site(mid), inward: turn(scale(n, left ? 1 : -1)) })
      }
    }
    if (i === 0) {
      // Retaining walls stand on the ground outside.
      const rWalls = plan.walls.filter(w => isRetaining(w))
      for (const p of wallPolygons(rWalls).values()) solids.push(solid(p.map(site)))
    }
    levels.push({ id: level.id, name: level.name, rl, height: level.height, solids, floors, rooms, areas, outlines: outlinesSite, outside: i === 0, doors })
  })
  return { levels, ground, boundary }
}

/** The floor's RL under a point on a level, or null where there is nothing to stand on. */
export function floorAt(map: WalkMap, li: number, p: Vec2): number | null {
  const level = map.levels[li]
  if (!level) return null
  let best: number | null = null
  for (const f of level.floors) {
    if (!inside(p, f.pts) || f.holes.some(h => inside(p, h))) continue
    // On a deck over the ground, stand on the higher of the two.
    if (best === null || f.rl > best) best = f.rl
  }
  if (best !== null) return best
  if (!level.outside) return null
  if (map.boundary && map.boundary.length >= 3 && !inside(p, map.boundary)) return null
  return map.ground ? map.ground(p) : level.rl
}

/** The nearest point on a polygon's edges to p, and how far it is. */
function nearestEdge(p: Vec2, pts: Vec2[]): { at: Vec2; dist: number } {
  let best: Vec2 = pts[0]
  let bestD = Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const ab = sub(b, a)
    const l2 = ab[0] * ab[0] + ab[1] * ab[1]
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2))
    const q = add(a, scale(ab, t))
    const d = len(sub(p, q))
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  return { at: best, dist: bestD }
}

const nearBox = (p: Vec2, s: WalkSolid, r: number) => p[0] > s.box[0] - r && p[0] < s.box[2] + r && p[1] > s.box[1] - r && p[1] < s.box[3] + r

/** Whether a person `r` round, standing at p, would be in a wall. */
export function collides(level: WalkLevel, p: Vec2, r = RADIUS): boolean {
  for (const s of level.solids) {
    if (!nearBox(p, s, r)) continue
    if (inside(p, s.pts) || nearestEdge(p, s.pts).dist < r - 1e-6) return true
  }
  return false
}

/** Slide a point out of the walls it touches: along a wall rather than through it. */
function pushOut(level: WalkLevel, p: Vec2, r: number): Vec2 {
  let q = p
  for (let k = 0; k < 4; k++) {
    let moved = false
    for (const s of level.solids) {
      if (!nearBox(q, s, r)) continue
      const e = nearestEdge(q, s.pts)
      const into = inside(q, s.pts)
      if (!into && e.dist >= r) continue
      if (e.dist < 1e-9) continue
      const away = into ? scale(sub(e.at, q), 1 / e.dist) : scale(sub(q, e.at), 1 / e.dist)
      q = add(e.at, scale(away, r + 1e-4))
      moved = true
    }
    if (!moved) break
  }
  return q
}

/** One short stride, sliding along a wall it meets; where it can't go, it stays. */
function stride(map: WalkMap, li: number, p: Vec2, d: Vec2, r: number): Vec2 {
  const level = map.levels[li]
  const h = floorAt(map, li, p)
  for (const c of [d, [d[0], 0] as Vec2, [0, d[1]] as Vec2]) {
    if (len(c) < 1e-9) continue
    const q = pushOut(level, add(p, c), r)
    // A push that throws you further than the stride went through a corner: not that way.
    if (len(sub(q, p)) > len(d) * 1.5 + 0.02) continue
    if (collides(level, q, r)) continue
    const hq = floorAt(map, li, q)
    if (hq === null || (h !== null && Math.abs(hq - h) > STEP_MAX)) continue
    return q
  }
  return p
}

/** Walk from a point by a move on a level: walls stop and slide you, doors let you through, and you never step off a floor. */
export function moveBy(map: WalkMap, li: number, from: Vec2, delta: Vec2, r = RADIUS): Vec2 {
  if (!map.levels[li]) return from
  const n = Math.max(1, Math.ceil(len(delta) / STRIDE))
  const step = scale(delta, 1 / n)
  let p = from
  for (let i = 0; i < n; i++) p = stride(map, li, p, step, r)
  return p
}

/** How far you could walk from p in a direction before a wall or the floor's edge stops you (m, up to `most`). */
export function clearAhead(map: WalkMap, li: number, p: Vec2, heading: number, most = 12): number {
  const level = map.levels[li]
  const d: Vec2 = [Math.cos(heading), Math.sin(heading)]
  const h = floorAt(map, li, p)
  for (let t = 0.1; t <= most; t += 0.1) {
    const q = add(p, scale(d, t))
    const hq = floorAt(map, li, q)
    if (collides(level, q, 0.05) || hq === null || (h !== null && Math.abs(hq - h) > STEP_MAX)) return t - 0.1
  }
  return most
}

/** The way with the most room in front, from p: 24 directions tried. */
export function openestHeading(map: WalkMap, li: number, p: Vec2): number {
  let best = 0
  let bestD = -1
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2
    const d = clearAhead(map, li, p, a)
    if (d > bestD + 1e-6) {
      bestD = d
      best = a
    }
  }
  return best
}

/** A free place to stand at or near p (the room's own point may sit close to a wall), or null. */
function freeNear(map: WalkMap, li: number, p: Vec2): Vec2 | null {
  const level = map.levels[li]
  const ok = (q: Vec2) => !collides(level, q) && floorAt(map, li, q) !== null
  if (ok(p)) return p
  for (let rad = 0.2; rad <= 1.5; rad += 0.2)
    for (let k = 0; k < 12; k++) {
      const q = add(p, [Math.cos((k / 12) * Math.PI * 2) * rad, Math.sin((k / 12) * Math.PI * 2) * rad])
      if (ok(q)) return q
    }
  return null
}

/** In a room: step back to its far side, looking across it the way with most room. */
function lookAcross(map: WalkMap, li: number, p: Vec2): Spot {
  const heading = openestHeading(map, li, p)
  const back = clearAhead(map, li, p, heading + Math.PI, 6)
  const at = moveBy(map, li, p, scale([Math.cos(heading + Math.PI), Math.sin(heading + Math.PI)], Math.max(0, back - 0.5)))
  return { level: li, at, heading }
}

function roomSpot(map: WalkMap, li: number, room: WalkRoom): Spot | null {
  const c = centroid(room.pts)
  const p = freeNear(map, li, inside(c, room.pts) ? c : room.at)
  return p ? lookAcross(map, li, p) : null
}

/** Where a level starts when nothing else says: its largest room, or the middle of the house. */
function levelStart(map: WalkMap, li: number): Spot | null {
  const level = map.levels[li]
  if (!level) return null
  const rooms = [...level.rooms].sort((a, b) => b.area - a.area)
  for (const r of rooms) {
    const s = roomSpot(map, li, r)
    if (s) return s
  }
  const big = [...level.outlines].sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0]
  const p = big ? freeNear(map, li, centroid(big)) : null
  return p ? lookAcross(map, li, p) : null
}

/**
 * Where the walk starts: in the room asked for; else just inside the front door (the outside door
 * that faces the street most, `street` being its bearing in degrees from north), looking in; else
 * in the largest room on the lowest level. Null when there is no house to walk in.
 */
export function startSpot(map: WalkMap, opts: { room?: string | null; street?: number } = {}): Spot | null {
  if (opts.room) {
    for (let li = 0; li < map.levels.length; li++) {
      const r = map.levels[li].rooms.find(x => x.id === opts.room)
      const s = r && roomSpot(map, li, r)
      if (s) return s
    }
  }
  const low = map.levels[0]
  if (!low) return null
  if (low.doors.length) {
    const street = opts.street
    const out = (d: { inward: Vec2 }) => (street === undefined ? 0 : -(d.inward[0] * Math.sin((street * Math.PI) / 180) + d.inward[1] * Math.cos((street * Math.PI) / 180)))
    const doors = [...low.doors].sort((a, b) => out(b) - out(a))
    for (const d of doors) {
      for (const k of [1.2, 0.9, 0.6]) {
        const p = add(d.at, scale(d.inward, k))
        if (!collides(low, p) && floorAt(map, 0, p) !== null) return { level: 0, at: p, heading: Math.atan2(d.inward[1], d.inward[0]) }
      }
    }
  }
  return levelStart(map, 0)
}

/** The level above (+1) or below (−1) from where you stand: the same place if it has a floor there, else that level's start. */
export function changeLevel(map: WalkMap, from: Spot, dir: 1 | -1): Spot | null {
  const li = from.level + dir
  const level = map.levels[li]
  if (!level) return null
  const h = floorAt(map, li, from.at)
  // The same spot, if it's indoors there (not the yard under an upper floor).
  if (h !== null && level.floors.some(f => inside(from.at, f.pts)) && !collides(level, from.at)) return { level: li, at: from.at, heading: from.heading }
  return levelStart(map, li)
}

/** Where you are, for the readout: the room, the outdoor area, Outside, or null (somewhere with no name). */
export function placeAt(map: WalkMap, li: number, p: Vec2): string | null {
  const level = map.levels[li]
  if (!level) return null
  let best: WalkRoom | null = null
  for (const r of level.rooms) if (inside(p, r.pts) && (!best || r.area < best.area)) best = r
  if (best) return best.name
  const area = level.areas.find(a => inside(p, a.pts))
  if (area) return area.name
  if (level.floors.some(f => inside(p, f.pts))) return null
  return level.outside ? 'Outside' : null
}

/** "Ground floor · Kitchen", as the panel shows it and a screen reader says it. */
export function placeWords(map: WalkMap, li: number, p: Vec2): string {
  const level = map.levels[li]
  if (!level) return ''
  const place = placeAt(map, li, p)
  return place ? `${level.name} · ${place}` : level.name
}

/** The eye's RL standing at p. */
export function eyeRL(map: WalkMap, li: number, p: Vec2): number {
  return (floorAt(map, li, p) ?? map.levels[li]?.rl ?? 0) + EYE
}

/** The walking speeds the wheel steps through (m/s), and the one it starts at. */
export const SPEEDS = [0.7, 1.4, 2.8] as const
export const START_SPEED = 1
