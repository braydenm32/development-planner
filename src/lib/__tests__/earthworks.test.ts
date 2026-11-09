import { describe, expect, it } from 'vitest'
import { drivewayGrade } from '../drape'
import { balancingShift, evaluateEarthworks, prepareEarthworks, type Platform } from '../earthworks'
import type { Vec2 } from '../geom'
import { Heightfield } from '../terrain'

/** A 40 m square site on a 0.25 m grid with ground level z(x, y). */
function site(z: (x: number, y: number) => number) {
  const cell = 0.25
  const n = 161
  const h = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = z(i * cell, j * cell)
  const grid = new Heightfield(0, 0, cell, n, n, h)
  const boundary: Vec2[] = [
    [0.1, 0.1],
    [39.9, 0.1],
    [39.9, 39.9],
    [0.1, 39.9],
  ]
  return { grid, boundary }
}

const square = (x0: number, y0: number, s: number): Vec2[] => [
  [x0, y0],
  [x0 + s, y0],
  [x0 + s, y0 + s],
  [x0, y0 + s],
]

const pad = (level: number, fill = true): Platform => ({ include: [square(15, 15, 10)], exclude: [], level, fill })

describe('cut and fill', () => {
  it('digs out a pad with retaining walls', () => {
    const { grid, boundary } = site(() => 10)
    const prep = prepareEarthworks(grid, boundary, [pad(9)], { margin: 0, cutBatter: 0, fillBatter: 0 })
    const r = evaluateEarthworks(prep)
    // 10 m × 10 m × 1 m, give or take the grid cells along the edge
    expect(r.cut).toBeGreaterThan(98)
    expect(r.cut).toBeLessThan(106)
    expect(r.fill).toBe(0)
    expect(r.maxCut).toBeCloseTo(1, 6)
    expect(r.grid.sample(20, 20)).toBeCloseTo(9, 6)
  })

  it('adds a sloping batter around the pad', () => {
    const { grid, boundary } = site(() => 10)
    const r = evaluateEarthworks(prepareEarthworks(grid, boundary, [pad(9)], { margin: 0, cutBatter: 1, fillBatter: 1 }))
    // 100 m³ for the pad, plus a 1 in 1 batter 1 m high: 0.5 m² of cross-section
    // along the 40 m edge and a little more at the corners
    expect(r.cut).toBeGreaterThan(118)
    expect(r.cut).toBeLessThan(124)
    // halfway up the batter, to within a grid cell
    expect(r.grid.sample(25.5, 20)).toBeGreaterThan(9.4)
    expect(r.grid.sample(25.5, 20)).toBeLessThan(9.7)
  })

  it('only cuts under a floor on piers', () => {
    const { grid, boundary } = site(() => 10)
    const r = evaluateEarthworks(prepareEarthworks(grid, boundary, [pad(11, false)], { margin: 0.5, cutBatter: 2, fillBatter: 2 }))
    expect(r.cut + r.fill).toBe(0)
  })

  it('finds the level where cut and fill balance on a slope', () => {
    // falls 1 in 5 to the south; the middle of the pad is at 14
    const { grid, boundary } = site((_, y) => 10 + 0.2 * y)
    const prep = prepareEarthworks(grid, boundary, [pad(12)], { margin: 0.5, cutBatter: 2, fillBatter: 2 })
    const shift = balancingShift(prep)!
    expect(12 + shift).toBeGreaterThan(13.7)
    expect(12 + shift).toBeLessThan(14.3)
    const r = evaluateEarthworks(prep, shift)
    expect(Math.abs(r.cut - r.fill)).toBeLessThan(0.5)
    expect(r.cut).toBeGreaterThan(10)
  })

  it('flags earthworks that reach the boundary', () => {
    const { grid, boundary } = site(() => 10)
    const near: Platform = { include: [square(1, 15, 10)], exclude: [], level: 7, fill: true }
    const r = evaluateEarthworks(prepareEarthworks(grid, boundary, [near], { margin: 0, cutBatter: 2, fillBatter: 2 }))
    expect(r.boundaryEdges).toContain(3) // the west side
    expect(r.boundaryEdges).not.toContain(1)
  })

  it('stops the batter at a retaining wall', () => {
    const { grid, boundary } = site(() => 10)
    const opts = { margin: 0, cutBatter: 2, fillBatter: 2 }
    const open = evaluateEarthworks(prepareEarthworks(grid, boundary, [pad(9)], opts))
    // A wall 1 m east of the pad, longer than the batter reaches round it.
    const wall: [Vec2, Vec2] = [
      [26, 5],
      [26, 35],
    ]
    const walled = evaluateEarthworks(prepareEarthworks(grid, boundary, [pad(9)], opts, [wall]))
    // Without the wall the 1 in 2 batter climbs back to natural ground 2 m past the pad.
    expect(open.grid.sample(26.5, 20)).toBeLessThan(9.9)
    // With it, the ground behind the wall is untouched and the step is at the wall.
    expect(walled.grid.sample(26.5, 20)).toBeCloseTo(10, 6)
    expect(walled.grid.sample(27.5, 20)).toBeCloseTo(10, 6)
    expect(walled.grid.sample(25.5, 20)).toBeCloseTo(open.grid.sample(25.5, 20), 6)
    expect(walled.cut).toBeLessThan(open.cut)
    // The other sides are as they were.
    expect(walled.grid.sample(14, 20)).toBeCloseTo(open.grid.sample(14, 20), 6)
  })

  it('lets the batter wrap round the end of a short retaining wall', () => {
    const { grid, boundary } = site(() => 10)
    // A flat 1 in 4 batter, which reaches 4 m out.
    const opts = { margin: 0, cutBatter: 4, fillBatter: 4 }
    const wall: [Vec2, Vec2] = [
      [26, 19],
      [26, 21],
    ]
    const walled = evaluateEarthworks(prepareEarthworks(grid, boundary, [pad(9)], opts, [wall]))
    // Just behind the middle of the wall the batter has come the long way round, so it is higher than in front.
    const behind = walled.grid.sample(26.25, 20)
    expect(behind).toBeLessThan(10)
    expect(behind).toBeGreaterThan(walled.grid.sample(25.75, 20) + 0.2)
  })

  it('levels a platform with a margin of its own instead of the settings', () => {
    const { grid, boundary } = site(() => 10)
    const opts = { margin: 1, cutBatter: 0, fillBatter: 0 }
    // Edges on half-cell lines, so each node is wholly in or out: 10 m × 10 m × 1 m exactly.
    const own: Platform = { include: [square(15.125, 15.125, 10)], exclude: [], level: 9, fill: true, margin: 0 }
    expect(evaluateEarthworks(prepareEarthworks(grid, boundary, [own], opts)).cut).toBeCloseTo(100, 4)
    // The settings' 1 m margin levels more.
    const { margin: _, ...shared } = own
    expect(evaluateEarthworks(prepareEarthworks(grid, boundary, [shared], opts)).cut).toBeGreaterThan(130)
  })

  it('a platform that gives way is left out where a firm one is level', () => {
    const { grid, boundary } = site(() => 10)
    const opts = { margin: 0, cutBatter: 0, fillBatter: 0 }
    const firm = pad(9)
    const soft: Platform = { include: [square(20, 20, 10)], exclude: [], level: 8, fill: true, soft: true }
    const r = evaluateEarthworks(prepareEarthworks(grid, boundary, [firm, soft], opts))
    expect(r.grid.sample(22.5, 22.5)).toBeCloseTo(9, 6) // on both: the firm one
    expect(r.grid.sample(27.5, 27.5)).toBeCloseTo(8, 6) // only on the soft one
    // Without the give-way the lower one would win where they overlap.
    const both = evaluateEarthworks(prepareEarthworks(grid, boundary, [firm, { ...soft, soft: false }], opts))
    expect(both.grid.sample(22.5, 22.5)).toBeCloseTo(8, 6)
  })

  it('fixed platforms stay at their level when the others are raised to balance', () => {
    const { grid, boundary } = site((_, y) => 10 + 0.2 * y)
    const opts = { margin: 0, cutBatter: 0, fillBatter: 0 }
    const fixed: Platform = { include: [square(2, 2, 6)], exclude: [], level: 10, fill: true, fixed: true }
    const prep = prepareEarthworks(grid, boundary, [pad(12), fixed], opts)
    const r = evaluateEarthworks(prep, 0.5)
    expect(r.grid.sample(20, 20)).toBeCloseTo(12.5, 6)
    expect(r.grid.sample(5, 5)).toBeCloseTo(10, 6)
    // With nothing left to move, there's no balancing.
    expect(balancingShift(prepareEarthworks(grid, boundary, [fixed], opts))).toBeNull()
  })

  it('measures a driveway along its length and across it', () => {
    const { grid } = site((x, y) => 10 + 0.05 * x + 0.2 * y)
    // 3 m wide, 10 m long, up the 1 in 5 slope; it falls 1 in 20 across.
    const drive: Vec2[] = [
      [5, 5],
      [8, 5],
      [8, 15],
      [5, 15],
    ]
    const g = drivewayGrade(grid, drive)!
    expect(g.length).toBeCloseTo(10, 4)
    expect(g.average).toBeCloseTo(0.2, 4)
    expect(g.steepest).toBeCloseTo(0.2, 4)
    expect(g.crossFall).toBeCloseTo(0.05, 4)
  })
})
