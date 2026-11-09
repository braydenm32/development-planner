import { describe, expect, it } from 'vitest'
import { pointInPolygon, signedArea } from '../../lib/geom'
import { FLOOR_STRUCTURE, normalizePlan, SLAB_THICKNESS, type Plan, type Wall } from '../model'
import { addArea, addRoof, updateRoom } from '../ops'
import { earthworksPlatforms, housePadRL, pierOutlines, retainingBenches, sideRL } from '../platforms'
import { parsePlanFile } from '../store'
import { garageFloor } from './fixtures'

const origin: [number, number] = [1000, 1000]

describe('levelled ground for the house', () => {
  it('levels under the slab and the outdoor slab', () => {
    const plan = garageFloor()
    const ps = earthworksPlatforms(plan, origin)
    expect(ps).toHaveLength(2)
    expect(ps[0].level).toBeCloseTo(84 - FLOOR_STRUCTURE, 9)
    expect(ps[0].fill).toBe(true)
    // the open area in front of the garage is an older area, so a slab at floor level
    expect(ps[1].level).toBeCloseTo(84 - SLAB_THICKNESS, 9)
  })

  it('leaves driveways and decks alone', () => {
    const plan: Plan = { ...garageFloor(), areas: [] }
    const p = addArea(addArea(plan, 'level_ground', [[0, 20], [5, 20], [5, 25]], 'Drive', 'driveway'), 'level_ground', [[0, 30], [5, 30], [5, 35]], 'Deck', 'deck')
    expect(earthworksPlatforms(p, origin)).toHaveLength(1)
  })

  it('only cuts under rooms on piers, with room underneath', () => {
    const plan = updateRoom(garageFloor(), 'r2', { foundation: 'piers' })
    const rings = pierOutlines(plan)
    expect(rings).toHaveLength(1)
    // the hallway out to the outside of its walls
    expect(pointInPolygon(8.2, 8.5, rings[0])).toBe(true)
    expect(Math.abs(signedArea(rings[0]))).toBeGreaterThan(12.98)
    const ps = earthworksPlatforms(plan, origin)
    const piers = ps.find(p => !p.fill)!
    expect(piers.level).toBeCloseTo(84 - FLOOR_STRUCTURE - 0.4, 9)
    expect(ps[0].exclude).toHaveLength(1)
  })
})

describe('saved plans', () => {
  it('fills in roofs, stairs and areas missing from older files', () => {
    const old = { ...garageFloor() } as Partial<Plan>
    delete old.roofs
    delete old.stairs
    const p = parsePlanFile(JSON.stringify(old))
    expect(p.roofs).toEqual([])
    expect(p.stairs).toEqual([])
    expect(normalizePlan(p)).toEqual(p)
  })

  it('keeps a roof through export and import', () => {
    const plan = addRoof(garageFloor(), 'level_ground', [[0, 0], [10, 0], [10, 4], [0, 4]], { type: 'gable', pitch: 25, overhang: 0.45 })
    const back = parsePlanFile(JSON.stringify(plan))
    expect(back.roofs[0]).toMatchObject({ type: 'gable', pitch: 25, gables: [false, true, false, true], lowEdge: 0 })
  })
})

describe('a wall beside an upper split level', () => {
  it('is levelled to that level’s pad, not the lowest one’s', () => {
    const plan = garageFloor()
    const upper = { id: 'upper', name: 'Upper level', elevation: 1.5, height: 2.7 }
    const two: Plan = { ...plan, levels: [...plan.levels, upper] }
    const w: Wall = { id: 'rs', level: 'upper', a: [5.6, -1.1], b: [9.8, -1.1], thickness: 0.2, kind: 'retaining', retain: { high: 'left', lowLevel: 'pad', lowBench: 1 } }
    expect(housePadRL(two, 'upper')).toBeCloseTo(84 + 1.5 - FLOOR_STRUCTURE, 9)
    expect(housePadRL(two)).toBeCloseTo(84 - FLOOR_STRUCTURE, 9)
    expect(sideRL(two, 'pad', 'upper')).toBeCloseTo(84 + 1.5 - FLOOR_STRUCTURE, 9)
    // A level that isn't there falls back to the lowest floor's pad.
    expect(sideRL(two, 'pad', 'gone')).toBeCloseTo(84 - FLOOR_STRUCTURE, 9)
    const bench = retainingBenches({ ...two, walls: [...two.walls, w] }, [0, 0]).find(p => p.id?.endsWith(':right'))!
    expect(bench.level).toBeCloseTo(84 + 1.5 - FLOOR_STRUCTURE, 9)
  })
})
