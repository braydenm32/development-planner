import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { planTurn, upBearing } from '../../lib/orientation'
import type { Survey } from '../../lib/survey'
import type { Terrain } from '../../lib/terrain'
import { houseOutline } from '../../components/planNumbers'
import { placementInfo } from '../keyNumbers'
import { emptyPlan, toSite, type Placement, type Plan } from '../model'
import { addWall } from '../ops'
import { boundaryClearances, placeAtClearance, ringsCentre, rotatedPlacement } from '../placement'

// A 20 m wide (east-west) by 40 m deep block, counter-clockwise from its south-west corner.
const survey: Survey = {
  origin: [1000, 2000],
  boundary: [
    [0, 0],
    [20, 0],
    [20, 40],
    [0, 40],
  ],
  boundaryIsGuess: false,
  contours: [],
  levels: [],
  reference: [],
  warnings: [],
}
// A 10 x 8 m house outline in its own frame, with its origin at the south-west corner.
const house: Vec2[][] = [
  [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ],
]
const at = (e: number, n: number, rotation = 0): Placement => ({ e: 1000 + e, n: 2000 + n, rotation, ffl: 80 })

describe('boundary clearances', () => {
  it('measures the gap to each side and names the side by the way it faces', () => {
    const c = boundaryClearances(house, at(3, 5), survey)
    expect(c.map(x => x.name)).toEqual(['south', 'east', 'north', 'west'])
    expect(c.map(x => Math.round(x.dist * 1000) / 1000)).toEqual([5, 7, 27, 3])
  })

  it('reports zero where the house crosses a side', () => {
    const c = boundaryClearances(house, at(-2, 5), survey)
    expect(c[3].dist).toBe(0)
  })

  it('slides the house square to a side to hit an exact distance', () => {
    const pl = placeAtClearance(house, at(3, 5), survey, 1, 1.5)
    const c = boundaryClearances(house, pl, survey)
    expect(c[1].dist).toBeCloseTo(1.5, 3)
    // Moving square to the east side leaves the south side alone.
    expect(c[0].dist).toBeCloseTo(5, 3)
    expect(pl.n).toBeCloseTo(2005, 6)
  })

  it('works on a turned house too', () => {
    const pl = placeAtClearance(house, at(6, 6, 30), survey, 0, 2.25)
    expect(boundaryClearances(house, pl, survey)[0].dist).toBeCloseTo(2.25, 3)
  })
})

describe('view orientation', () => {
  it('turns the plan so the chosen bearing is at the top', () => {
    expect(planTurn('house', 25)).toBe(0)
    // North at the top: north in the house frame sits at 90 - rotation degrees; turning by the rotation puts it at 90.
    expect((planTurn(0, 25) * 180) / Math.PI).toBeCloseTo(25)
    expect((planTurn(270, 25) * 180) / Math.PI).toBeCloseTo(295)
  })

  it('gives the bearing of the house axis when square to the house', () => {
    expect(upBearing('house', 0)).toBe(0)
    expect(upBearing('house', 30)).toBe(330)
    expect(upBearing(90, 30)).toBe(90)
  })
})

/** Four 270 mm outside walls round a box on a level. */
function walled(plan: Plan, level: string, x0: number, y0: number, x1: number, y1: number): Plan {
  const c: Vec2[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
  let p = plan
  for (let i = 0; i < 4; i++) p = addWall(p, level, c[i], c[(i + 1) % 4], { kind: 'external', thickness: 0.27 })
  return p
}

/**
 * A made-up split level on the 20 x 40 m block: a 10 x 8 m lower level 10 m back from the south
 * side, and a wing 1.2 m up that reaches 6 m nearer the south side, where (in this test) the
 * ground is higher: it rises to the south, 0.1 m a metre.
 */
function split(): Plan {
  let p = emptyPlan(at(3, 10))
  p = { ...p, levels: [...p.levels, { id: 'level_wing', name: 'Wing level', elevation: 1.2, height: 2.7 }] }
  p = walled(p, 'level_ground', 0, 0, 10, 8)
  return walled(p, 'level_wing', 2, -6, 8, 0)
}
const sloping = { grid: { sample: (_x: number, y: number) => 90 - 0.1 * y } } as unknown as Terrain

describe('a split level on the block', () => {
  it('measures each side from the nearest level, and the ground under every level', () => {
    const plan = split()
    const house = houseOutline(plan)
    expect(house.names).toEqual(['Ground floor', 'Wing level'])
    const info = placementInfo(house.rings, plan.placement, survey, sloping, house.names)!
    const south = info.sides[0]
    // The wing's outside face is 10 - 6 - 0.135 m from the south side; the lower level's would be 9.865 m.
    expect(south.dist).toBeCloseTo(3.865, 6)
    expect(south.level).toBe('Wing level')
    expect(info.sides[2].level).toBe('Ground floor')
    // Ground from the lower level's north face (y 18.135) to the wing's south face (y 3.865).
    expect(info.maxRL).toBeCloseTo(90 - 0.1 * 3.865, 6)
    expect(info.minRL).toBeCloseTo(90 - 0.1 * 18.135, 6)
  })

  it('names no level on a plan with one', () => {
    const p = walled(emptyPlan(at(3, 10)), 'level_ground', 0, 0, 10, 8)
    const house = houseOutline(p)
    expect(placementInfo(house.rings, p.placement, survey, sloping, house.names)!.sides.every(s => s.level === undefined)).toBe(true)
  })
})

describe('turning the house on the block', () => {
  it('turns it about its own middle, which stays put', () => {
    // The plan origin 30 m from the house, so turning about it alone would swing the house off the block.
    const plan = { ...split(), placement: { e: 990, n: 1985, rotation: 0, ffl: 80 } }
    const mid = ringsCentre(houseOutline(plan).rings)!
    const before = toSite(mid, plan.placement, survey.origin)
    for (const rotation of [30, -10.3, 90]) {
      const pl = rotatedPlacement(plan.placement, rotation, mid)
      expect(pl.rotation).toBe(rotation)
      const after = toSite(mid, pl, survey.origin)
      expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeLessThan(0.001)
    }
  })

  it('turns about the plan origin when nothing is drawn', () => {
    expect(rotatedPlacement(at(3, 5), 30, null)).toEqual({ ...at(3, 5), rotation: 30 })
  })
})
