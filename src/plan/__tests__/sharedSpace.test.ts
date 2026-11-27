// Two room labels in one enclosed space: the second is flagged, and the space is counted once in
// every total. A made-up box only.

import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { levelSummaries, roomsTotal, sameSpaceAs } from '../keyNumbers'
import { emptyPlan, type Plan, type Wall } from '../model'
import { addRoom } from '../ops'
import { designQuantities } from '../quantities'

const L = 'level_ground'
const wall = (id: string, a: Vec2, b: Vec2, thickness = 0.27): Wall => ({ id, level: L, a, b, thickness, kind: thickness > 0.15 ? 'external' : 'internal' })

/** A 10 × 8 m box of 270 mm walls. */
function box(): Plan {
  return {
    ...emptyPlan({ e: 0, n: 0, rotation: 0, ffl: 80 }),
    walls: [wall('s', [0, 0], [10, 0]), wall('e', [10, 0], [10, 8]), wall('n', [10, 8], [0, 8]), wall('w', [0, 8], [0, 0])],
  }
}

describe('two room labels in one space (DB-04)', () => {
  /** The box split down the middle, a room each side; `split` false leaves the wall out. */
  function twoRooms(split: boolean): Plan {
    let p = box()
    if (split) p = { ...p, walls: [...p.walls, wall('mid', [5, 0], [5, 8], 0.11)] }
    p = addRoom(p, L, [2.5, 4], 'Living')
    return addRoom(p, L, [7.5, 4], 'Bed 1')
  }

  it('each room has its own area while a wall divides them', () => {
    const p = twoRooms(true)
    const s = levelSummaries(p)[0]
    expect(s.rooms.every(r => !r.sameAs)).toBe(true)
    expect(roomsTotal(s.rooms)).toBeLessThan(s.gross.area)
    expect(sameSpaceAs(p, p.rooms[1])).toBeNull()
  })

  it('with the wall gone the second label is flagged and the space is counted once', () => {
    const p = twoRooms(false)
    const s = levelSummaries(p)[0]
    expect(s.rooms[0].sameAs).toBeUndefined()
    expect(s.rooms[1].sameAs?.name).toBe('Living')
    // Both read the one space's area, and the total is that area once: under the floor area.
    expect(s.rooms[1].area).toBeCloseTo(s.rooms[0].area!, 9)
    expect(roomsTotal(s.rooms)).toBeCloseTo(s.rooms[0].area!, 9)
    expect(roomsTotal(s.rooms)).toBeLessThan(s.gross.area)
    expect(sameSpaceAs(p, p.rooms[1])?.name).toBe('Living')
    expect(sameSpaceAs(p, p.rooms[0])).toBeNull()
  })

  it('floor finishes count the shared space once too', () => {
    const p = twoRooms(false)
    const merged = designQuantities(p, null, [])
    expect(merged.finishes.count).toBe(1)
    expect(merged.finishes.area).toBeCloseTo(levelSummaries(p)[0].rooms[0].area!, 6)
  })
})
