// What a cost estimate counts in a design, against sums done by hand on a made-up house: a
// 12 × 9 m box (walls on their centrelines, 300 mm outside, 110 mm inside) split into a living
// room on piers, a bathroom and a garage, with a small upper floor, outdoor areas and roofs.

import { describe, expect, it } from 'vitest'
import type { Area, Opening, Plan, Roof, Wall } from '../model'
import { estimate } from '../../costs/estimate'
import { emptyCosts } from '../../costs/model'
import { designQuantities, isGarageRoom, openingArea, wetRoomOf } from '../quantities'
import { splitLevels } from './fixtures'
import type { RetainingProfile } from '../retaining'

const G = 'ground'
const U = 'upper'
const wall = (id: string, a: [number, number], b: [number, number], thickness: number, level = G): Wall => ({ id, level, a, b, thickness, kind: thickness >= 0.2 ? 'external' : 'internal' })
const opening = (id: string, wallId: string, kind: Opening['kind'], offset: number, width: number, height: number, sill = 0): Opening => ({
  id,
  wall: wallId,
  kind,
  offset,
  width,
  height,
  sill,
  flipHinge: false,
  flipSwing: false,
})
const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]
const area = (id: string, name: string, pts: [number, number][], kind?: Area['kind']): Area => ({ id, level: G, name, pts, ...(kind ? { kind } : {}) })

/** The ground floor only. */
function house(): Plan {
  return {
    version: 1,
    levels: [{ id: G, name: 'Ground floor', elevation: 0, height: 2.7, floorType: 'slab' }],
    walls: [
      wall('s', [0, 0], [12, 0], 0.3),
      wall('e', [12, 0], [12, 9], 0.3),
      wall('n', [12, 9], [0, 9], 0.3),
      wall('w', [0, 9], [0, 0], 0.3),
      wall('mid', [5, 0], [5, 9], 0.11),
      wall('bath', [5, 4], [12, 4], 0.11),
    ],
    openings: [
      // 1.8 × 1.2 in the south wall
      opening('win1', 's', 'window', 2.5, 1.8, 1.2, 0.9),
      // 1.2 wide, 1.5 high from a 1.5 sill: only 1.2 of it is below the 2.7 m ceiling
      opening('win2', 'e', 'window', 2, 1.2, 1.5, 1.5),
      opening('front', 'n', 'door', 2.5, 0.92, 2.04),
      opening('garage', 'e', 'garage', 6.5, 2.4, 2.1),
      opening('inner', 'mid', 'door', 2, 0.82, 2.04),
      // an opening (no door) inside: neither a window nor a door, and not in an outside wall
      opening('gap', 'bath', 'opening', 2, 1, 2.1),
    ],
    rooms: [
      { id: 'living', level: G, name: 'Living', at: [2.5, 4.5], foundation: 'piers' },
      { id: 'bath', level: G, name: 'Ensuite', at: [8, 2] },
      { id: 'garage', level: G, name: 'Double garage', at: [8, 6.5] },
    ],
    areas: [
      area('deck', 'Deck', rect(0, 10, 4, 13), 'deck'),
      area('drive', 'Driveway', rect(13, 0, 16, 10), 'driveway'),
      area('patio', 'Patio', rect(-3, 0, -1, 2.5)),
      area('lawn', 'Lawn', rect(-8, 0, -3, 6), 'garden'),
    ],
    roofs: [],
    stairs: [],
    furniture: [],
    placement: { e: 1000, n: 1000, rotation: 0, ffl: 50 },
  }
}

const hip = (id: string, pts: [number, number][], pitch: number, overhang: number): Roof => ({ id, level: G, pts, type: 'hip', pitch, overhang, gables: pts.map(() => false), lowEdge: 0 })

/** A retaining wall's measurements, as Earthworks › Retaining walls works them out. */
const profile = (id: string, thickness: number, length: number, faceArea: number, maxHeight: number): RetainingProfile => ({
  wall: { id, level: G, a: [0, -5], b: [length, -5], thickness, kind: 'retaining' },
  length,
  samples: [],
  maxHeight,
  faceArea,
  top: [0, 0],
  high: 'left',
})

describe('designQuantities on one floor', () => {
  const q = designQuantities(house(), null, [])

  it('takes the floor area to the outside of the walls, as the strip does', () => {
    // (12 + 0.3) × (9 + 0.3)
    expect(q.floorArea).toBeCloseTo(12.3 * 9.3, 6)
    expect(q.floorArea).toBeCloseTo(114.39, 6)
    expect(q.ground).toMatchObject({ level: G, name: 'Ground floor' })
    expect(q.ground!.area).toBeCloseTo(114.39, 6)
    expect(q.upper).toEqual({ area: 0, names: [] })
  })

  it('splits the floor by how it is built: the living room on piers to the outside of its walls, the rest a slab', () => {
    // Living: x from −0.15 to 5 + 0.055, y from −0.15 to 9.15
    const piers = (5.15 + 0.055) * 9.3
    expect(piers).toBeCloseTo(48.4065, 9)
    const parts = Object.fromEntries(q.ground!.parts.map(p => [p.type, p.area]))
    expect(Object.keys(parts).sort()).toEqual(['piers', 'slab'])
    expect(parts.piers).toBeCloseTo(48.4065, 6)
    expect(parts.slab).toBeCloseTo(114.39 - 48.4065, 6)
    expect(parts.slab).toBeCloseTo(65.9835, 6)
  })

  it('measures the outside walls: the outline’s perimeter times the ceiling height, less what opens in them', () => {
    expect(q.walls.perimeter).toBeCloseTo(2 * (12.3 + 9.3), 6)
    expect(q.walls.perimeter).toBeCloseTo(43.2, 6)
    expect(q.walls.gross).toBeCloseTo(43.2 * 2.7, 6)
    expect(q.walls.gross).toBeCloseTo(116.64, 6)
    // window 1.8 × 1.2, window 1.2 × (2.7 − 1.5), front door 0.92 × 2.04, garage door 2.4 × 2.1
    const openings = 1.8 * 1.2 + 1.2 * 1.2 + 0.92 * 2.04 + 2.4 * 2.1
    expect(openings).toBeCloseTo(10.5168, 9)
    expect(q.walls.openings).toBeCloseTo(10.5168, 6)
    expect(q.walls.net).toBeCloseTo(116.64 - 10.5168, 6)
    expect(q.walls.net).toBeCloseTo(106.1232, 6)
    expect([...q.walls.ids].sort()).toEqual(['e', 'n', 's', 'w'])
  })

  it('counts the windows and doors, inside and out', () => {
    expect(q.windows).toMatchObject({ count: 2, ids: ['win1', 'win2'] })
    expect(q.windows.area).toBeCloseTo(2.16 + 1.44, 6)
    expect(q.externalDoors).toMatchObject({ count: 1, ids: ['front'] })
    expect(q.externalDoors.area).toBeCloseTo(1.8768, 6)
    expect(q.internalDoors).toMatchObject({ count: 1, ids: ['inner'] })
    expect(q.internalDoors.area).toBeCloseTo(0.82 * 2.04, 6)
    expect(q.garageDoors).toMatchObject({ count: 1, ids: ['garage'], sizes: [[2.4, 2.1]] })
  })

  it('counts the part of an opening that fits under the ceiling', () => {
    expect(openingArea({ width: 1.2, height: 1.5, sill: 1.5 }, 2.7)).toBeCloseTo(1.44, 9)
    expect(openingArea({ width: 1, height: 2, sill: 3 }, 2.7)).toBe(0)
    expect(openingArea({ width: 0.92, height: 2.04, sill: 0 }, 2.7)).toBeCloseTo(1.8768, 9)
  })

  it('finishes the floors of the rooms but the garage, inside their walls', () => {
    // Living 4.795 × 8.7, Ensuite 6.795 × 3.795; the garage 6.795 × 4.795 is left bare
    expect(q.finishes.count).toBe(2)
    expect(q.finishes.ids).toEqual(['living', 'bath'])
    expect(q.finishes.area).toBeCloseTo(4.795 * 8.7 + 6.795 * 3.795, 6)
    expect(q.finishes.area).toBeCloseTo(67.503525, 6)
  })

  it('finds the wet rooms by name', () => {
    expect(q.wet.bathroom).toMatchObject({ count: 1, ids: ['bath'], names: ['Ensuite'] })
    expect(q.wet.bathroom.area).toBeCloseTo(25.787025, 6)
    for (const k of ['kitchen', 'laundry', 'toilet'] as const) expect(q.wet[k].count, k).toBe(0)
  })

  it('measures the outdoor areas by kind, an area with no kind being a slab', () => {
    expect(q.outdoor.deck).toMatchObject({ count: 1, area: 12, ids: ['deck'], names: ['Deck'] })
    expect(q.outdoor.driveway).toMatchObject({ count: 1, area: 30, ids: ['drive'] })
    expect(q.outdoor.slab).toMatchObject({ count: 1, area: 5, ids: ['patio'], names: ['Patio'] })
    expect(q.outdoor.garden).toMatchObject({ count: 1, area: 30, ids: ['lawn'] })
  })

  it('has no roof, stairs, earthworks or retaining walls until they are drawn', () => {
    expect(q.roofs).toMatchObject({ count: 0, area: 0, ids: [], first: null })
    expect(q.stairs).toMatchObject({ count: 0, ids: [] })
    expect(q.earth).toBeNull()
    expect(q.retaining.sleeper.count + q.retaining.block.count).toBe(0)
  })
})

describe('designQuantities with more drawn', () => {
  function bigger(): Plan {
    const p = house()
    p.levels.push({ id: U, name: 'Upstairs', elevation: 3, height: 2.4 })
    p.walls.push(
      wall('us', [0, 0], [4, 0], 0.2, U),
      wall('ue', [4, 0], [4, 4], 0.2, U),
      wall('un', [4, 4], [0, 4], 0.2, U),
      wall('uw', [0, 4], [0, 0], 0.2, U),
    )
    p.openings.push(opening('uwin', 'us', 'window', 2, 1, 1, 1))
    p.rooms.push({ id: 'study', level: U, name: 'Study and WC', at: [2, 2] })
    p.roofs = [
      // over the outside of the ground floor walls, with 450 mm eaves, at 22.5°
      hip('roof1', rect(-0.15, -0.15, 12.15, 9.15), 22.5, 0.45),
      // two points make no roof: it is left out
      hip('broken', [
        [0, 0],
        [1, 0],
      ], 20, 0.45),
    ]
    p.stairs = [{ id: 'st1', level: G, at: [1, 1], angle: 90, width: 1, base: 0, rise: 3, going: 0.25, shape: 'straight', turn: 'left' } as Plan['stairs'][number]]
    return p
  }
  const retaining = [profile('rw1', 0.15, 6, 7.2, 1.4), profile('rw2', 0.15, 3, 2.1, 0.8), profile('rw3', 0.2, 4, 4.4, 1.2)]
  const q = designQuantities(bigger(), { cut: 120.5, fill: 80.25 }, retaining)

  it('adds the upper floor to the floor area and frames it', () => {
    // upstairs: (4 + 0.2) × (4 + 0.2)
    expect(q.upper.names).toEqual(['Upstairs'])
    expect(q.upper.area).toBeCloseTo(17.64, 6)
    expect(q.floorArea).toBeCloseTo(114.39 + 17.64, 6)
    // the ground floor alone is what sits on the ground
    expect(q.ground!.area).toBeCloseTo(114.39, 6)
  })

  it('measures each floor’s outside walls at its own height', () => {
    expect(q.walls.perimeter).toBeCloseTo(43.2 + 16.8, 6)
    expect(q.walls.gross).toBeCloseTo(116.64 + 16.8 * 2.4, 6)
    expect(q.walls.openings).toBeCloseTo(10.5168 + 1, 6)
    expect(q.windows.count).toBe(3)
  })

  it('counts a room by the first wet room its name fits', () => {
    expect(q.wet.toilet).toMatchObject({ count: 1, names: ['Study and WC'] })
    expect(q.finishes.count).toBe(3)
  })

  it('takes the roof’s sloping area from its geometry, eaves and all, and skips a roof that doesn’t build', () => {
    const plan = (12.3 + 0.9) * (9.3 + 0.9)
    expect(q.roofs.count).toBe(1)
    expect(q.roofs.ids).toEqual(['roof1'])
    expect(q.roofs.first?.id).toBe('roof1')
    expect(q.roofs.area).toBeCloseTo(plan / Math.cos((22.5 * Math.PI) / 180), 3)
  })

  it('counts the stairs', () => {
    expect(q.stairs).toMatchObject({ count: 1, ids: ['st1'] })
  })

  it('passes the earthworks’ cut and fill through, with what is left over', () => {
    expect(q.earth).toEqual({ cut: 120.5, fill: 80.25, net: 40.25 })
  })

  it('splits the retaining walls into sleeper walls and block walls by thickness', () => {
    expect(q.retaining.sleeper).toMatchObject({ count: 2, ids: ['rw1', 'rw2'], length: 9, maxHeight: 1.4 })
    expect(q.retaining.sleeper.area).toBeCloseTo(9.3, 9)
    expect(q.retaining.block).toMatchObject({ count: 1, ids: ['rw3'], length: 4, area: 4.4, maxHeight: 1.2 })
  })
})

describe('room names', () => {
  it('finds wet rooms the way people name them', () => {
    expect(wetRoomOf('Kitchen / dining')).toBe('kitchen')
    expect(wetRoomOf('Main bathroom')).toBe('bathroom')
    expect(wetRoomOf('Ensuite')).toBe('bathroom')
    expect(wetRoomOf('En-suite 2')).toBe('bathroom')
    expect(wetRoomOf('Laundry and WC')).toBe('laundry')
    expect(wetRoomOf('Powder room')).toBe('toilet')
    expect(wetRoomOf('WC')).toBe('toilet')
    expect(wetRoomOf('Bedroom 2')).toBeNull()
    expect(wetRoomOf('Showroom')).toBeNull()
  })

  it('leaves garages and carports without a floor finish', () => {
    expect(isGarageRoom('Double garage')).toBe(true)
    expect(isGarageRoom('Carport')).toBe(true)
    expect(isGarageRoom('Garden room')).toBe(false)
  })
})

describe('designQuantities on a split level', () => {
  // The made-up split level: three 8 x 6 m boxes to the outside of 270 mm walls (8.27 x 6.27 m),
  // the middle level's floor an 8 x 6 m slab area poured on the ground under its rooms.
  const gross = 8.27 * 6.27

  it('counts a slab under an upper level once, as its floor, and not as an outdoor slab or a framed floor', () => {
    const q = designQuantities(splitLevels(), null, [])
    // The slab covers most of the middle level, so its whole floor is slab, to the outside of its walls.
    expect(q.slabUnder.area).toBeCloseTo(gross, 9)
    expect(q.slabUnder.ids).toEqual(['mid_slab'])
    expect(q.slabUnder.names).toEqual(['Middle level'])
    expect(q.slabUnder.areas).toEqual(['Middle slab'])
    expect(q.outdoor.slab.count).toBe(0)
    expect(q.outdoor.slab.area).toBe(0)
    // Only the top level is framed.
    expect(q.upper.area).toBeCloseTo(gross, 9)
    expect(q.upper.names).toEqual(['Top level'])
    // The floor area itself is the same, every level counted once.
    expect(q.floorArea).toBeCloseTo(3 * gross, 9)
  })

  it('frames the rest of a level whose slab covers only part of it', () => {
    const p = splitLevels()
    const half = { ...p.areas[0], pts: [[0, 6], [8, 6], [8, 9], [0, 9]] as [number, number][] }
    const q = designQuantities({ ...p, areas: [half] }, null, [])
    expect(q.slabUnder.area).toBeCloseTo(24, 9)
    expect(q.upper.area).toBeCloseTo(gross + gross - 24, 9)
    expect(q.upper.names).toEqual(['Middle level', 'Top level'])
    expect(q.outdoor.slab.count).toBe(0)
  })

  it('leaves a slab beside the house an outdoor slab', () => {
    const p = splitLevels()
    const patio = { ...p.areas[0], id: 'patio', name: 'Patio', pts: [[9, 0], [12, 0], [12, 4], [9, 4]] as [number, number][] }
    const q = designQuantities({ ...p, areas: [p.areas[0], patio] }, null, [])
    expect(q.outdoor.slab.ids).toEqual(['patio'])
    expect(q.slabUnder.ids).toEqual(['mid_slab'])
  })

  it('prices that slab once, as slab on ground', () => {
    const e = estimate(designQuantities(splitLevels(), null, []), emptyCosts())
    const under = e.lines.filter(l => l.id === 'floor-slab-under')
    expect(under).toHaveLength(1)
    expect(under[0].rateId).toBe('floor-slab')
    expect(under[0].qty).toBeCloseTo(gross, 9)
    expect(under[0].label).toBe('Slab on ground under the middle level')
    expect(under[0].from).toBe('Middle slab')
    expect(e.lines.some(l => l.id === 'outdoor-slab')).toBe(false)
    expect(e.lines.find(l => l.id === 'floor-upper')!.qty).toBeCloseTo(gross, 9)
  })
})
