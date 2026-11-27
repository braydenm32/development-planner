// The plan as lists, and adding to it by typing (AX-02): every wall, door, window, stair and
// piece of furniture has a row that picks it, and a wall, an opening and a piece of furniture can
// be added without a click on the plan.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FurnitureOnPlan, WallsDoorsBody } from '../../a11y/PlanLists'
import { doorWindowSchedule } from '../../export/schedule'
import { DOOR_DEFAULT, wallLength } from '../model'
import { addFurniture } from '../ops'
import { newFurniture } from '../furniture'
import { addFurnitureIn, addOpeningAt, addWallFrom, furnitureRows, headingAngle, openingRows, stairRows, wallEndFrom, wallEndOf, wallRows } from '../planLists'
import { garageFloor, splitLevels } from './fixtures'

const L = 'level_ground'
const EXTERNAL = { kind: 'external' as const, thickness: 0.27 }

describe('the lists', () => {
  it('have a row for every house wall on the level, named by its side and the rooms beside it', () => {
    const plan = garageFloor()
    const rows = wallRows(plan, L)
    expect(rows.map(r => r.id)).toEqual(plan.walls.map(w => w.id))
    const row = (id: string) => rows.find(r => r.id === id)!
    expect(row('south')).toMatchObject({ name: 'External wall', kind: 'wall', where: 'south side · Study', detail: '4500 mm', sel: { type: 'wall', id: 'south' } })
    expect(row('garage_w')).toMatchObject({ name: 'External wall', where: 'west side · Garage', detail: '6300 mm' })
    expect(row('hall_w').name).toBe('Internal wall')
    expect(row('hall_w').where).toContain('Entry')
    expect(row('hall_w').where).toContain('Garage')
    expect(row('south').pts).toEqual([plan.walls.find(w => w.id === 'south')!.a, plan.walls.find(w => w.id === 'south')!.b])
  })

  it('leave retaining walls to Earthworks, and other levels to their own list', () => {
    const plan = garageFloor()
    plan.walls.push({ id: 'rw', level: L, a: [20, 0], b: [20, 5], thickness: 0.2, kind: 'retaining' })
    expect(wallRows(plan, L).some(r => r.id === 'rw')).toBe(false)
    expect(wallRows(splitLevels(), 'level_mid').map(r => r.id)).toEqual(['mid_0', 'mid_1', 'mid_2', 'mid_3'])
  })

  it('name doors and windows with the schedule’s marks, so D1 here is D1 there', () => {
    const plan = garageFloor()
    const rows = openingRows(plan, L)
    const schedule = doorWindowSchedule(plan)
    expect(rows.map(r => r.name)).toEqual(schedule.map(s => `${s.type} ${s.id}`))
    expect(rows.map(r => r.id).sort()).toEqual(plan.openings.map(o => o.id).sort())
    const entry = rows.find(r => r.id === 'entry')!
    expect(entry).toMatchObject({ name: 'Door D1', kind: 'door', detail: '920 × 2040 mm', sel: { type: 'opening', id: 'entry' } })
    expect(rows.find(r => r.id === 'office_door')!.where).toBe('Laundry / Study')
  })

  it('list stairs with where they go, and furniture with the room it is in', () => {
    expect(stairRows(splitLevels(), 'level_low')).toMatchObject([{ id: 'stair_up', name: 'Stair', where: 'up to Middle level', detail: 'Straight · 900 mm wide' }])
    expect(stairRows(splitLevels(), 'level_top')).toEqual([])
    const sofa = newFurniture('sofa-3', L, [4, 7.5])!
    const rows = furnitureRows(addFurniture(garageFloor(), sofa), L)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: sofa.id, kind: 'piece', where: 'in Garage', sel: { type: 'furniture', id: sofa.id } })
    expect(rows[0].name.length).toBeGreaterThan(0)
  })

  it('render as lists of buttons that say whether each is picked', () => {
    const html = renderToStaticMarkup(<WallsDoorsBody plan={garageFloor()} />)
    expect(html).toContain('<h3>Walls (10)</h3>')
    expect(html).toContain('<h3>Doors and windows (5)</h3>')
    expect(html).toContain('<h3>Stairs (0)</h3>')
    expect(html).toMatch(/<ul class="pick-list plan-rows" aria-label="Walls">/)
    expect(html).toMatch(/<ul class="pick-list plan-rows" aria-label="Doors and windows">/)
    expect([...html.matchAll(/<button class="" aria-pressed="false" data-row="[^"]+">/g)]).toHaveLength(15)
    // A space between the name and the size, so they aren't read as one word.
    expect(html).toMatch(/Study<\/span><\/span> <span class="muted">4500 mm<\/span>/)
    expect(html).toContain('aria-expanded="false">Add a wall by typing…</button>')
    expect(html).toContain('aria-expanded="false">Add a door or window by typing…</button>')
    expect(html).toContain('No stairs on this level.')
  })

  it('offer the chosen piece of furniture to a room, and list what is there', () => {
    const html = renderToStaticMarkup(<FurnitureOnPlan plan={garageFloor()} />)
    expect(html).toMatch(/<button type="button" class="secondary">Add queen bed to Garage<\/button>/)
    expect(html).toContain('<h3>Furniture on this level (0)</h3>')
    expect(html).toContain('No furniture on this level yet.')
  })
})

describe('adding a wall by typing', () => {
  it('turns left, right or carries straight on from the wall it starts on', () => {
    expect(headingAngle('straight', [1, 0])).toBeCloseTo(0)
    expect(headingAngle('left', [1, 0])).toBeCloseTo(90)
    expect(headingAngle('right', [1, 0])).toBeCloseTo(270)
    expect(headingAngle('left', [0, 1])).toBeCloseTo(180)
    expect(headingAngle('right', [0, -1])).toBeCloseTo(180)
    expect(headingAngle(-90, null)).toBe(270)
    expect(headingAngle(450, [0, 1])).toBe(90)
  })

  it('starts from either end of a wall, running the way that end points', () => {
    const w = { a: [0, 0] as [number, number], b: [4, 0] as [number, number] }
    expect(wallEndOf(w, 'b')).toEqual({ at: [4, 0], running: [1, 0] })
    expect(wallEndOf(w, 'a')).toEqual({ at: [0, 0], running: [-1, -0] })
  })

  it('ends to the millimetre, so four typed sides close a room', () => {
    let at: [number, number] = [1, 1]
    for (const [len, deg] of [[8.4, 0], [6.3, 90], [8.4, 180], [6.3, 270]] as const) at = wallEndFrom(at, len, deg)
    expect(at).toEqual([1, 1])
    expect(wallEndFrom([0, 0], 1, 45)).toEqual([0.707, 0.707])
  })

  it('adds one wall, as the Wall tool would have drawn it', () => {
    const plan = garageFloor()
    // Out from the house’s south-east corner, heading east.
    const out = addWallFrom(plan, L, [9.95, 0.15], 3, 0, EXTERNAL)
    expect(out.id).not.toBeNull()
    expect(out.plan.walls).toHaveLength(plan.walls.length + 1)
    const made = out.plan.walls.at(-1)!
    expect(made).toMatchObject({ id: out.id, level: L, a: [9.95, 0.15], b: [12.95, 0.15], kind: 'external', thickness: 0.27 })
    expect(wallLength(made)).toBeCloseTo(3)
    // Inside the house the same tool draws an internal wall.
    const inside = addWallFrom(plan, L, [1, 6], 2, 0, EXTERNAL)
    expect(inside.plan.walls.at(-1)).toMatchObject({ kind: 'internal' })
  })

  it('adds nothing on top of a wall already there, or with no length, and says why', () => {
    const plan = garageFloor()
    const dup = addWallFrom(plan, L, [5.45, 0.15], 2, 0, EXTERNAL)
    expect(dup).toMatchObject({ id: null, why: 'There’s already a wall there, so no new one was added.' })
    expect(dup.plan).toBe(plan)
    expect(addWallFrom(plan, L, [0, 0], 0, 0, EXTERNAL)).toMatchObject({ id: null, why: 'A wall needs a length of 50 mm or more.' })
  })
})

describe('adding a door, a window or furniture by typing', () => {
  it('puts an opening at the distance typed, at the tool’s size', () => {
    const plan = garageFloor()
    const out = addOpeningAt(plan, 'south', 'door', 2, DOOR_DEFAULT)
    expect(out.id).not.toBeNull()
    expect(out.plan.openings.at(-1)).toMatchObject({ id: out.id, wall: 'south', kind: 'door', offset: 2, width: DOOR_DEFAULT.width, height: DOOR_DEFAULT.height, sill: 0 })
  })

  it('keeps it clear of the wall’s ends, and refuses a wall with no room', () => {
    const plan = garageFloor()
    const near = addOpeningAt(plan, 'south', 'door', 0, DOOR_DEFAULT)
    const o = near.plan.openings.at(-1)!
    expect(o.offset - o.width / 2).toBeGreaterThan(0)
    expect(addOpeningAt(plan, 'nowhere', 'door', 1, DOOR_DEFAULT)).toMatchObject({ id: null, why: 'Pick a wall first.' })
    const stub = { ...plan, walls: [...plan.walls, { id: 'stub', level: L, a: [30, 0] as [number, number], b: [30.2, 0] as [number, number], thickness: 0.11, kind: 'internal' as const }] }
    expect(addOpeningAt(stub, 'stub', 'door', 0.1, DOOR_DEFAULT).id).toBeNull()
  })

  it('puts a piece of furniture inside the room chosen, on its level', () => {
    const plan = garageFloor()
    const out = addFurnitureIn(plan, 'r1', 'bed-queen', 90)
    expect(out.id).not.toBeNull()
    const f = out.plan.furniture.at(-1)!
    expect(f).toMatchObject({ id: out.id, level: L, kind: 'bed-queen', rotation: 90 })
    expect(furnitureRows(out.plan, L)[0].where).toBe('in Garage')
    expect(addFurnitureIn(plan, 'nope', 'bed-queen')).toMatchObject({ id: null, why: 'Pick a room first.' })
    expect(addFurnitureIn(plan, 'r1', 'no-such-piece').id).toBeNull()
  })
})
