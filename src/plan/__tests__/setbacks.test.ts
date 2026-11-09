import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import type { Survey } from '../../lib/survey'
import type { Placement } from '../model'
import { boundaryClearances } from '../placement'
import { SETBACK_MIN, setbackDims, setbackText } from '../setbacks'

// A synthetic 20 m (east-west) by 40 m block, counter-clockwise from its south-west corner.
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
// A 10 m by 8 m house, its frame's origin at its south-west corner.
const house: Vec2[][] = [
  [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ],
]
const at = (e: number, n: number, rotation = 0): Placement => ({ e: 1000 + e, n: 2000 + n, rotation, ffl: 80 })

describe('setback dimensions', () => {
  it('measures each side with boundaryClearances and writes whole millimetres', () => {
    // House at x 3.2504..13.2504, y 5.0006..13.0006 on the block.
    // South: 5.0006 m → 5000.6 mm → 5001. East: 20 − 13.2504 = 6.7496 m → 6749.6 mm → 6750.
    // North: 40 − 13.0006 = 26.9994 m → 26999.4 mm → 26999. West: 3.2504 m → 3250.4 mm → 3250.
    const d = setbackDims(house, at(3.2504, 5.0006), survey)
    expect(d.map(x => x.name)).toEqual(['south', 'east', 'north', 'west'])
    expect(d.map(x => x.text)).toEqual(['5001', '6750', '26999', '3250'])
    // The same distances the Place panel's fields are typed against: one formula.
    expect(d.map(x => x.dist)).toEqual(boundaryClearances(house, at(3.2504, 5.0006), survey).map(c => c.dist))
  })

  it('runs each line from the house to the side, square to it', () => {
    const d = setbackDims(house, at(3, 5), survey)
    const west = d.find(x => x.name === 'west')!
    // The house's west wall is 3 m in from the west side.
    expect(west.to[0]).toBeCloseTo(0, 9)
    expect(west.from[0]).toBeCloseTo(3, 9)
    expect(west.from[1]).toBeCloseTo(west.to[1], 9)
    const len = Math.hypot(west.from[0] - west.to[0], west.from[1] - west.to[1])
    expect(len).toBeCloseTo(west.dist, 9)
  })

  it('leaves out a side the house is on: one 10 mm rule for the plan and the PDF', () => {
    expect(SETBACK_MIN).toBe(0.01)
    // 5 mm from the west side: on the boundary, no line.
    expect(setbackDims(house, at(0.005, 5), survey).map(x => x.name)).toEqual(['south', 'east', 'north'])
    // 12 mm: drawn, and written as 12.
    const d = setbackDims(house, at(0.012, 5), survey)
    expect(d.find(x => x.name === 'west')?.text).toBe('12')
    expect(d.map(x => x.side)).toEqual([0, 1, 2, 3])
  })

  it('rounds half a millimetre up, as the Place fields do', () => {
    expect(setbackText(1.2345)).toBe('1235') // 1234.5 mm
    expect(setbackText(1.2344)).toBe('1234')
    expect(setbackText(0.5)).toBe('500')
  })

  it('turns with the house', () => {
    // Turned 90° about its south-west corner, the house runs 8 m west and 10 m north of (12, 5).
    // West: 12 − 8 = 4. South: 5. East: 20 − 12 = 8. North: 40 − 15 = 25.
    const d = setbackDims(house, at(12, 5, 90), survey)
    const byName = Object.fromEntries(d.map(x => [x.name, x.text]))
    expect(byName).toEqual({ south: '5000', east: '8000', north: '25000', west: '4000' })
  })
})
