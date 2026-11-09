// The light's direction in the 3D scene: x east, y up, z south.

import { describe, expect, it } from 'vitest'
import { sceneSunDirection } from '../scene'

describe('the sun in the 3D scene', () => {
  it('points north as -z, east as +x, and up as +y', () => {
    const n = sceneSunDirection(0, 45, 1)
    expect(n.x).toBeCloseTo(0, 9)
    expect(n.y).toBeCloseTo(Math.SQRT1_2, 9)
    expect(n.z).toBeCloseTo(-Math.SQRT1_2, 9)
    const e = sceneSunDirection(90, 30, 1)
    expect(e.x).toBeGreaterThan(0)
    expect(e.z).toBeCloseTo(0, 9)
    expect(Math.atan2(e.y, e.x) * (180 / Math.PI)).toBeCloseTo(30, 9)
  })

  it('stretches the rise with the heights, so a shadow is as long on the stretched ground as on the real one', () => {
    for (const ex of [1, 1.5, 3]) {
      const d = sceneSunDirection(20, 32.7, ex)
      // A pole h tall stands h × ex in the scene; its shadow is (h × ex) / rise-per-metre.
      const risePerMetre = d.y / Math.hypot(d.x, d.z)
      expect((1 * ex) / risePerMetre).toBeCloseTo(1 / Math.tan((32.7 * Math.PI) / 180), 9)
    }
  })
})
