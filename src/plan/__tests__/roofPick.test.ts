import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { emptyPlan } from '../model'
import { addRoof } from '../ops'
import { roofAtPoint } from '../roofPick'
import { usePlan } from '../store'

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

// A 10 m by 8 m hip roof with a 450 mm overhang, and a smaller roof drawn over its east end.
let plan = emptyPlan({ e: 0, n: 0, rotation: 0, ffl: 80 })
plan = addRoof(plan, 'level_ground', rect(0, 0, 10, 8), { type: 'hip', pitch: 22.5, overhang: 0.45 })
plan = addRoof(plan, 'level_ground', rect(7, 2, 9, 6), { type: 'flat', pitch: 2, overhang: 0.3 })
const [house, porch] = plan.roofs

describe('picking a roof on the plan', () => {
  it('picks a roof anywhere inside it, not only on the eave strip', () => {
    expect(roofAtPoint(plan.roofs, [3, 4], 0.1)?.id).toBe(house.id)
    // In the overhang, past the walls.
    expect(roofAtPoint(plan.roofs, [-0.3, 4], 0.1)?.id).toBe(house.id)
  })

  it('picks the roof on top where two overlap', () => {
    expect(roofAtPoint(plan.roofs, [8, 4], 0.1)?.id).toBe(porch.id)
  })

  it('takes a click just outside the eave, within the tolerance', () => {
    // The eave is at x = 10.45: 50 mm past it is on the edge; 500 mm is not.
    expect(roofAtPoint(plan.roofs, [10.5, 4], 0.1)?.id).toBe(house.id)
    expect(roofAtPoint(plan.roofs, [10.95, 4], 0.1)).toBeUndefined()
  })
})

describe('the roof tool', () => {
  it('starts on Roof this building, and can draw an outline instead', () => {
    expect(usePlan.getState().roofMode).toBe('building')
    usePlan.getState().setRoofMode('outline')
    expect(usePlan.getState().roofMode).toBe('outline')
  })
})
