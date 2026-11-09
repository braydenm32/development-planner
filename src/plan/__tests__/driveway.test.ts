import { describe, expect, it } from 'vitest'
import { driveEnds, driveVerdict, gradeText, type Surface } from '../../lib/drape'
import { evaluateEarthworks, prepareEarthworks } from '../../lib/earthworks'
import type { Vec2 } from '../../lib/geom'
import { Heightfield } from '../../lib/terrain'
import { driveDesign, driveEndPoints, driveGround, drivewayPlatforms, garageSlab, MAX_DRIVE_GRADE, nearestKerbPoint, nearSpotLevels } from '../driveway'
import { earthworksOf, emptyPlan, type Area, type DriveLevels, type Plan } from '../model'
import { addRoom, addWall } from '../ops'
import { earthworksPlatforms } from '../platforms'

// A synthetic 20 m by 40 m block; its survey origin at (1000, 2000).
const origin: Vec2 = [1000, 2000]
const boundary: Vec2[] = [
  [0, 0],
  [20, 0],
  [20, 40],
  [0, 40],
]
const L = 'level_ground'
const style = { kind: 'external' as const, thickness: 0.27 }

/**
 * A 10 m by 8 m house set 22 m back from the street (the south side), its ground floor at
 * RL 84.00, and a 4 m wide, 10 m long drive from 12 m back up to the house.
 */
function site(drive?: DriveLevels, room = 'Garage'): { plan: Plan; area: Area } {
  let plan = emptyPlan({ e: 1005, n: 2022, rotation: 0, ffl: 84 })
  const c: Vec2[] = [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ]
  for (let i = 0; i < 4; i++) plan = addWall(plan, L, c[i], c[(i + 1) % 4], style)
  plan = addRoom(plan, L, [5, 4], room)
  // House frame: x 2..6, y −10..0; on the block x 7..11, y 12..22.
  const area: Area = {
    id: 'drive',
    level: L,
    name: 'Driveway',
    kind: 'driveway',
    pts: [
      [2, -10],
      [6, -10],
      [6, 0],
      [2, 0],
    ],
    ...(drive ? { drive } : {}),
  }
  plan = { ...plan, areas: [area] }
  return { plan, area }
}

/** Ground rising 1 in 10 to the north: RL 80.00 at the street, 0.1 m per metre back. */
const ground: Surface = { cell: 0.5, sample: (_x, y) => 80 + 0.1 * y }

/**
 * The same plane as a 0.25 m grid over the block, its nodes half a cell off the drive's edges
 * (x 7..11, y 12..22), so the drive covers 16 by 40 nodes: 40 m² exactly.
 */
function plane(): Heightfield {
  const cell = 0.25
  const x0 = -1.125
  const y0 = -1.125
  const nx = 90
  const ny = 170
  const z = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = ground.sample(x0 + i * cell, y0 + j * cell)
  return new Heightfield(x0, y0, cell, nx, ny, z)
}

/** The cut and fill on the plane: the house pad (unless `house` is false) and the drive graded in. */
function graded(plan: Plan, house = true, site = boundary) {
  const natural = plane()
  const platforms = [...(house ? earthworksPlatforms(plan, origin) : []), ...drivewayPlatforms(plan, origin, boundary)]
  const prep = prepareEarthworks(natural, site, platforms, earthworksOf(plan))
  const result = evaluateEarthworks(prep)
  return { natural, prep, result, platforms, ground: driveGround({ prep, result }, natural) }
}

/** A drive's design, read off the cut and fill on the plane. */
function designOf(drive: DriveLevels, room = 'Garage') {
  const { plan, area } = site(drive, room)
  return driveDesign(plan, area, driveEndPoints(plan, area, origin, boundary)!, graded(plan).ground)
}

const close = (a: Vec2, b: Vec2) => {
  expect(a[0]).toBeCloseTo(b[0], 4)
  expect(a[1]).toBeCloseTo(b[1], 4)
}

describe('driveway ends', () => {
  it('puts the garage end at the house and the street end away from it', () => {
    const { plan, area } = site()
    const e = driveEndPoints(plan, area, origin, boundary)!
    close(e.street, [9, 12])
    close(e.garage, [9, 22])
    expect(e.length).toBeCloseTo(10, 9)
  })

  it('with no house yet, takes the end nearer the boundary as the street end', () => {
    const plan: Plan = { ...emptyPlan({ e: 1000, n: 2000, rotation: 0, ffl: 84 }) }
    // On the block x 8..12, y 2..12: the south end is 2 m from the boundary, the north end 8 m.
    const area: Area = { id: 'd', level: L, name: 'Driveway', kind: 'driveway', pts: [[8, 2], [12, 2], [12, 12], [8, 12]] }
    const e = driveEndPoints(plan, area, origin, boundary)!
    close(e.street, [10, 2])
    close(e.garage, [10, 12])
  })

  it('finds the middle of each end along the long axis', () => {
    const e = driveEnds([[0, 0], [3, 0], [3, 12], [0, 12]])!
    const ends = [e.a, e.b].sort((p, q) => p[1] - q[1])
    close(ends[0], [1.5, 0])
    close(ends[1], [1.5, 12])
    expect(e.length).toBeCloseTo(12, 9)
  })
})

describe('driveway built to its own levels', () => {
  it('reads its grade off the ground graded between its levels', () => {
    // Street RL 82.00, garage RL 83.00, 10 m apart: 1.00 / 10 = 0.1, 1 in 10.0, 10%.
    const d = designOf({ street: { rl: 82, from: 'typed' }, garage: 83 })!
    expect(d.street).toBe(82)
    expect(d.garage).toBe(83)
    expect(d.grade.average).toBeCloseTo(0.1, 5)
    expect(d.grade.steepest).toBeCloseTo(0.1, 5)
    expect(d.grade.length).toBeCloseTo(10, 6)
    expect(gradeText(d.grade.average)).toBe('1 in 10.0 (10%)')
    expect(d.tooSteep).toBe(false)
    expect(driveVerdict(d.grade)).toBe('OK to drive')
  })

  it('takes the garage end from the garage slab', () => {
    // Slab RL 84.00 (FFL), street RL 81.00 from a spot level: 3.00 / 10 = 0.3, steeper than 1 in 4.
    expect(garageSlab(site().plan)).toEqual({ rl: 84, name: 'Garage slab' })
    const d = designOf({ street: { rl: 81, from: 'spot' }, garage: 'slab' })!
    expect(d.garage).toBe(84)
    expect(d.grade.average).toBeCloseTo(0.3, 5)
    expect(gradeText(d.grade.average)).toBe('1 in 3.3 (30%)')
    expect(d.tooSteep).toBe(true)
    expect(driveVerdict(d.grade)).toBe('Too steep: over 1 in 4')
  })

  it('warns only above the app’s limit of 1 in 4', () => {
    expect(MAX_DRIVE_GRADE).toBe(0.25)
    // 2.40 over 10 m = 0.24 (1 in 4.2): fine. 2.60 over 10 m = 0.26 (1 in 3.8): too steep.
    const at = (rise: number) => designOf({ street: { rl: 81, from: 'typed' }, garage: 81 + rise })!
    expect(at(2.4).tooSteep).toBe(false)
    expect(gradeText(at(2.4).grade.average)).toBe('1 in 4.2 (24%)')
    expect(at(2.6).tooSteep).toBe(true)
    expect(gradeText(at(2.6).grade.average)).toBe('1 in 3.8 (26%)')
  })

  it('follows the finished ground at an end without a level', () => {
    // Street end at y = 12: ground 80 + 1.2 = 81.20. Garage typed 83.00. 1.80 / 10 = 0.18.
    const d = designOf({ garage: 83 })!
    expect(d.street).toBeCloseTo(81.2, 4)
    expect(d.grade.average).toBeCloseTo(0.18, 4)
    expect(gradeText(d.grade.average)).toBe('1 in 5.6 (18%)')
  })

  it('has no design until an end has a level of its own', () => {
    const { plan, area } = site()
    expect(driveDesign(plan, area, driveEndPoints(plan, area, origin, boundary)!, driveGround(null, ground))).toBeNull()
  })

  it('names the slab it takes', () => {
    expect(garageSlab(site(undefined, 'Double carport').plan).name).toBe('Double carport slab')
    expect(garageSlab(site(undefined, 'Living').plan)).toEqual({ rl: 84, name: 'Ground floor slab' })
  })
})

describe('driveway graded into the ground', () => {
  // Hand calcs on the plane RL 80 + 0.1 y. The drive runs x 7..11, y 12..22 on the block, street
  // end south (y 12), garage end north (y 22). Grid nodes sit at x, y = −1.125 + 0.25 k.
  const at = (r: { result: { grid: Heightfield } }, x: number, y: number) => r.result.grid.sample(x, y)

  it('levels the ground along it between its levels, flat across', () => {
    // Street RL 82.00, garage RL 83.00: RL 82 + 0.1 (y − 12) down the middle and at each side.
    const { plan } = site({ street: { rl: 82, from: 'typed' }, garage: 83 })
    const g = graded(plan, false)
    for (const y of [12.125, 14.875, 17.125, 21.875]) {
      expect(at(g, 9.125, y), `y ${y}`).toBeCloseTo(82 + 0.1 * (y - 12), 4)
      expect(at(g, 7.125, y), `west edge, y ${y}`).toBeCloseTo(82 + 0.1 * (y - 12), 4)
      expect(at(g, 10.875, y), `east edge, y ${y}`).toBeCloseTo(82 + 0.1 * (y - 12), 4)
    }
  })

  it('cuts the drive into the plane: 4 m × 10 m × 0.5 m = 20 m³ under it', () => {
    // Street RL 80.70 at y 12 (ground 81.20), garage RL 81.70 at y 22 (ground 82.20): 0.5 m down all along.
    const { plan } = site({ street: { rl: 80.7, from: 'typed' }, garage: 81.7 })
    const drive: Vec2[] = [
      [7, 12],
      [11, 12],
      [11, 22],
      [7, 22],
    ]
    // Counting only the ground under the drive: 16 × 40 nodes of 0.25 m × 0.25 m, each 0.5 m down.
    const under = graded(plan, false, drive).result
    expect(under.cut).toBeCloseTo(20, 3)
    expect(under.fill).toBe(0)
    expect(under.maxCut).toBeCloseTo(0.5, 4)
    // The whole block adds the batters (2 run to 1 rise), each a triangle 0.5 m deep:
    // sides 2 × 10 m × (0.5 × 1.0 / 2) = 5.00; street end 4 m × (0.5 × 0.833 / 2) = 0.83, where the
    // ground falls 0.1 a metre as the batter rises 0.5 (0.5 / 0.6 = 0.833 m); garage end
    // 4 m × (0.5 × 1.25 / 2) = 1.25 (0.5 / 0.4 = 1.25 m). 27.08 m³, plus four corners of less
    // than a quarter cone each (π × 1.25² × 0.5 / 12 = 0.20 m³).
    const all = graded(plan, false).result
    expect(all.cut).toBeGreaterThan(27.08)
    expect(all.cut).toBeLessThan(27.08 + 4 * 0.21)
  })

  it('runs its batters out to meet the natural ground at the cut and fill ratio', () => {
    // At y 16.875 the drive is at RL 80.70 + 0.4875 = 81.1875 and the ground 0.5 m higher, 81.6875.
    // Past the east edge (x 11) the cut batter rises 1 in 2: 0.125 m out, 81.25; 0.875 m out,
    // 81.625; it meets the ground 1.0 m out (0.5 m × 2), so 1.125 m out is untouched ground.
    const cut = graded(site({ street: { rl: 80.7, from: 'typed' }, garage: 81.7 }).plan, false)
    expect(at(cut, 10.875, 16.875)).toBeCloseTo(81.1875, 4)
    expect(at(cut, 11.125, 16.875)).toBeCloseTo(81.25, 4)
    expect(at(cut, 11.875, 16.875)).toBeCloseTo(81.625, 4)
    expect(at(cut, 12.125, 16.875)).toBeCloseTo(81.6875, 4)
    // Built up 0.5 m instead (RL 81.70 to 82.70), the fill batter falls 1 in 2 to meet it the same way.
    const fill = graded(site({ street: { rl: 81.7, from: 'typed' }, garage: 82.7 }).plan, false)
    expect(at(fill, 10.875, 16.875)).toBeCloseTo(82.1875, 4)
    expect(at(fill, 11.125, 16.875)).toBeCloseTo(82.125, 4)
    expect(at(fill, 11.875, 16.875)).toBeCloseTo(81.75, 4)
    expect(at(fill, 12.125, 16.875)).toBeCloseTo(81.6875, 4)
    expect(fill.result.cut).toBe(0)
  })

  it('gives way to the house pad where they overlap, and is read only where it is its own', () => {
    // The house's walls start at y 21.865; its pad (RL 84.00 − 0.30 = 83.70) runs 0.5 m out, past
    // the drive's last nodes at y 21.375 and 21.625. At y 21.125 the drive is its own again:
    // RL 81.00 + 0.3 × 9.125 = 83.7375.
    const { plan, area } = site({ street: { rl: 81, from: 'typed' }, garage: 'slab' })
    const g = graded(plan)
    expect(at(g, 9.125, 21.625)).toBeCloseTo(83.7, 4)
    expect(at(g, 9.125, 21.375)).toBeCloseTo(83.7, 4)
    expect(at(g, 9.125, 21.125)).toBeCloseTo(83.7375, 4)
    expect(g.ground.own(area.id, [9, 21.5])).toBe(false)
    expect(g.ground.own(area.id, [9, 17])).toBe(true)
    // So its grade is still the 0.3 it's built to, over the stretch that is its own.
    const d = driveDesign(plan, area, driveEndPoints(plan, area, origin, boundary)!, g.ground)!
    expect(d.grade.average).toBeCloseTo(0.3, 5)
  })

  it('rises and falls at the garage end with the floor when the cut and fill is balanced', () => {
    // Raising the floor 0.2 m lifts the slab end 0.2 m and leaves the typed street end: at y 21.125
    // (0.9125 of the way) the drive rises 0.1825 m, at y 12.125 (0.0125 of the way) 0.0025 m.
    const { plan } = site({ street: { rl: 81, from: 'typed' }, garage: 'slab' })
    const g = graded(plan, false)
    const raised = evaluateEarthworks(g.prep, 0.2).grid
    expect(raised.sample(9.125, 21.125) - at(g, 9.125, 21.125)).toBeCloseTo(0.1825, 4)
    expect(raised.sample(9.125, 12.125) - at(g, 9.125, 12.125)).toBeCloseTo(0.0025, 4)
  })

  it('leaves a drive with no levels to follow the finished ground, as before', () => {
    const { plan, area } = site()
    expect(drivewayPlatforms(plan, origin, boundary)).toEqual([])
    const g = graded(plan)
    const houseOnly = evaluateEarthworks(prepareEarthworks(plane(), boundary, earthworksPlatforms(plan, origin), earthworksOf(plan)))
    expect(Array.from(g.result.grid.z)).toEqual(Array.from(houseOnly.grid.z))
    expect(g.result.cut).toBe(houseOnly.cut)
    expect(g.ground.own(area.id, [9, 17])).toBe(true)
    // Under the middle of the drive the ground is untouched: RL 80 + 1.7.
    expect(at(g, 9.125, 16.875)).toBeCloseTo(81.6875, 4)
  })
})

describe('street end levels', () => {
  it('lists surveyed spot levels near the street end, closest first, within 15 m', () => {
    const levels = [
      { x: 9, y: 20, z: 83.1, layer: 'L' }, // 8 m
      { x: 9, y: 13, z: 81.4, layer: 'L' }, // 1 m
      { x: 30, y: 12, z: 79, layer: 'L' }, // 21 m: too far
      { x: 12, y: 8, z: 80.9, layer: 'L' }, // 5 m (3-4-5)
    ]
    const near = nearSpotLevels(levels, [9, 12])
    expect(near.map(p => p.rl)).toEqual([81.4, 80.9, 83.1])
    expect(near.map(p => p.dist)).toEqual([1, 5, 8])
  })

  it('finds where a kerb passes closest', () => {
    const k = nearestKerbPoint(
      [
        [
          [-5, 0],
          [25, 0],
        ],
        [
          [-5, -3],
          [25, -3],
        ],
      ],
      [9, 2],
    )!
    expect(k.at).toEqual([9, 0])
    expect(k.dist).toBe(2)
    expect(nearestKerbPoint([], [9, 2])).toBeNull()
  })
})

/**
 * The same house and drive on a made-up split level: the garage and the drive on its upper level,
 * with a lower wing 1.5 m down behind it (to the north), so the garage's level isn't the lowest.
 */
function onUpperLevel(plan: Plan): Plan {
  const low = 'level_low'
  const c: Vec2[] = [
    [0, 9],
    [10, 9],
    [10, 15],
    [0, 15],
  ]
  let p: Plan = { ...plan, levels: [{ id: low, name: 'Lower level', elevation: -1.5, height: 2.7 }, ...plan.levels] }
  for (let i = 0; i < 4; i++) p = addWall(p, low, c[i], c[(i + 1) % 4], style)
  return p
}

describe('a driveway on an upper split level', () => {
  const drive: DriveLevels = { street: { rl: 81, from: 'typed' }, garage: 'slab' }

  it('is graded by the cut and fill just as on the lowest level', () => {
    const { plan } = site(drive)
    const [flat] = drivewayPlatforms(plan, origin, boundary)
    const [upper] = drivewayPlatforms(onUpperLevel(plan), origin, boundary)
    expect(upper).toBeDefined()
    expect(upper).toEqual(flat)
  })

  it('reads the same grade between its levels', () => {
    const { plan, area } = site(drive)
    const split = onUpperLevel(plan)
    const flat = driveDesign(plan, area, driveEndPoints(plan, area, origin, boundary)!, graded(plan).ground)!
    const upper = driveDesign(split, area, driveEndPoints(split, area, origin, boundary)!, graded(split).ground)!
    expect(upper.garage).toBe(84)
    expect(upper.grade.average).toBeCloseTo(flat.grade.average, 6)
  })
})
