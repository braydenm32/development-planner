import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { garageFloor } from '../../plan/__tests__/fixtures'
import type { Plan, Wall } from '../../plan/model'
import { buildWalkMap, changeLevel, collides, EYE, eyeRL, floorAt, moveBy, placeAt, placeWords, startSpot } from '../walk'

// The fixtures' placement puts the house frame 5 m east of the origin (e 1005, n 1000).
const ORIGIN: Vec2 = [1000, 1000]
const site = (p: Vec2): Vec2 => [p[0] + 5, p[1]]

/** garageFloor with a first floor on top: one box over the study end, with a door in its east wall that opens onto nothing. */
function twoStoreys(): Plan {
  const p = garageFloor()
  const L = 'level_up'
  const w = (id: string, a: Vec2, b: Vec2): Wall => ({ id, level: L, a, b, thickness: 0.27, kind: 'external' })
  return {
    ...p,
    levels: [...p.levels, { id: L, name: 'First floor', elevation: 3, height: 2.6 }],
    walls: [...p.walls, w('u0', [5.45, 0.15], [9.95, 0.15]), w('u1', [9.95, 0.15], [9.95, 4.3]), w('u2', [9.95, 4.3], [5.45, 4.3]), w('u3', [5.45, 4.3], [5.45, 0.15])],
    openings: [...p.openings, { id: 'up_door', wall: 'u1', kind: 'door', offset: 2, width: 0.82, height: 2.04, sill: 0, flipHinge: false, flipSwing: false }],
    rooms: [...p.rooms, { id: 'r_up', level: L, name: 'Bedroom', at: [7.7, 2.2] }],
  }
}

describe('walking through a made-up house', () => {
  const map = buildWalkMap(garageFloor(), ORIGIN)

  it('stops at a wall, a little short of it', () => {
    // From the entry hall east, into the east wall (centre x 9.95, 300 mm thick).
    const to = moveBy(map, 0, site([9.0, 9.0]), [5, 0])
    expect(to[0]).toBeLessThan(site([9.8, 0])[0])
    expect(to[0]).toBeGreaterThan(site([9.4, 0])[0])
    expect(to[1]).toBeCloseTo(9.0, 5)
  })

  it('slides along a wall met at an angle rather than stopping dead', () => {
    const to = moveBy(map, 0, site([9.0, 9.0]), [3, 1])
    expect(to[1]).toBeGreaterThan(9.9)
  })

  it('goes through a door and out to the yard on the lowest level', () => {
    // The entry door is in the north wall at x 9.05.
    const to = moveBy(map, 0, site([9.05, 12.5]), [0, 3])
    expect(to[1]).toBeGreaterThan(15)
    expect(placeAt(map, 0, to)).toBe('Outside')
  })

  it("doesn't go through a window: its sill stops you", () => {
    // The study's window is in the east wall at y 1.5.
    const to = moveBy(map, 0, site([7.7, 1.5]), [5, 0])
    expect(to[0]).toBeLessThan(site([9.8, 0])[0])
  })

  it('goes through an opening, and not through a garage door, which is drawn shut', () => {
    const from = site([4.0, 9.0])
    expect(moveBy(map, 0, from, [0, 3])[1]).toBeGreaterThan(11)
    const shut = garageFloor()
    shut.openings = shut.openings.map(o => (o.id === 'garage_door' ? { ...o, kind: 'garage' } : o))
    expect(moveBy(buildWalkMap(shut, ORIGIN), 0, from, [0, 3])[1]).toBeLessThan(10.5)
  })

  it('stops at the block boundary outside', () => {
    const b = buildWalkMap(garageFloor(), ORIGIN, undefined, [site([-2, -2]), site([14, -2]), site([14, 20]), site([-2, 20])])
    const to = moveBy(b, 0, site([9.05, 12.5]), [0, 20])
    expect(to[1]).toBeLessThan(20)
    expect(to[1]).toBeGreaterThan(19.5)
  })

  it('never ends up in a wall or off a floor, however it wanders, the house turned on the block', () => {
    const turned = garageFloor()
    turned.placement = { ...turned.placement, rotation: 37 }
    const m = buildWalkMap(turned, ORIGIN, undefined, [
      [-30, -30],
      [30, -30],
      [30, 30],
      [-30, 30],
    ])
    let p = startSpot(m)!.at
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
    for (let i = 0; i < 400; i++) {
      p = moveBy(m, 0, p, [rand() * 0.6, rand() * 0.6])
      expect(collides(m.levels[0], p, 0.24)).toBe(false)
      expect(floorAt(m, 0, p)).not.toBeNull()
    }
  })

  it('follows the ground outside, and keeps the eye 1.6 m above the floor', () => {
    const sloped = buildWalkMap(garageFloor(), ORIGIN, p => 83 + p[1] * 0.01)
    expect(eyeRL(sloped, 0, site([9.0, 9.0]))).toBeCloseTo(84 + EYE, 6)
    expect(eyeRL(sloped, 0, site([9.05, 15]))).toBeCloseTo(83.15 + EYE, 6)
  })

  it("doesn't step down a drop bigger than a few steps", () => {
    const high = buildWalkMap(garageFloor(), ORIGIN, () => 82)
    const to = moveBy(high, 0, site([9.05, 12.5]), [0, 3])
    expect(to[1]).toBeLessThan(14.2)
  })
})

describe('where the walk starts', () => {
  it('starts in the room asked for', () => {
    const map = buildWalkMap(garageFloor(), ORIGIN)
    const s = startSpot(map, { room: 'r4' })!
    expect(placeAt(map, s.level, s.at)).toBe('Study')
  })

  it('starts just inside the front door, looking in', () => {
    const map = buildWalkMap(garageFloor(), ORIGIN)
    const s = startSpot(map, { street: 0 })!
    expect(s.level).toBe(0)
    expect(s.at[0]).toBeCloseTo(site([9.05, 0])[0], 5)
    expect(s.at[1]).toBeCloseTo(13.85 - 1.2, 5)
    // Looking south, into the house.
    expect(Math.sin(s.heading)).toBeCloseTo(-1, 5)
    expect(placeWords(map, s.level, s.at)).toBe('Ground floor · Entry')
  })

  it('with no outside door, starts in the largest room on the lowest level, looking across it', () => {
    const p = garageFloor()
    p.openings = p.openings.filter(o => o.id !== 'entry')
    const map = buildWalkMap(p, ORIGIN)
    const s = startSpot(map)!
    expect(placeAt(map, s.level, s.at)).toBe('Garage')
    expect(collides(map.levels[0], s.at)).toBe(false)
  })

  it('has nowhere to start with no house', () => {
    const p = garageFloor()
    p.walls = []
    expect(startSpot(buildWalkMap(p, ORIGIN))).toBeNull()
  })
})

describe('upper floors and going up and down', () => {
  const map = buildWalkMap(twoStoreys(), ORIGIN)

  it("can't walk out of a door on an upper floor with nothing outside it", () => {
    const to = moveBy(map, 1, site([7.7, 2.15]), [5, 0])
    expect(to[0]).toBeLessThan(site([10.2, 0])[0])
    expect(floorAt(map, 1, to)).toBe(84 + 3)
  })

  it('goes up to the same spot when the floor above is over it, and down again', () => {
    const at = site([7.7, 1.6])
    const up = changeLevel(map, { level: 0, at, heading: 0 }, 1)!
    expect(up.level).toBe(1)
    expect(up.at).toEqual(at)
    expect(placeWords(map, 1, up.at)).toBe('First floor · Bedroom')
    const down = changeLevel(map, up, -1)!
    expect(down.level).toBe(0)
    expect(changeLevel(map, down, -1)).toBeNull()
    expect(changeLevel(map, up, 1)).toBeNull()
  })

  it('going up from where there is no floor above starts in a room up there', () => {
    const up = changeLevel(map, { level: 0, at: site([4, 7.5]), heading: 0 }, 1)!
    expect(placeAt(map, 1, up.at)).toBe('Bedroom')
  })

  it("doesn't stand in a stair's hole on the floor it comes up to", () => {
    const p = twoStoreys()
    p.stairs = [{ id: 'st', level: 'level_ground', at: [6.3, 0.6], angle: 90, width: 0.9, base: 0, rise: 3, going: 0.25, shape: 'straight', turn: 'left', toLevel: 'level_up' }]
    const m = buildWalkMap(p, ORIGIN)
    expect(floorAt(m, 1, site([6.3, 2]))).toBeNull()
    expect(floorAt(m, 1, site([8.5, 2]))).toBe(87)
  })
})
