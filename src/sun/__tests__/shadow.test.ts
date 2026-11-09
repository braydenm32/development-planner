// Shadows of a simple box house against hand calculations: flat ground, sloping ground, the
// part over the boundary, and the outline tracing underneath.

import { describe, expect, it } from 'vitest'
import { convexHull, signedArea, type Vec2 } from '../../lib/geom'
import type { Plan, Wall } from '../../plan/model'
import { DEFAULT_LOCATION } from '../location'
import { Raster, traceRings } from '../raster'
import { castPoint, outline, shadowOf, sunRay, type Ground } from '../shadow'
import { houseSolids } from '../solids'

const L0 = 'level_ground'
const wall = (id: string, a: Vec2, b: Vec2): Wall => ({ id, level: L0, a, b, thickness: 0.2, kind: 'external' })

/** A 10 × 8 m box on wall centrelines (10.2 × 8.2 m outside), walls 2.7 m on a 0.3 m floor: 3 m tall from RL 50. */
function box(patch: Partial<Plan> = {}): Plan {
  return {
    version: 1,
    levels: [{ id: L0, name: 'Ground floor', elevation: 0, height: 2.7 }],
    walls: [wall('s', [0, 0], [10, 0]), wall('e', [10, 0], [10, 8]), wall('n', [10, 8], [0, 8]), wall('w', [0, 8], [0, 0])],
    openings: [],
    rooms: [],
    areas: [],
    roofs: [],
    stairs: [],
    furniture: [],
    placement: { e: 0, n: 0, rotation: 0, ffl: 50.3 },
    ...patch,
  }
}

const flat: Ground = { sample: () => 50 }
const ORIGIN: Vec2 = [0, 0]
const BIG: Vec2[] = [
  [-50, -50],
  [50, -50],
  [50, 50],
  [-50, 50],
]
const ray = (azimuth: number, elevation: number) => sunRay({ azimuth, elevation }, DEFAULT_LOCATION)!

const extent = (rings: Vec2[][]) => {
  const pts = rings.flat()
  return { minX: Math.min(...pts.map(p => p[0])), maxX: Math.max(...pts.map(p => p[0])), minY: Math.min(...pts.map(p => p[1])), maxY: Math.max(...pts.map(p => p[1])) }
}

describe('the shadow of a box', () => {
  const solids = houseSolids(box(), ORIGIN)

  it('stands the house up from under its floor to the top of its walls', () => {
    const outer = solids.prisms[0]
    expect(outer.z0).toBeCloseTo(50, 9)
    expect(outer.z1).toBeCloseTo(53, 9)
    expect(Math.abs(signedArea(outer.ring))).toBeCloseTo(10.2 * 8.2, 6)
    expect(solids.top).toBeCloseTo(53, 9)
  })

  it('runs 3 m south with the sun 45° up in the north', () => {
    const s = shadowOf(solids, ray(0, 45), flat, BIG)
    // The footprint and 3 m beyond its south side: 10.2 × (8.2 + 3).
    expect(s.area).toBeCloseTo(10.2 * 11.2, -0.5)
    expect(Math.abs(s.area - 10.2 * 11.2) / (10.2 * 11.2)).toBeLessThan(0.015)
    const e = extent(s.rings)
    expect(e.minY).toBeCloseTo(-3.1, 1)
    expect(e.maxY).toBeCloseTo(8.1, 1)
    expect(e.minX).toBeCloseTo(-0.1, 1)
    expect(e.maxX).toBeCloseTo(10.1, 1)
    expect(s.rings).toHaveLength(1)
    expect(signedArea(s.rings[0])).toBeGreaterThan(0)
    // Its far tip is on the south side.
    expect(s.tip[1]).toBeCloseTo(-3.1, 1)
    expect(s.over.area).toBe(0)
  })

  it('matches the exact outline with a low sun from the north-west', () => {
    const r = ray(315, 30)
    const s = shadowOf(solids, r, flat, BIG)
    // The box is convex, so its shadow is the hull of its corners and their casts.
    const L = 3 / Math.tan(Math.PI / 6)
    const corners: Vec2[] = [
      [-0.1, -0.1],
      [10.1, -0.1],
      [10.1, 8.1],
      [-0.1, 8.1],
    ]
    const cast = corners.map(([x, y]) => [x + L * Math.SQRT1_2, y - L * Math.SQRT1_2] as Vec2)
    const exact = Math.abs(signedArea(convexHull([...corners, ...cast])))
    expect(Math.abs(s.area - exact) / exact).toBeLessThan(0.015)
    const e = extent(s.rings)
    expect(e.maxX).toBeCloseTo(10.1 + L * Math.SQRT1_2, 1)
    expect(e.minY).toBeCloseTo(-0.1 - L * Math.SQRT1_2, 1)
  })

  it('reaches further down a slope, where the ground falls away', () => {
    // Falls 1 in 10 to the south. The south wall's top (RL 53 at y = −0.1) meets the ground where 53 − s = 50 + 0.1 (−0.1 − s).
    const slope: Ground = { sample: (_x, y) => 50 + 0.1 * y }
    const p = castPoint(5, -0.1, 53, ray(0, 45), slope)
    const s = (53 - 50 + 0.01) / 0.9
    expect(p[0]).toBeCloseTo(5, 6)
    expect(p[1]).toBeCloseTo(-0.1 - s, 3)
    // Up a slope it's shorter: rising 1 in 10 to the south.
    const rise: Ground = { sample: (_x, y) => 50 - 0.1 * y }
    expect(castPoint(5, -0.1, 53, ray(0, 45), rise)[1]).toBeCloseTo(-0.1 - (53 - 50 - 0.01) / 1.1, 3)
  })

  it('follows ground steeper than the sun', () => {
    // The sun 10° up; the ground rises 1 in 2 away from it, so the shadow hits the bank close by.
    const bank: Ground = { sample: (_x, y) => (y < -1 ? 50 + 0.5 * (-1 - y) : 50) }
    const r = ray(0, 10)
    const p = castPoint(5, -0.1, 53, r, bank)
    // On the bank: 53 − s·tan10° = 50 + 0.5 (s − 0.9).
    const s = (3 + 0.45) / (Math.tan(Math.PI / 18) + 0.5)
    expect(p[1]).toBeCloseTo(-0.1 - s, 2)
  })

  it('casts nothing from the part of a house cut into a bank, so no shadow falls towards the sun', () => {
    // The sun due north, 30° up; the ground rises 1 in 5 to the north, so the north wall's
    // footing (RL 50) is 1.6 m under the ground behind it.
    const rising: Ground = { sample: (_x, y) => 50 + 0.2 * y }
    const s = shadowOf(houseSolids(box(), ORIGIN), ray(0, 30), rising, BIG)!
    const ys = s.rings.flat().map(p => p[1])
    expect(Math.max(...ys)).toBeLessThan(8.1 + 0.15)
    // The south wall's top (RL 53) is 3.02 m over the ground there, which falls away under the
    // shadow, so it reaches 3.02 / (tan 30° − 0.2) m.
    expect(Math.min(...ys)).toBeCloseTo(-0.1 - 3.02 / (Math.tan(Math.PI / 6) - 0.2), 1)
  })

  it('measures the part over the boundary, and which side it crosses', () => {
    // The block's south side 2.1 m south of the house: the 3 m shadow reaches 0.9 m past it.
    const block: Vec2[] = [
      [-5, -2.2],
      [15, -2.2],
      [15, 20],
      [-5, 20],
    ]
    const s = shadowOf(solids, ray(0, 45), flat, block)
    expect(Math.abs(s.over.area - 10.2 * 0.9)).toBeLessThan(0.4)
    expect(s.over.sides).toEqual(['south'])
    expect(s.over.rings).toHaveLength(1)
    // Turn the boundary the other way round: the same.
    expect(shadowOf(solids, ray(0, 45), flat, [...block].reverse()).over.sides).toEqual(['south'])
  })

  it('takes in an upper floor and a roof', () => {
    const two = box({
      levels: [
        { id: L0, name: 'Ground floor', elevation: 0, height: 2.7 },
        { id: 'up', name: 'First floor', elevation: 3, height: 2.7 },
      ],
      walls: [...box().walls, ...box().walls.map(w => ({ ...w, id: `${w.id}2`, level: 'up' }))],
      roofs: [{ id: 'r', level: 'up', pts: [[-0.1, -0.1], [10.1, -0.1], [10.1, 8.1], [-0.1, 8.1]], type: 'flat', pitch: 0, overhang: 0, gables: [false, false, false, false], lowEdge: 0 }],
    })
    const solids2 = houseSolids(two, ORIGIN)
    // Upper walls reach RL 56 (50.3 + 3 + 2.7); the flat roof sits on top of them.
    expect(solids2.top).toBeGreaterThan(56)
    const s = shadowOf(solids2, ray(0, 45), flat, BIG)
    expect(extent(s.rings).minY).toBeLessThan(-0.1 - (solids2.top - 50) + 0.15)
    expect(extent(s.rings).minY).toBeGreaterThan(-0.1 - (solids2.top - 50) - 0.15)
  })

  it('casts nothing with the sun down', () => {
    expect(sunRay({ azimuth: 0, elevation: 0.5 }, DEFAULT_LOCATION)).toBeNull()
    expect(sunRay({ azimuth: 0, elevation: -5 }, DEFAULT_LOCATION)).toBeNull()
  })

  it('turns with the survey when true north is off its grid', () => {
    // True north 2° clockwise of the survey's north: a sun due north (true) comes from grid bearing 2°.
    const r = sunRay({ azimuth: 0, elevation: 45 }, { ...DEFAULT_LOCATION, trueNorth: 2 })!
    expect(r.dx).toBeCloseTo(Math.sin((2 * Math.PI) / 180), 9)
    expect(r.dy).toBeCloseTo(Math.cos((2 * Math.PI) / 180), 9)
  })
})

describe('tracing a grid', () => {
  it('outlines filled cells anticlockwise, with holes clockwise', () => {
    const r = new Raster(0, 0, 0.1, 100, 100)
    // A 6 × 6 m square with a 2 × 2 m hole.
    const sq = (x0: number, y0: number, s: number) => [x0, y0, x0 + s, y0, x0 + s, y0 + s, x0, y0 + s]
    r.fill(sq(2, 2, 6))
    const hole = r.blank()
    hole.fill(sq(4, 4, 2))
    const holed = r.minus(hole)
    expect(holed.area()).toBeCloseTo(32, 6)
    const rings = outline(holed)
    expect(rings).toHaveLength(2)
    const areas = rings.map(signedArea).sort((a, b) => a - b)
    expect(areas[0]).toBeLessThan(0)
    expect(areas[1]).toBeGreaterThan(0)
    // Traced between the centres of filled and empty cells, which on a straight run is the cells' edge.
    expect(areas[0]).toBeCloseTo(-4, 1)
    expect(areas[1]).toBeCloseTo(36, 1)
  })

  it('keeps cells that only touch at a corner apart', () => {
    const r = new Raster(0, 0, 1, 2, 2)
    r.v[0] = 1
    r.v[3] = 1
    expect(traceRings(r)).toHaveLength(2)
  })
})
