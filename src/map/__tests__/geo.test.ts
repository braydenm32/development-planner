import { describe, expect, it } from 'vitest'
import { fromMga, gda2020To94, gda94To2020, tileLonLat, tileXY, toMga, zoneOf, type LonLat } from '../geo'

const dms = (d: number, m: number, s: number) => Math.sign(d) * (Math.abs(d) + m / 60 + s / 3600)

describe('MGA projection', () => {
  // The ICSM's worked example (Flinders Peak), GRS80 on zone 55.
  const flinders: LonLat = [dms(144, 25, 29.5244), dms(-37, 57, 3.7203)]

  it('matches the ICSM worked example to a millimetre', () => {
    const [E, N] = toMga(flinders, 55)
    expect(E).toBeCloseTo(273741.297, 2)
    expect(N).toBeCloseTo(5796489.777, 2)
  })

  it('comes back to the same lon/lat', () => {
    const [lon, lat] = fromMga(toMga(flinders, 55), 55)
    expect(lon).toBeCloseTo(flinders[0], 9)
    expect(lat).toBeCloseTo(flinders[1], 9)
  })

  it('knows the zones across NSW', () => {
    expect(zoneOf(150.89)).toBe(56)
    expect(zoneOf(147.3)).toBe(55)
    expect(zoneOf(141.5)).toBe(54)
  })
})

describe('GDA94 and GDA2020', () => {
  it('moves a point in Wollongong about 1.5 to 1.9 m, mostly north-east', () => {
    const p94: LonLat = [150.8931, -34.4248]
    const p20 = gda94To2020(p94)
    const [e94, n94] = toMga(p94, 56)
    const [e20, n20] = toMga(p20, 56)
    const d = Math.hypot(e20 - e94, n20 - n94)
    expect(d).toBeGreaterThan(1.4)
    expect(d).toBeLessThan(1.95)
    expect(n20 - n94).toBeGreaterThan(0)
    expect(e20 - e94).toBeGreaterThan(0)
  })

  it('goes back the other way', () => {
    const p: LonLat = [150.8931, -34.4248]
    const [E0, N0] = toMga(p, 56)
    const [E1, N1] = toMga(gda2020To94(gda94To2020(p)), 56)
    expect(Math.hypot(E1 - E0, N1 - N0)).toBeLessThan(0.001)
  })
})

describe('tiles', () => {
  it('round trips a tile corner', () => {
    const [x, y] = tileXY([150.8931, -34.4248], 19)
    const [lon, lat] = tileLonLat(x, y, 19)
    expect(lon).toBeCloseTo(150.8931, 9)
    expect(lat).toBeCloseTo(-34.4248, 9)
  })
})
