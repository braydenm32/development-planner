// Gross floor area, defined once (HO-25, DB-16, DB-29): inside the outside walls, the walls
// between rooms included, less one garage space. Checked by hand on boxes.

import { describe, expect, it } from 'vitest'
import { GFA_CAR_SPACE, grossFloorArea, levelSummaries, roomsTotal } from '../keyNumbers'
import { normalizePlan, type Plan, type Wall } from '../model'
import { garageFloor } from './fixtures'

const L = 'level_ground'
const wall = (id: string, a: [number, number], b: [number, number], thickness = 0.2): Wall => ({ id, level: L, a, b, thickness, kind: 'external' })
const box = (x1: number, y1: number): Wall[] => [wall('s', [0, 0], [x1, 0]), wall('e', [x1, 0], [x1, y1]), wall('n', [x1, y1], [0, y1]), wall('w', [0, y1], [0, 0])]
const boxAt = (level: string, x0: number, x1: number): Wall[] =>
  ([[[x0, 0], [x1, 0]], [[x1, 0], [x1, 8]], [[x1, 8], [x0, 8]], [[x0, 8], [x0, 0]]] as [[number, number], [number, number]][]).map(([a, b], i) => ({ id: `${level}_${i}`, level, a, b, thickness: 0.27, kind: 'external' }))
const plan = (patch: Partial<Plan>): Plan =>
  normalizePlan({ version: 1, levels: [{ id: L, name: 'Ground floor', elevation: 0, height: 2.7 }], walls: [], openings: [], rooms: [], areas: [], roofs: [], stairs: [], furniture: [], placement: { e: 0, n: 0, rotation: 0, ffl: 10 }, ...patch })

describe('gross floor area', () => {
  it('is measured to the inside of the outside walls, walls between rooms included', () => {
    // A 10 × 8 m centreline box of 200 mm walls with one wall across it: outside 10.2 × 8.2, inside 9.8 × 7.8.
    const p = plan({ walls: [...box(10, 8), wall('mid', [4, 0], [4, 8], 0.1)], rooms: [{ id: 'a', level: L, name: 'Living', at: [7, 4] }, { id: 'b', level: L, name: 'Bedroom', at: [2, 4] }] })
    const f = grossFloorArea(p)
    expect(f.outside).toBeCloseTo(10.2 * 8.2, 6)
    expect(f.inside).toBeCloseTo(9.8 * 7.8, 6)
    // The rooms alone are less by the inner wall's footprint (0.1 × 7.8 m).
    const rooms = levelSummaries(p)[0].rooms.reduce((t, r) => t + (r.area ?? 0), 0)
    expect(f.inside - rooms).toBeCloseTo(0.1 * 7.8, 6)
    expect(f.garages).toBe(0)
    expect(f.gfa).toBeCloseTo(f.inside, 9)
  })

  it('leaves out one car space of a garage, by its type or its name, and no more', () => {
    const walls = [...box(10, 8), wall('mid', [4, 0], [4, 8])]
    // A 3.8 × 7.8 m garage is 29.64 m² inside its walls: one space of 18 m² comes off.
    const typed = grossFloorArea(plan({ walls, rooms: [{ id: 'a', level: L, name: 'Living', at: [7, 4] }, { id: 'b', level: L, name: 'Shed', type: 'garage', at: [2, 4] }] }))
    expect(typed.garages).toBeCloseTo(3.8 * 7.8, 6)
    expect(typed.carSpace).toBe(GFA_CAR_SPACE)
    expect(typed.gfa).toBeCloseTo(9.8 * 7.8 - 18, 6)
    const named = grossFloorArea(plan({ walls, rooms: [{ id: 'b', level: L, name: 'Carport', at: [2, 4] }] }))
    expect(named.gfa).toBeCloseTo(typed.gfa, 9)
    // A small carport comes off whole.
    const small = grossFloorArea(plan({ walls: [...box(10, 8), wall('mid', [2, 0], [2, 8])], rooms: [{ id: 'b', level: L, name: 'Carport', at: [1, 4] }] }))
    expect(small.carSpace).toBeCloseTo(1.8 * 7.8, 6)
    expect(small.gfa).toBeCloseTo(9.8 * 7.8 - 1.8 * 7.8, 6)
  })

  it('counts the wall between split levels as inside the house', () => {
    // 10 × 8 m and 4 × 8 m boxes of 270 mm walls sharing one wall line: together 14 × 8 m on centrelines.
    const split = plan({
      levels: [
        { id: L, name: 'Ground floor', elevation: 0, height: 2.7 },
        { id: 'level_split', name: 'Split level', elevation: 1.5, height: 2.7 },
      ],
      walls: [...boxAt(L, 0, 10), ...boxAt('level_split', -4, 0)],
    })
    const f = grossFloorArea(split)
    expect(f.outside).toBeCloseTo(14.27 * 8.27, 4)
    // Inside the outside walls is 13.73 × 7.73 m, the shared wall counted (to within its two ends, 0.15 m²).
    expect(Math.abs(f.inside - 13.73 * 7.73)).toBeLessThan(0.2)
    // Two separate boxes would lose the shared wall's 0.27 × 7.73 m twice over.
    expect(f.inside).toBeGreaterThan(9.73 * 7.73 + 3.73 * 7.73 + 2)
  })

  it('on the garage fixture sits between the rooms and the outside of the walls', () => {
    const p = garageFloor()
    const f = grossFloorArea(p)
    const rooms = levelSummaries(p).reduce((t, s) => t + s.rooms.reduce((a, r) => a + (r.sameAs ? 0 : (r.area ?? 0)), 0), 0)
    expect(f.inside).toBeLessThan(f.outside)
    expect(f.inside).toBeGreaterThanOrEqual(rooms - 1e-6)
    expect(f.gfa).toBeCloseTo(f.inside - Math.min(GFA_CAR_SPACE, f.garages), 9)
  })
})

describe('rooms total', () => {
  it('adds the rooms as they are shown, so levels add to the house (LD-27)', () => {
    // Two rooms of 35.214 and 35.214 m² show as 35.21 each: the total is 70.42, not 70.43.
    const rooms = [{ room: { id: 'a' }, area: 35.214 }, { room: { id: 'b' }, area: 35.214 }, { room: { id: 'c' }, area: 35.214, sameAs: { id: 'a' } }] as unknown as Parameters<typeof roomsTotal>[0]
    expect(roomsTotal(rooms)).toBe(70.42)
    const upper = [{ room: { id: 'd' }, area: 99.106 }] as unknown as Parameters<typeof roomsTotal>[0]
    expect((roomsTotal(rooms) + roomsTotal(upper)).toFixed(2)).toBe((70.42 + 99.11).toFixed(2))
  })
})
