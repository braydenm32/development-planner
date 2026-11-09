// What the design has in it, measured for a cost estimate (Costs): floor areas, the outside
// walls less their openings, windows and doors, roofs, outdoor areas, cut and fill and the
// retaining walls. Every number the app already shows comes from the same helper that shows
// it (CALM 8): floor areas from levelSummaries, roof areas from roofGeometry, cut and fill
// from the earthworks result, retaining walls from their profiles. Only what nothing else
// measures yet (the outside walls' area, the openings, wet rooms) is worked out here.

import type { EarthworksResult } from '../lib/earthworks'
import { centroidOf, pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import { DEFAULT_FLOOR_TYPE, levelFloorType, roomFloorType, type FloorTypeId } from './floorTypes'
import { faceAround, offsetPolygon, planarFaces, type Face } from './geometry'
import { levelSummaries } from './keyNumbers'
import { areaKind, type AreaKind, type Opening, type Plan, type Roof } from './model'
import type { RetainingProfile } from './retaining'
import type { ImpliedTotals } from '../grading/implied'
import { roofGeometry } from './roof'

/** Rooms that need their own fit-out and plumbing, found by their names. */
export type WetRoom = 'kitchen' | 'bathroom' | 'laundry' | 'toilet'

export const WET_ROOMS: { id: WetRoom; label: string; plural: string; test: RegExp }[] = [
  { id: 'kitchen', label: 'kitchen', plural: 'kitchens', test: /kitchen/i },
  { id: 'bathroom', label: 'bathroom', plural: 'bathrooms', test: /bath|ensuite|en-suite|shower/i },
  { id: 'laundry', label: 'laundry', plural: 'laundries', test: /laundry/i },
  { id: 'toilet', label: 'toilet', plural: 'toilets', test: /\b(wc|toilet|powder)\b/i },
]

/** Which wet room a room is, by its name (the first that fits: "Laundry and WC" is a laundry); null for a dry room. */
export const wetRoomOf = (name: string): WetRoom | null => WET_ROOMS.find(w => w.test.test(name))?.id ?? null

/** Garages and carports have a bare concrete floor: no floor finish. */
export const isGarageRoom = (name: string) => /garage|carport/i.test(name)

/** Retaining walls thinner than this (the 150 mm sleeper preset) are sleeper walls; thicker ones (the 200 mm preset) are concrete block (m). */
export const SLEEPER_MAX_THICKNESS = 0.175

export interface Counted {
  count: number
  /** m², where the thing has one. */
  area: number
  /** What was counted, by id, to point out on the plan. */
  ids: string[]
}

export interface RetainingSet extends Counted {
  /** Total length (m). */
  length: number
  /** Most ground held back, ground to ground (m). */
  maxHeight: number
}

export interface DesignQuantities {
  /** Every level's floor area to the outside of its walls: the strip's Floor (levelSummaries). */
  floorArea: number
  /** The lowest level's floor, by how it is built (Design › Floors). Null before walls enclose it. */
  ground: { level: string; name: string; area: number; parts: { type: FloorTypeId; area: number }[] } | null
  /** Framed floors above the lowest: their floor areas, less any slab on ground under them (slabUnder). */
  upper: { area: number; names: string[] }
  /**
   * Concrete slab areas that sit under an upper level's rooms: on a split level that level's floor
   * is a slab on the ground, drawn as a slab area. Counted once here, as slab on ground, and taken
   * out of both the framed upper floors and the outdoor slabs. `names` are the levels they're
   * under, `areas` the slab areas' own names.
   */
  slabUnder: Counted & { names: string[]; areas: string[] }
  /** Rooms with a floor finish: every enclosed room except garages and carports (room areas, inside the walls). */
  finishes: Counted
  /** Rooms with a fit-out of their own, by kind, with their names. */
  wet: Record<WetRoom, Counted & { names: string[] }>
  /** The outside walls: the outline's perimeter times each level's height, less the openings in them (m, m²). */
  walls: { perimeter: number; gross: number; openings: number; net: number; ids: string[] }
  windows: Counted
  externalDoors: Counted
  internalDoors: Counted
  garageDoors: Counted & { sizes: [number, number][] }
  stairs: Counted
  /** Sloping roof area of every roof that builds (roofGeometry). */
  roofs: Counted & { first: Roof | null }
  /** Outdoor areas by kind: driveways, slabs, decks, gardens (their drawn areas). */
  outdoor: Record<AreaKind, Counted & { names: string[] }>
  /** Cut and fill (m³) from the earthworks; null when nothing is levelled. */
  earth: { cut: number; fill: number; net: number } | null
  /** Retaining walls, by how they are built. */
  retaining: { sleeper: RetainingSet; block: RetainingSet }
  /** Walls the earthworks imply but nobody has drawn: vertical edges of the cut and fill (src/grading/implied.ts). */
  impliedRetaining?: ImpliedTotals | null
}

/** The part of an opening that is in its wall: no higher than the wall (m²). */
export function openingArea(o: Pick<Opening, 'width' | 'height' | 'sill'>, wallHeight: number): number {
  return o.width * Math.max(0, Math.min(o.height, wallHeight - o.sill))
}

/** The ids of the walls on a level's outside: those along the outer faces of its walls. */
function outsideWallIds(faces: Face[]): Set<string> {
  const out = new Set<string>()
  for (const f of faces) if (f.area < 0) for (const w of f.walls) out.add(w)
  return out
}

const perimeter = (ring: Vec2[]) => ring.reduce((t, p, i) => t + Math.hypot(ring[(i + 1) % ring.length][0] - p[0], ring[(i + 1) % ring.length][1] - p[1]), 0)

const counted = (): Counted => ({ count: 0, area: 0, ids: [] })

/** Slab areas covering at least this share of an upper level's floor make all of it a slab on ground. */
const SLAB_LEVEL_SHARE = 0.8

/**
 * The lowest floor split by how each part is built: rooms whose own floor type differs from
 * their level's take their outline to the outside of their walls (as the earthworks leave the
 * ground natural under piers); the rest of the floor area is the level's own type.
 */
function groundParts(plan: Plan, levelId: string, gross: number): { type: FloorTypeId; area: number }[] {
  const own = levelFloorType(plan, levelId)
  const levelType: FloorTypeId = own === undefined || own === 'framed' ? DEFAULT_FLOOR_TYPE : own
  const faces = planarFaces(plan.walls.filter(w => w.level === levelId))
  const seen = new Set<Face>()
  const other = new Map<FloorTypeId, number>()
  for (const r of plan.rooms) {
    if (r.level !== levelId) continue
    const t = roomFloorType(plan, r)
    if (t === 'framed' || t === levelType) continue
    const f = faceAround(r.at, faces)
    if (!f || seen.has(f)) continue
    seen.add(f)
    const ring = offsetPolygon(
      f.pts,
      f.thickness.map(th => -th / 2),
    )
    other.set(t, (other.get(t) ?? 0) + Math.abs(signedArea(ring)))
  }
  const rest = Math.max(0, gross - [...other.values()].reduce((a, b) => a + b, 0))
  return [{ type: levelType, area: rest }, ...[...other].map(([type, area]) => ({ type, area }))].filter(p => p.area > 1e-9)
}

/**
 * Everything a cost estimate counts in the design. `earth` is the earthworks result when there
 * is something levelled (as the strip's cut and fill); `retaining` the retaining walls' profiles
 * against the finished ground (as Earthworks › Retaining walls measures them).
 */
export function designQuantities(
  plan: Plan,
  earth: Pick<EarthworksResult, 'cut' | 'fill'> | null,
  retaining: RetainingProfile[],
  implied: ImpliedTotals | null = null,
): DesignQuantities {
  const summaries = levelSummaries(plan)
  const lowest = summaries[0]

  const floorArea = summaries.reduce((t, s) => t + s.gross.area, 0)
  const ground = lowest && lowest.gross.area > 0 ? { level: lowest.level.id, name: lowest.level.name, area: lowest.gross.area, parts: groundParts(plan, lowest.level.id, lowest.gross.area) } : null
  const uppers = summaries.slice(1).filter(s => s.gross.area > 0)

  // A slab area under an upper level's outline is that level's floor, poured on the ground (a
  // split level's usual way), not an outdoor slab and not a framed floor. The fuller answer is a
  // floor type for each level.
  const slabUnder = { ...counted(), names: [] as string[], areas: [] as string[] }
  const claimed = new Set<string>()
  const upperParts: { name: string; area: number }[] = []
  for (const s of uppers) {
    let covered = 0
    for (const a of plan.areas) {
      if (areaKind(a) !== 'slab' || claimed.has(a.id) || a.pts.length < 3) continue
      const c = centroidOf(a.pts)
      if (!s.gross.outlines.some(o => pointInPolygon(c[0], c[1], o))) continue
      claimed.add(a.id)
      covered += Math.abs(signedArea(a.pts))
      slabUnder.count++
      slabUnder.ids.push(a.id)
      slabUnder.areas.push(a.name)
    }
    if (covered <= 0) {
      upperParts.push({ name: s.level.name, area: s.gross.area })
      continue
    }
    slabUnder.names.push(s.level.name)
    // A slab drawn inside the walls leaves a strip under them: when it covers most of the level,
    // the whole floor is slab, measured to the outside of the walls as the lowest floor is.
    const whole = covered >= SLAB_LEVEL_SHARE * s.gross.area
    slabUnder.area += whole ? s.gross.area : covered
    upperParts.push({ name: s.level.name, area: whole ? 0 : Math.max(0, s.gross.area - covered) })
  }
  const framed = upperParts.filter(u => u.area > 0.01)
  const upper = { area: framed.reduce((t, u) => t + u.area, 0), names: framed.map(u => u.name) }

  const finishes = counted()
  const wet = Object.fromEntries(WET_ROOMS.map(w => [w.id, { ...counted(), names: [] as string[] }])) as DesignQuantities['wet']
  for (const s of summaries)
    for (const r of s.rooms) {
      if (r.area === null) continue
      if (!isGarageRoom(r.room.name)) {
        finishes.count++
        finishes.area += r.area
        finishes.ids.push(r.room.id)
      }
      const kind = wetRoomOf(r.room.name)
      if (kind) {
        wet[kind].count++
        wet[kind].area += r.area
        wet[kind].ids.push(r.room.id)
        wet[kind].names.push(r.room.name)
      }
    }

  // The outside walls and the openings in them, level by level.
  const walls = { perimeter: 0, gross: 0, openings: 0, net: 0, ids: [] as string[] }
  const windows = counted()
  const externalDoors = counted()
  const internalDoors = counted()
  const garageDoors = { ...counted(), sizes: [] as [number, number][] }
  for (const s of summaries) {
    const height = s.level.height
    const run = s.gross.outlines.reduce((t, ring) => t + perimeter(ring), 0)
    walls.perimeter += run
    walls.gross += run * height
    const levelWalls = plan.walls.filter(w => w.level === s.level.id)
    const outside = outsideWallIds(planarFaces(levelWalls))
    walls.ids.push(...outside)
    for (const o of plan.openings) {
      const w = levelWalls.find(x => x.id === o.wall)
      if (!w) continue
      const a = openingArea(o, height)
      const out = outside.has(w.id)
      if (out) walls.openings += a
      const add = (c: Counted) => {
        c.count++
        c.area += a
        c.ids.push(o.id)
      }
      if (o.kind === 'window') add(windows)
      else if (o.kind === 'garage') {
        add(garageDoors)
        garageDoors.sizes.push([o.width, o.height])
      } else if (o.kind === 'door') add(out ? externalDoors : internalDoors)
    }
  }
  walls.net = Math.max(0, walls.gross - walls.openings)

  const stairs = { count: plan.stairs.length, area: 0, ids: plan.stairs.map(s => s.id) }

  const roofs = { ...counted(), first: null as Roof | null }
  for (const r of plan.roofs) {
    const g = roofGeometry(r)
    if (g.error) continue
    roofs.count++
    roofs.area += g.area
    roofs.ids.push(r.id)
    roofs.first ??= r
  }

  const outdoor = Object.fromEntries((['slab', 'driveway', 'deck', 'garden'] as AreaKind[]).map(k => [k, { ...counted(), names: [] as string[] }])) as DesignQuantities['outdoor']
  for (const s of summaries)
    for (const a of s.areas) {
      if (claimed.has(a.area.id)) continue
      const c = outdoor[areaKind(a.area)]
      c.count++
      c.area += a.size
      c.ids.push(a.area.id)
      c.names.push(a.area.name)
    }

  const set = (): RetainingSet => ({ ...counted(), length: 0, maxHeight: 0 })
  const retain = { sleeper: set(), block: set() }
  for (const p of retaining) {
    const c = p.wall.thickness < SLEEPER_MAX_THICKNESS ? retain.sleeper : retain.block
    c.count++
    c.area += p.faceArea
    c.length += p.length
    c.maxHeight = Math.max(c.maxHeight, p.maxHeight)
    c.ids.push(p.wall.id)
  }

  return {
    floorArea,
    ground,
    upper,
    slabUnder,
    finishes,
    wet,
    walls,
    windows,
    externalDoors,
    internalDoors,
    garageDoors,
    stairs,
    roofs,
    outdoor,
    earth: earth ? { cut: earth.cut, fill: earth.fill, net: earth.cut - earth.fill } : null,
    retaining: retain,
    impliedRetaining: implied,
  }
}
