import { describe, expect, it } from 'vitest'
import { Heightfield } from '../../lib/terrain'
import { measure, measureText, riseText } from '../measure'

// A 40 m block whose ground rises 1 in 10 to the east: RL = 80 + 0.1 x.
function site() {
  const n = 41
  const z = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = 80 + 0.1 * i
  const grid = new Heightfield(0, 0, 1, n, n, z)
  const survey = { origin: [1000, 2000] as [number, number], boundary: [[0, 0], [40, 0], [40, 40], [0, 40]] as [number, number][] }
  return { grid, survey }
}
const pl = { e: 1000, n: 2000, rotation: 0, ffl: 80 }

describe('measure', () => {
  it('gives the flat, sloped and height numbers from the survey ground', () => {
    const { grid, survey } = site()
    const m = measure([10, 10], [20, 10], pl, survey, grid)
    expect(m.flat).toBeCloseTo(10, 6)
    expect(m.rlA).toBeCloseTo(81, 3)
    expect(m.rlB).toBeCloseTo(82, 3)
    expect(m.rise).toBeCloseTo(1, 3)
    expect(m.sloped).toBeCloseTo(Math.hypot(10, 1), 3)
    expect(measureText(m)).toEqual({ flat: '10.00 m', sloped: '10.05 m', rise: '+1.00 m' })
  })

  it('reads a fall as negative, and nothing level as zero', () => {
    const { grid, survey } = site()
    expect(measure([20, 10], [10, 10], pl, survey, grid).rise).toBeCloseTo(-1, 3)
    expect(riseText(-1)).toBe('−1.00 m')
    expect(measure([10, 10], [10, 30], pl, survey, grid).rise).toBeCloseTo(0, 3)
    expect(riseText(0)).toBe('0.00 m')
  })

  it('keeps the flat distance when an end is off the block', () => {
    const { grid, survey } = site()
    const m = measure([10, 10], [60, 10], pl, survey, grid)
    expect(m.flat).toBeCloseTo(50, 6)
    expect(m.rise).toBeNull()
    expect(m.sloped).toBeNull()
    expect(measureText(m).rise).toBe('off the block')
  })
})
