// One driveway direction everywhere (LF-01): from the garage end out to the street end, whatever
// the outline's proportions. A wide, short drive (a double garage's) used to be measured along its
// width; a long, thin one must read exactly as it always did.

import { describe, expect, it } from 'vitest'
import { driveEnds, drivewayGrade, driveWidth, type Surface } from '../../lib/drape'
import { evaluateEarthworks, prepareEarthworks } from '../../lib/earthworks'
import type { Vec2 } from '../../lib/geom'
import { Heightfield } from '../../lib/terrain'
import { driveLines } from '../crossing'
import { driveDesign, driveEndPoints, driveGround, drivewayPlatforms } from '../driveway'
import { earthworksOf, emptyPlan, toSite, type Area, type Opening, type Plan } from '../model'
import { addRoom, addWall } from '../ops'
import { earthworksPlatforms } from '../platforms'

// A synthetic 20 m by 40 m block, the street along its south side (edge 0); its survey origin at (1000, 2000).
const origin: Vec2 = [1000, 2000]
const boundary: Vec2[] = [
  [0, 0],
  [20, 0],
  [20, 40],
  [0, 40],
]
const L = 'level_ground'

/**
 * A 10 m by 8 m garage and house set `back` m from the street, on the block x 5..15, its ground
 * floor at RL 84.00, with a driveway given in the house's frame (y 0 is the house's south wall).
 */
function site(back: number, pts: Vec2[], extra: Partial<Area> = {}, door?: { wall: number; offset: number; width: number }): { plan: Plan; area: Area } {
  let plan = emptyPlan({ e: 1005, n: 2000 + back, rotation: 0, ffl: 84 })
  const c: Vec2[] = [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ]
  for (let i = 0; i < 4; i++) plan = addWall(plan, L, c[i], c[(i + 1) % 4], { kind: 'external', thickness: 0.27 })
  plan = addRoom(plan, L, [5, 4], 'Garage')
  if (door) {
    const o: Opening = { id: 'door', wall: plan.walls[door.wall].id, kind: 'garage', offset: door.offset, width: door.width, height: 2.1, sill: 0, flipHinge: false, flipSwing: false }
    plan = { ...plan, openings: [o] }
  }
  const area: Area = { id: 'drive', level: L, name: 'Driveway', kind: 'driveway', pts, ...extra }
  plan = { ...plan, areas: [area] }
  return { plan, area }
}

const close = (a: Vec2, b: Vec2, digits = 4) => {
  expect(a[0]).toBeCloseTo(b[0], digits)
  expect(a[1]).toBeCloseTo(b[1], digits)
}

/** Ground rising 1 in 10 to the north (up the drive), level east to west: RL 80.00 at the street. */
const north: Surface = { cell: 0.5, sample: (_x, y) => 80 + 0.1 * y }

/** A 0.25 m grid over the block from a level at each point. */
function gridOf(z: (x: number, y: number) => number): Heightfield {
  const cell = 0.25
  const x0 = -1.125
  const y0 = -1.125
  const nx = 90
  const ny = 170
  const out = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out[j * nx + i] = z(x0 + i * cell, y0 + j * cell)
  return new Heightfield(x0, y0, cell, nx, ny, out)
}

/** The cut and fill with the house pad and the drive graded in. */
function graded(plan: Plan, natural: Heightfield) {
  const platforms = [...earthworksPlatforms(plan, origin), ...drivewayPlatforms(plan, origin, boundary)]
  const prep = prepareEarthworks(natural, boundary, platforms, earthworksOf(plan))
  const result = evaluateEarthworks(prep)
  return { prep, result, platforms, ground: driveGround({ prep, result }, natural) }
}

describe('a drive wider than it is long (a double garage’s)', () => {
  // 7 m wide and 6.1 m long, from the garage's south wall to the street: on the block x 6.5..13.5, y 0..6.1.
  const pts: Vec2[] = [
    [1.5, -6.1],
    [8.5, -6.1],
    [8.5, 0],
    [1.5, 0],
  ]
  const { plan, area } = site(6.1, pts)
  const ends = driveEndPoints(plan, area, origin, boundary)!

  it('runs from the garage out to the street, not along its width', () => {
    expect(ends.crosswise).toBe(true)
    close(ends.garage, [10, 6.1])
    close(ends.street, [10, 0])
    expect(ends.length).toBeCloseTo(6.1, 6)
    expect(ends.atHouse).toBe(true)
    // The outline's long side runs east to west: what it used to be measured along.
    const old = driveEnds(ends.poly)!
    expect(old.length).toBeCloseTo(7, 6)
    expect(Math.abs(old.u[0])).toBeCloseTo(1, 6)
  })

  it('reads the grade up the drive and no tilt across it, where it used to read level with a 10% cross-fall', () => {
    const now = drivewayGrade(north, ends.poly, undefined, ends.along)!
    expect(now.average).toBeCloseTo(0.1, 6)
    expect(now.steepest).toBeCloseTo(0.1, 6)
    expect(now.crossFall).toBeCloseTo(0, 6)
    expect(now.length).toBeCloseTo(6.1, 6)
    const sideways = drivewayGrade(north, ends.poly)!
    expect(sideways.average).toBeCloseTo(0, 6)
    expect(sideways.crossFall).toBeCloseTo(0.1, 6)
  })

  it('is as wide as its garage edge', () => {
    const w = driveWidth(ends.poly, ends.along)!
    expect(w.min).toBeCloseTo(7, 6)
    expect(w.max).toBeCloseTo(7, 6)
  })

  it('ramps the cut and fill from the garage slab down to the street end, level across', () => {
    const typed = site(6.1, pts, { drive: { street: { rl: 80.6, from: 'typed' }, garage: 'slab' } })
    const g = graded(typed.plan, gridOf(north.sample))
    const ramp = g.platforms.find(p => p.id === 'drive')!.ramp!
    // Along the drive: from one end's middle to the other's, north to south.
    expect(Math.abs(ramp.u[1])).toBeCloseTo(1, 6)
    const d = driveDesign(typed.plan, typed.area, driveEndPoints(typed.plan, typed.area, origin, boundary)!, g.ground)!
    expect(d.garage).toBe(84)
    expect(d.street).toBe(80.6)
    expect(d.grade.length).toBeCloseTo(6.1, 6)
    // Half way down the drive the ground is half way between its levels, the same right across.
    const mid = (x: number) => g.result.grid.sample(x, 3.125)
    expect(mid(7.125)).toBeCloseTo(mid(12.875), 3)
    expect(mid(10.125)).toBeCloseTo(80.6 + (3.4 * 3.125) / 6.1, 2)
  })

  it('keeps its footpath crossing once it has a garage level', () => {
    for (const drive of [undefined, { garage: 'slab' as const }, { garage: 83.5 }]) {
      const s = site(6.1, pts, drive ? { drive } : {})
      const [line] = driveLines(s.plan, origin, boundary, driveGround(null, north), { frontEdge: 0 })
      expect(line.why).toBeUndefined()
      close(line.boundary!, [10, 0])
      expect(line.width.street).toBeCloseTo(7, 6)
      expect(line.along[line.along.length - 1].x).toBeCloseTo(6.1, 4)
    }
  })

  it('turns its ends round with Swap ends, and nothing else', () => {
    const s = site(6.1, pts, { swapEnds: true })
    const e = driveEndPoints(s.plan, s.area, origin, boundary)!
    close(e.garage, [10, 0])
    close(e.street, [10, 6.1])
    expect(e.along).toEqual(ends.along)
    expect(e.length).toBeCloseTo(6.1, 6)
  })

  it('follows a garage door on its outline when its ends alone would get it wrong, and can be turned by hand', () => {
    // 7 m wide and 5 m long, stopping 7 m short of the street and 1.5 m from the west boundary:
    // its ends say it runs to that boundary; the garage door says it runs out towards the street.
    const stub: Vec2[] = [
      [-3.5, -5],
      [3.5, -5],
      [3.5, 0],
      [-3.5, 0],
    ]
    const bare = site(12, stub)
    expect(driveEndPoints(bare.plan, bare.area, origin, boundary)!.crosswise).toBe(false)
    const doored = site(12, stub, {}, { wall: 0, offset: 2, width: 2.7 })
    const e = driveEndPoints(doored.plan, doored.area, origin, boundary)!
    expect(e.crosswise).toBe(true)
    close(e.garage, [5, 12])
    close(e.street, [5, 7])
    // With no door drawn, Turn it does the same by hand.
    const turned = site(12, stub, { turned: true })
    const t = driveEndPoints(turned.plan, turned.area, origin, boundary)!
    close(t.garage, [5, 12])
    close(t.street, [5, 7])
  })
})

describe('a long, thin drive', () => {
  // 4 m wide and 10 m long from the house's south wall: the fixture the driveway tests have always used.
  const pts: Vec2[] = [
    [2, -10],
    [6, -10],
    [6, 0],
    [2, 0],
  ]
  const { plan, area } = site(22, pts)
  const ends = driveEndPoints(plan, area, origin, boundary)!
  /** Lumpy ground, so the grades depend on exactly where they are sampled. */
  const lumpy: Surface = { cell: 0.5, sample: (x, y) => 80 + 0.1 * y + 0.04 * x + 0.3 * Math.sin(y / 1.7) + 0.2 * Math.cos(x / 2.3) }

  it('reads exactly as it did: the same ends, length, grades, cross-fall and width', () => {
    expect(ends.crosswise).toBe(false)
    const old = driveEnds(ends.poly)!
    expect(ends.along).toEqual(old.u)
    expect(driveEnds(ends.poly, ends.along)).toEqual(old)
    close(ends.garage, [9, 22])
    close(ends.street, [9, 12])
    expect(ends.length).toBe(old.length)
    expect(drivewayGrade(lumpy, ends.poly, undefined, ends.along)).toEqual(drivewayGrade(lumpy, ends.poly))
    expect(driveWidth(ends.poly, ends.along)).toEqual(driveWidth(ends.poly))
  })

  it('stays lengthwise beside the house, even past a wide opening in the wall it runs along', () => {
    // 3 m wide down the house's west side, from 3 m past its back wall out to the street 6 m in front.
    const side: Vec2[] = [
      [-3.2, -6],
      [-0.2, -6],
      [-0.2, 11],
      [-3.2, 11],
    ]
    const s = site(6, side, {}, { wall: 3, offset: 4, width: 2.4 })
    const e = driveEndPoints(s.plan, s.area, origin, boundary)!
    expect(e.crosswise).toBe(false)
    expect(e.length).toBeCloseTo(17, 6)
    close(e.street, [3.3, 0])
  })
})

describe('a drive that leaves the garage at an angle', () => {
  // 4 m wide at the garage and at the street, 6.1 m apart, slanting 3 m to the east on the way.
  const pts: Vec2[] = [
    [5, -6.1],
    [9, -6.1],
    [6, 0],
    [2, 0],
  ]
  const { plan, area } = site(6.1, pts)
  const ends = driveEndPoints(plan, area, origin, boundary)!

  it('runs square to its two ends, from the middle of the garage edge to the middle of the street edge', () => {
    close(ends.garage, [9, 6.1])
    close(ends.street, [12, 0])
    expect(ends.length).toBeCloseTo(6.1, 6)
    expect(Math.abs(ends.along[1])).toBeCloseTo(1, 6)
    expect(ends.atHouse).toBe(true)
    const w = driveWidth(ends.poly, ends.along)!
    expect(w.min).toBeCloseTo(4, 3)
    expect(w.max).toBeCloseTo(4, 3)
  })

  it('reads the fall between its ends, with no false tilt across', () => {
    const g = drivewayGrade(north, ends.poly, undefined, ends.along)!
    expect(g.average).toBeCloseTo(0.1, 6)
    expect(g.crossFall).toBeCloseTo(0, 6)
  })

  it('meets the garage level right across the door, and reaches the street', () => {
    const s = site(6.1, pts, { drive: { street: { rl: 80.6, from: 'typed' }, garage: 'slab' } })
    const g = graded(s.plan, gridOf(north.sample))
    // Just inside the street end the ground is at the street level at both corners.
    const y = 0.125
    expect(g.result.grid.sample(10.375, y)).toBeCloseTo(g.result.grid.sample(13.625, y), 2)
    const [line] = driveLines(s.plan, origin, boundary, g.ground, { frontEdge: 0 })
    expect(line.why).toBeUndefined()
    close(line.boundary!, [12, 0], 2)
    expect(line.floor).toBe(84)
  })
})

describe('an L-shaped drive', () => {
  // Down from the garage 10 m, then 6 m east: its first leg is the longer one.
  const pts: Vec2[] = [
    [2, 0],
    [2, -10],
    [11, -10],
    [11, -7],
    [5, -7],
    [5, 0],
  ]
  const { plan, area } = site(12, pts)
  const ends = driveEndPoints(plan, area, origin, boundary)!

  it('starts at the garage and runs away from the house, along its main leg', () => {
    close(ends.garage, [8.5, 12])
    expect(ends.atHouse).toBe(true)
    // Away from the house: south.
    expect(ends.street[1]).toBeCloseTo(2, 4)
    expect(ends.length).toBeCloseTo(10, 6)
    const g = drivewayGrade(north, ends.poly, undefined, ends.along)!
    expect(g.average).toBeCloseTo(0.1, 6)
  })

  it('is graded from the garage slab to its far end', () => {
    const s = site(12, pts, { drive: { street: { rl: 80.5, from: 'typed' }, garage: 'slab' } })
    const g = graded(s.plan, gridOf(north.sample))
    const d = driveDesign(s.plan, s.area, driveEndPoints(s.plan, s.area, origin, boundary)!, g.ground)!
    expect(d.garage).toBe(84)
    expect(d.street).toBe(80.5)
    // The second leg, level with the far end of the first, is all at the street level.
    expect(g.result.grid.sample(14.125, 3.375)).toBeCloseTo(80.5 + (3.5 * 1.375) / 10, 1)
  })
})

describe('a drive with no house drawn yet', () => {
  it('runs to the nearest side of the block, wide or long', () => {
    const plan: Plan = { ...emptyPlan({ e: 1000, n: 2000, rotation: 0, ffl: 84 }) }
    // 7 m wide and 5 m long against the south boundary.
    const wide: Area = { id: 'd', level: L, name: 'Driveway', kind: 'driveway', pts: [[6, 0.5], [13, 0.5], [13, 5.5], [6, 5.5]] }
    const e = driveEndPoints(plan, wide, origin, boundary)!
    expect(e.crosswise).toBe(true)
    close(e.street, [9.5, 0.5])
    close(e.garage, [9.5, 5.5])
    expect(e.atHouse).toBe(false)
    expect(wide.pts.map(p => toSite(p, plan.placement, origin))).toEqual(e.poly)
  })
})
