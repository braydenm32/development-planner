import { describe, expect, it } from 'vitest'
import { emptyPlan, wallLength } from '../model'
import { addLevelAbove, addOpening, addWall, deleteSelection, moveJoint, moveWall, setWallLength } from '../ops'
import { snap } from '../snap'
import { garageFloor } from './fixtures'

const style = { kind: 'external' as const, thickness: 0.27 }
const placement = { e: 0, n: 0, rotation: 0, ffl: 80 }

describe('editing walls', () => {
  it('keeps joined walls joined when a corner moves', () => {
    let p = emptyPlan(placement)
    p = addWall(p, 'level_ground', [0, 0], [4, 0], style)
    p = addWall(p, 'level_ground', [4, 0], [4, 3], style)
    p = moveJoint(p, 'level_ground', [4, 0], [5, 0])
    expect(p.walls[0].b).toEqual([5, 0])
    expect(p.walls[1].a).toEqual([5, 0])
  })

  it('moves a wall and stretches the walls joined to it', () => {
    const start = garageFloor()
    const p = moveWall(start, 'garage_n', [0, 0.5], start)
    const west = p.walls.find(w => w.id === 'garage_w')!
    expect(west.b[1]).toBeCloseTo(11.05, 9)
    // the hallway wall it tees into is not changed
    expect(p.walls.find(w => w.id === 'hall_w')).toEqual(start.walls.find(w => w.id === 'hall_w'))
  })

  it('sets a wall length from its start point', () => {
    const p = setWallLength(garageFloor(), 'south', 5)
    expect(wallLength(p.walls.find(w => w.id === 'south')!)).toBeCloseTo(5, 9)
  })

  it('deletes a wall together with its doors and windows', () => {
    const p = deleteSelection(garageFloor(), { type: 'wall', id: 'east' })
    expect(p.openings.some(o => o.wall === 'east')).toBe(false)
  })

  it('keeps a new opening inside its wall', () => {
    const plan = garageFloor()
    const wall = plan.walls.find(w => w.id === 'hall_n')!
    const p = addOpening(plan, wall, 'door', 0, { width: 0.82, height: 2.04, sill: 0 })
    const o = p.openings.at(-1)!
    expect(o.offset).toBeCloseTo(0.41, 9)
  })

  it('starts a new level with a copy of the external walls below', () => {
    const { plan, id } = addLevelAbove(garageFloor())
    const level = plan.levels.find(l => l.id === id)!
    expect(level.elevation).toBeCloseTo(3.0, 9)
    const external = garageFloor().walls.filter(w => w.kind === 'external').length
    expect(plan.walls.filter(w => w.level === id).length).toBe(external)
  })
})

describe('snapping', () => {
  const walls = garageFloor().walls

  it('snaps to a nearby wall end', () => {
    expect(snap([0.17, 4.24], { walls, tol: 0.1 })).toMatchObject({ kind: 'end', p: [0.15, 4.25] })
  })

  it('locks to square angles from the previous point and stops on walls', () => {
    const r = snap([3.0, 6.02], { walls, anchor: [0.15, 6.0], tol: 0.1 })
    expect(r.kind).toBe('angle')
    expect(r.p[1]).toBeCloseTo(6.0, 9)
    const hit = snap([8.05, 6.05], { walls, anchor: [0.15, 6.0], tol: 0.1 })
    expect(hit.kind).toBe('wall')
    expect(hit.p[0]).toBeCloseTo(8.1, 9)
  })

  it('falls back to a 50 mm grid', () => {
    const r = snap([20.123, 30.987], { walls, tol: 0.1 })
    expect(r).toMatchObject({ kind: 'grid' })
    expect(r.p[0]).toBeCloseTo(20.1, 9)
    expect(r.p[1]).toBeCloseTo(31.0, 9)
  })

  it('does nothing when snapping is turned off', () => {
    expect(snap([0.17, 3.95], { walls, tol: 0.1, free: true }).p).toEqual([0.17, 3.95])
  })
})
