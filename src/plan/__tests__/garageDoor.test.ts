import { describe, expect, it } from 'vitest'
import { GARAGE_PANEL, garageDoorSymbol, garagePanelFootprint } from '../garageDoor'
import { emptyPlan, GARAGE_DOOR_DEFAULT, OPENING_NAMES } from '../model'
import { addOpening, addWall } from '../ops'
import { isOpeningTool, OPENING_TOOLS, usePlan } from '../store'

const style = { kind: 'external' as const, thickness: 0.27 }

describe('garage door', () => {
  it('starts 4.8 m wide and 2.1 m high, on the floor', () => {
    expect(GARAGE_DOOR_DEFAULT).toEqual({ width: 4.8, height: 2.1, sill: 0 })
    expect(usePlan.getState().openingDefaults.garage).toEqual(GARAGE_DOOR_DEFAULT)
    expect(OPENING_NAMES.garage).toBe('Garage door')
    expect(OPENING_TOOLS).toContain('garage')
    expect(isOpeningTool('garage')).toBe(true)
    expect(isOpeningTool('roof')).toBe(false)
  })

  it('goes in a wall like any opening, with no sill', () => {
    let p = emptyPlan({ e: 0, n: 0, rotation: 0, ffl: 80 })
    p = addWall(p, 'level_ground', [0, 0], [6, 0], style)
    p = addOpening(p, p.walls[0], 'garage', 3, { ...GARAGE_DOOR_DEFAULT, sill: 0.9 })
    expect(p.openings).toHaveLength(1)
    expect(p.openings[0]).toMatchObject({ kind: 'garage', width: 4.8, height: 2.1, sill: 0, offset: 3 })
  })

  it('is drawn as a jamb at each side and a panel across the middle of the wall', () => {
    // A 4.8 m door on a wall along x, 270 mm thick: jambs 135 mm either side of the centreline.
    const g = garageDoorSymbol([1, 0], [5.8, 0], [0, 1], 0.135)
    expect(g.panel).toEqual([
      [1, 0],
      [5.8, 0],
    ])
    expect(g.jambs).toEqual([
      [
        [1, -0.135],
        [1, 0.135],
      ],
      [
        [5.8, -0.135],
        [5.8, 0.135],
      ],
    ])
  })

  it('closes the opening in 3D with a thin panel on the wall’s centreline', () => {
    // Wall from (0, 0) to (0, 6) (north), door centred 3 m along: y 0.6..5.4, x ±25 mm.
    const f = garagePanelFootprint({ a: [0, 0], b: [0, 6] }, { offset: 3, width: 4.8 })
    const xs = f.map(p => p[0])
    const ys = f.map(p => p[1])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(GARAGE_PANEL, 9)
    expect(Math.min(...ys)).toBeCloseTo(0.6, 9)
    expect(Math.max(...ys)).toBeCloseTo(5.4, 9)
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(0, 9)
  })
})
