import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { planTurn, upBearing } from '../../lib/orientation'
import type { Survey } from '../../lib/survey'
import type { Placement } from '../model'
import { boundaryClearances, placeAtClearance } from '../placement'

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
