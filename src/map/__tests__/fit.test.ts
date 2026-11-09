import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { errorsOf, fitBoundary, gridToMga, mgaToGrid, nudgeFit } from '../fit'

// A made-up lot in MGA: a 20 × 32 m body with a 4 m wide, 30 m long access handle off one corner.
const E = 305000
const N = 6188000
const body: Vec2[] = [
  [0, 0],
  [20, 0],
  [20, 32],
  [0, 32],
]
const withHandle: Vec2[] = [
  [0, 0],
  [20, 0],
  [20, 32],
  [4, 32],
  [4, 62],
  [0, 62],
]
const turn = (pts: Vec2[], deg: number, at: Vec2): Vec2[] => {
  const c = Math.cos((deg * Math.PI) / 180)
  const s = Math.sin((deg * Math.PI) / 180)
  return pts.map(([x, y]) => [at[0] + c * x - s * y, at[1] + s * x + c * y])
}

describe('fitting the survey onto the lot', () => {
  // The lot on the ground is turned 23.5° from grid north.
  const lot = turn(withHandle, 23.5, [E, N])
  // The survey: the body only, on a local grid near (5000, 8000), drawn to its own north 1.2° off.
  const survey = turn(body, 23.5 - 1.2, [5003.2, 8011.7])

  it('finds the turn and shift, leaving the handle out', () => {
    const fit = fitBoundary(survey, lot, [5000, 8000])
    expect(fit.rotation).toBeCloseTo(1.2, 3)
    expect(fit.rms).toBeLessThan(0.005)
    expect(fit.onGrid).toBe(false)
    // The survey's corners land on the lot's body corners.
    const lotBody = turn(body, 23.5, [E, N])
    survey.forEach((p, i) => {
      const q = gridToMga(fit, p)
      expect(Math.hypot(q[0] - lotBody[i][0], q[1] - lotBody[i][1])).toBeLessThan(0.01)
    })
    expect(fit.areaRatio).toBeCloseTo(640 / 760, 3)
  })

  it('copes with a cadastre a little off and a corner rounded', () => {
    const rough = lot.map(([x, y], i) => [x + (i % 2 ? 0.3 : -0.2), y + (i % 3 ? 0.25 : -0.1)] as Vec2)
    const fit = fitBoundary(survey, rough, [5000, 8000])
    expect(Math.abs(fit.rotation - 1.2)).toBeLessThan(1.5)
    expect(fit.rms).toBeLessThan(0.4)
  })

  it('keeps a survey already on MGA where it is', () => {
    const onMga = turn(body, 23.5, [E, N])
    const fit = fitBoundary(onMga, lot, [E, N])
    expect(fit.onGrid).toBe(true)
    expect(fit.rotation).toBe(0)
    expect(fit.at).toEqual([E, N])
  })

  it('prefers the survey’s own north on a square lot', () => {
    const square: Vec2[] = [
      [0, 0],
      [25, 0],
      [25, 25],
      [0, 25],
    ]
    const fit = fitBoundary(turn(square, 0.5, [5000, 8000]), turn(square, 0, [E, N]), [5000, 8000])
    expect(Math.abs(fit.rotation + 0.5)).toBeLessThan(0.01)
  })

  it('goes there and back, and nudges', () => {
    const fit = { from: [5000, 8000] as Vec2, at: [E, N] as Vec2, rotation: 12 }
    const p: Vec2 = [5012.3, 8020.1]
    const back = mgaToGrid(fit, gridToMga(fit, p))
    expect(back[0]).toBeCloseTo(p[0], 9)
    expect(back[1]).toBeCloseTo(p[1], 9)
    const turned = nudgeFit(fit, { turn: 0.5, about: p })
    const a = gridToMga(fit, p)
    const b = gridToMga(turned, p)
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-9)
    expect(turned.rotation).toBeCloseTo(12.5, 9)
    const shifted = nudgeFit(fit, { shift: [0.5, -0.5] })
    const c = gridToMga(shifted, p)
    expect(c[0] - a[0]).toBeCloseTo(0.5, 9)
    expect(c[1] - a[1]).toBeCloseTo(-0.5, 9)
  })

  it('measures how far a fit is off', () => {
    const fit = fitBoundary(survey, lot, [5000, 8000])
    const off = nudgeFit(fit, { shift: [0, 1] })
    expect(errorsOf(off, survey, lot).rms).toBeGreaterThan(0.4)
  })
})
