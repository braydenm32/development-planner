// A small way to write a starter house down as a readable description, and to turn that into an
// ordinary plan (src/plan/model.ts). Each level is its outside walls' corners, its inside walls as
// runs of points, its rooms by type and a point inside each, and its doors and windows by a point
// on the wall they sit in. Measurements are wall centrelines in metres, in the house's own frame:
// x across the front, y back from the street, (0, 0) at the front left corner.
//
// Nothing here is special to starters once built: the plan is plain data like any drawn by hand.

import type { Vec2 } from '../lib/geom'
import { catalogItem } from '../plan/furnitureCatalog'
import { closestOnSegment } from '../plan/geometry'
import type { OpeningStyle } from '../plan/openingStyles'
import { ROOM_TYPES, type RoomTypeId } from '../plan/roomTypes'
import type { Furniture, Level, Opening, OpeningKind, Plan, Roof, Room, Stair, Wall } from '../plan/model'

/** Brick veneer outside, stud inside: the app's usual presets (src/plan/model.ts WALL_PRESETS). */
export const EXT = 0.27
export const INT = 0.11

export interface OpeningSpec {
  kind: OpeningKind
  /** A point on the centreline of the wall it sits in, at the opening's middle. */
  at: Vec2
  width: number
  height: number
  sill: number
  style?: OpeningStyle
  flipHinge?: boolean
  flipSwing?: boolean
}

type Extra = Partial<Pick<OpeningSpec, 'height' | 'sill' | 'style' | 'flipHinge' | 'flipSwing'>>

/** A hinged door, 820 mm unless said. */
export const door = (x: number, y: number, width = 0.82, extra: Extra = {}): OpeningSpec => ({ kind: 'door', at: [x, y], width, height: 2.04, sill: 0, ...extra })
/** The front door: 920 mm. */
export const frontDoor = (x: number, y: number) => door(x, y, 0.92)
/** A glass sliding door out to the yard. */
export const slider = (x: number, y: number, width = 2.4) => door(x, y, width, { style: 'sliding', height: 2.1 })
/** A sliding window, 1200 high at a 900 sill unless said. */
export const win = (x: number, y: number, width = 1.2, extra: Extra = {}): OpeningSpec => ({ kind: 'window', at: [x, y], width, height: 1.2, sill: 0.9, style: 'sliding', ...extra })
/** A small high window for a bathroom, laundry or toilet. */
export const highWin = (x: number, y: number, width = 0.9) => win(x, y, width, { height: 0.9, sill: 1.2, style: 'awning' })
/** A cased opening with no door, from one space into the next. */
export const gap = (x: number, y: number, width = 1.2) => ({ kind: 'opening' as const, at: [x, y] as Vec2, width, height: 2.1, sill: 0 })
/** A garage door: 4.8 m for a double, 2.7 m for a single. */
export const garageDoor = (x: number, y: number, width = 4.8): OpeningSpec => ({ kind: 'garage', at: [x, y], width, height: 2.1, sill: 0 })

export interface LevelSpec {
  name: string
  /** Above the lowest level's floor (m). */
  elevation?: number
  /** Floor to ceiling (m). */
  height?: number
  floor: 'slab' | 'framed'
  /** The outside walls' centreline corners, anticlockwise from the front left. */
  outline: Vec2[]
  /** Inside walls, each a run of straight walls through its points. */
  inside: Vec2[][]
  rooms: { type: RoomTypeId; at: Vec2; name?: string }[]
  openings: OpeningSpec[]
  /** A hip roof over this level's outside walls. */
  roof?: boolean
  /** A few pieces from the furniture catalog: [kind, middle, turn in degrees]. */
  furniture?: [string, Vec2, number][]
}

export interface StairSpec {
  /** The levels it joins, by their place in `levels`. */
  from: number
  to: number
  /** The middle of the bottom step's front edge. */
  at: Vec2
  /** Which way it climbs, degrees anticlockwise from x. */
  angle: number
  width?: number
  going?: number
}

export interface StarterSpec {
  id: string
  name: string
  /** One line on who it suits. */
  blurb: string
  levels: LevelSpec[]
  stairs?: StairSpec[]
}

/** A rectangle's corners, anticlockwise from the front left: w across, d back. */
export const rect = (w: number, d: number, x0 = 0, y0 = 0): Vec2[] => [
  [x0, y0],
  [x0 + w, y0],
  [x0 + w, y0 + d],
  [x0, y0 + d],
]

const TOL = 1e-6
const levelId = (spec: StarterSpec, i: number) => (i === 0 ? 'level_ground' : `level_${spec.id}_${i + 1}`)

/** The ordinary plan a starter describes, at the origin, before it's put on a block. Throws when the description doesn't hang together. */
export function buildStarter(spec: StarterSpec): Plan {
  const levels: Level[] = []
  const walls: Wall[] = []
  const openings: Opening[] = []
  const rooms: Room[] = []
  const roofs: Roof[] = []
  const furniture: Furniture[] = []
  const id = (kind: string, n: number, li: number) => `${spec.id}_${li + 1}_${kind}${n}`

  spec.levels.forEach((l, li) => {
    const level = levelId(spec, li)
    levels.push({ id: level, name: l.name, elevation: l.elevation ?? 0, height: l.height ?? 2.7, floorType: l.floor })
    const mine: Wall[] = []
    l.outline.forEach((a, i) => mine.push({ id: id('w', mine.length + 1, li), level, a, b: l.outline[(i + 1) % l.outline.length], thickness: EXT, kind: 'external' }))
    for (const run of l.inside) for (let i = 1; i < run.length; i++) mine.push({ id: id('w', mine.length + 1, li), level, a: run[i - 1], b: run[i], thickness: INT, kind: 'internal' })
    walls.push(...mine)

    l.openings.forEach((o, i) => {
      // The one wall whose run the point is on, away from its ends.
      const on = mine.filter(w => {
        const c = closestOnSegment(o.at, w.a, w.b)
        return c.dist < TOL && c.t > TOL && c.t < 1 - TOL
      })
      if (on.length !== 1) throw new Error(`${spec.id}, ${l.name}: ${on.length ? 'more than one wall' : 'no wall'} at ${o.at.join(', ')}`)
      const w = on[0]
      openings.push({
        id: id('o', i + 1, li),
        wall: w.id,
        kind: o.kind,
        offset: Math.round(Math.hypot(o.at[0] - w.a[0], o.at[1] - w.a[1]) * 1e4) / 1e4,
        width: o.width,
        height: o.height,
        sill: o.sill,
        flipHinge: !!o.flipHinge,
        flipSwing: !!o.flipSwing,
        ...(o.style ? { style: o.style } : {}),
      })
    })

    // Rooms take their type's name, numbered from 2 after the first of the type ("Main bedroom", "Bedroom 2").
    l.rooms.forEach((r, i) => {
      const n = rooms.filter(x => x.type === r.type).length + 1
      const base = ROOM_TYPES.find(t => t.id === r.type)!.name
      rooms.push({ id: id('r', i + 1, li), level, name: r.name ?? (n === 1 ? base : `${base} ${n}`), at: r.at, type: r.type })
    })

    if (l.roof) {
      const xs = l.outline.map(p => p[0])
      const ys = l.outline.map(p => p[1])
      const h = EXT / 2
      const [x0, x1, y0, y1] = [Math.min(...xs) - h, Math.max(...xs) + h, Math.min(...ys) - h, Math.max(...ys) + h]
      roofs.push({ id: id('roof', 1, li), level, pts: rect(x1 - x0, y1 - y0, x0, y0), type: 'hip', pitch: 22.5, overhang: 0.45, gables: [false, false, false, false], lowEdge: 0, plateLift: 0 })
    }

    ;(l.furniture ?? []).forEach(([kind, at, rotation], i) => {
      const item = catalogItem(kind)
      if (!item) throw new Error(`${spec.id}: no furniture called ${kind}`)
      const [width, depth, height] = item.size
      furniture.push({ id: id('f', i + 1, li), level, kind, at, rotation, width, depth, height })
    })
  })

  const stairs: Stair[] = (spec.stairs ?? []).map((s, i) => {
    const from = levels[s.from]
    const to = levels[s.to]
    return {
      id: `${spec.id}_stair${i + 1}`,
      level: from.id,
      at: s.at,
      angle: s.angle,
      width: s.width ?? 1,
      base: 0,
      rise: Math.round((to.elevation - from.elevation) * 1e6) / 1e6,
      toLevel: to.id,
      going: s.going ?? 0.25,
      shape: 'straight',
      turn: 'left',
    }
  })

  return {
    version: 1,
    levels,
    walls,
    openings,
    rooms,
    areas: [],
    roofs,
    stairs,
    furniture,
    notes: [],
    placement: { e: 0, n: 0, rotation: 0, ffl: 0 },
    floorsByLevel: true,
  }
}
