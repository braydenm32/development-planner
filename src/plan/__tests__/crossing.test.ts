import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { B85, B99 } from '../../checks/crossing'
import { driveLines, driveProfile, gradeBreaks, kerbFromBoundary, kerbPoint, levelAt, scrapeAlong, simplify, turnIn, type CrossingShape } from '../crossing'
import { driveGround } from '../driveway'
import { emptyPlan, type Area, type DriveLevels, type Plan } from '../model'
import { addRoom, addWall } from '../ops'

// A made-up crossing: a 3.5 m footpath, a level 450 mm kerb break then 1.52 m at 1 in 8 up from
// the gutter, and 1 in 40 across the rest of the footpath.
const SHAPE: CrossingShape = {
  footpath: 3.5,
  ramp: [
    { length: 0.45, grade: 0 },
    { length: 1.52, grade: 0.125 },
  ],
  fall: 0.025,
  road: 0.03,
}

/** A drive `run` m long falling `grade` from the garage at `top`, sampled every 0.25 m. */
const straight = (run: number, top: number, grade: number) => Array.from({ length: Math.round(run / 0.25) + 1 }, (_, k) => ({ x: k * 0.25, z: top - k * 0.25 * grade }))

describe('the long section', () => {
  it('runs from the garage down the drive, across the footpath and down the layback to the gutter', () => {
    // 12 m at 1 in 6 from RL 45.50 to RL 43.50 at the boundary; the kerb at RL 43.25.
    const p = driveProfile(straight(12, 45.5, 1 / 6), 43.25, SHAPE)
    expect(p.points.map(q => q.mark ?? '')).toEqual(['garage', 'boundary', 'layback', '', 'gutter'])
    expect(p.boundary).toBeCloseTo(12, 9)
    expect(p.gutter).toBeCloseTo(15.5, 9)
    // The layback rises 1.52 × 0.125 = 0.19 m in its last 1.97 m: its top at RL 43.44, 1.53 m from the boundary.
    const top = p.points[2]
    expect(top.x).toBeCloseTo(13.53, 6)
    expect(top.z).toBeCloseTo(43.44, 6)
    expect(p.footpathFall).toBeCloseTo(0.06 / 1.53, 6)
    expect(p.points[0]).toMatchObject({ x: 0, z: 45.5 })
  })

  it('finds the changes of grade: a summit off the garage floor and a sag onto the footpath', () => {
    const p = driveProfile(straight(12, 45.5, 1 / 6), 43.25, SHAPE)
    const b = gradeBreaks(p)
    expect(b.map(x => [x.mark, x.kind])).toEqual([
      ['garage', 'summit'],
      ['boundary', 'sag'],
    ])
    expect(b[0].change).toBeCloseTo(1 / 6, 6)
    expect(b[1].change).toBeCloseTo(1 / 6 - 0.06 / 1.53, 6)
  })

  it('keeps only the changes of grade from the ground along the drive', () => {
    // Level for 4 m, then 1 in 5: two stretches.
    const along = Array.from({ length: 41 }, (_, k) => ({ x: k * 0.25, z: k * 0.25 <= 4 ? 50 : 50 - (k * 0.25 - 4) * 0.2 }))
    expect(simplify(along).map(q => q.x)).toEqual([0, 4, 10])
  })

  it('works the kerb out from a level at the boundary down a standard crossing', () => {
    const kerb = kerbFromBoundary(43.5, SHAPE)
    expect(kerb).toBeCloseTo(43.5 - 0.025 * 1.53 - 0.19, 6)
    expect(driveProfile(straight(12, 45.5, 1 / 6), kerb, SHAPE).footpathFall).toBeCloseTo(0.025, 6)
  })

  it('has the garage floor level behind the drive and the road rising past the gutter', () => {
    const p = driveProfile(straight(12, 45.5, 1 / 6), 43.25, SHAPE)
    expect(levelAt(p, 0.03, -2)).toBe(45.5)
    expect(levelAt(p, 0.03, p.gutter + 2)).toBeCloseTo(43.31, 6)
  })
})

describe('the ground clearance template', () => {
  it('clears a gentle drive onto a standard crossing', () => {
    const p = driveProfile(straight(12, 44, 0.04), kerbFromBoundary(43.52, SHAPE), SHAPE)
    const s = scrapeAlong(p, B99, 0.03)
    expect(s.clearance).toBeGreaterThan(0)
  })

  it('scrapes between the wheels at a sharp summit, and says where', () => {
    // Level for 6 m from the garage, then falling 1 in 4 to the boundary: a 25% summit 6 m in.
    const along = Array.from({ length: 49 }, (_, k) => ({ x: k * 0.25, z: k * 0.25 <= 6 ? 45 : 45 - (k * 0.25 - 6) * 0.25 }))
    const p = driveProfile(along, kerbFromBoundary(43.5, SHAPE), SHAPE)
    const s = scrapeAlong(p, B99, 0.03)
    expect(s.clearance).toBeLessThan(-0.02)
    expect(s.part).toBe('middle')
    expect(Math.abs(s.x - 6)).toBeLessThan(0.3)
  })

  it('scrapes a bumper in the dip at the gutter when the layback is steep', () => {
    const steep: CrossingShape = { ...SHAPE, ramp: [{ length: 1.5, grade: 0.3 }] }
    const p = driveProfile(straight(10, 44, 0.02), kerbFromBoundary(43.8, steep), steep)
    const s = scrapeAlong(p, B99, 0.03)
    expect(s.clearance).toBeLessThan(0)
    expect(s.part).not.toBe('middle')
    expect(s.x).toBeGreaterThan(p.boundary)
  })
})

describe('turning in from the road', () => {
  it('fits a B85 through a 5.6 m crossing at the kerb, starting close to the kerb', () => {
    const t = turnIn(B85, { kerbHalf: 2.8, boundaryHalf: 1.5, footpath: 3.5 })
    expect(t.fits).toBe(true)
    // The 11.5 m turning circle at the outer front corner puts the rear axle on about a 3.37 m radius.
    expect(t.axle).toBeCloseTo(3.365, 2)
    expect(t.inner).toBeLessThanOrEqual(2.8)
    expect(t.road).toBeCloseTo(2.4, 1)
  })

  it('swings wider for a narrow crossing, so it needs more of the road', () => {
    const wide = turnIn(B85, { kerbHalf: 2.8, boundaryHalf: 1.5, footpath: 3.5 })
    const narrow = turnIn(B85, { kerbHalf: 1.5, boundaryHalf: 1.5, footpath: 3.5 })
    expect(narrow.fits).toBe(true)
    expect(narrow.inner).toBeLessThanOrEqual(1.5 + 1e-6)
    expect(narrow.road).toBeGreaterThan(wide.road)
  })

  it('can’t fit a crossing narrower than the car', () => {
    expect(turnIn(B85, { kerbHalf: 0.9, boundaryHalf: 1.5, footpath: 3.5 }).fits).toBe(false)
    expect(turnIn(B85, { kerbHalf: 2.8, boundaryHalf: 0.9, footpath: 3.5 }).fits).toBe(false)
  })
})

// A 20 m by 40 m block (origin 1000, 2000), the street on the south side (edge 0), ground rising
// 1 in 10 to the north from RL 80.00. A 10 m by 8 m house set 22 m back, its floor at RL 84.00.
const origin: Vec2 = [1000, 2000]
const boundary: Vec2[] = [
  [0, 0],
  [20, 0],
  [20, 40],
  [0, 40],
]
const L = 'level_ground'
const ground = { cell: 0.5, sample: (_x: number, y: number) => 80 + 0.1 * y }

function block(pts: Vec2[], drive?: DriveLevels): Plan {
  let plan = emptyPlan({ e: 1005, n: 2022, rotation: 0, ffl: 84 })
  const c: Vec2[] = [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ]
  for (let i = 0; i < 4; i++) plan = addWall(plan, L, c[i], c[(i + 1) % 4], { kind: 'external', thickness: 0.27 })
  plan = addRoom(plan, L, [5, 4], 'Garage')
  const area: Area = { id: 'drive', level: L, name: 'Driveway', kind: 'driveway', pts, ...(drive ? { drive } : {}) }
  return { ...plan, areas: [area] }
}

describe('a drive on the plan', () => {
  // House frame x 2..6 from the house's south wall (y 0) down to y −21.5, 0.5 m short of the street.
  const pts: Vec2[] = [
    [2, -21.5],
    [6, -21.5],
    [6, 0],
    [2, 0],
  ]

  it('runs its centreline out to the street boundary and reads the ground along it', () => {
    const [line] = driveLines(block(pts), origin, boundary, driveGround(null, ground), { frontEdge: 0, natural: p => ground.sample(p[0], p[1]) })
    expect(line.why).toBeUndefined()
    expect(line.boundary![1]).toBeCloseTo(0, 6)
    expect(line.boundary![0]).toBeCloseTo(9, 6)
    expect(line.out![1]).toBeCloseTo(-1, 6)
    expect(line.natural).toBeCloseTo(80, 6)
    expect(line.width.min).toBeCloseTo(4, 6)
    expect(kerbPoint(line, 3.5)![1]).toBeCloseTo(-3.5, 6)
    // Following the ground, it starts past the house pad's margin, and the floor isn't known.
    expect(line.floor).toBeNull()
    expect(line.along[0].x).toBe(0)
    expect(line.along[line.along.length - 1].z).toBeCloseTo(80, 6)
  })

  it('starts at the garage floor when the drive is built to the slab', () => {
    const [line] = driveLines(block(pts, { garage: 'slab' }), origin, boundary, driveGround(null, ground), { frontEdge: 0 })
    expect(line.floor).toBe(84)
    expect(line.along[0]).toEqual({ x: 0, z: 84 })
  })

  it('finds the street side from the drive when none is set, and says it guessed', () => {
    const [line] = driveLines(block(pts), origin, boundary, driveGround(null, ground))
    expect(line.edge).toBe(0)
    expect(line.guessed).toBe(true)
  })

  it('doesn’t reach the street when the street side is elsewhere, or on a battle-axe lot', () => {
    expect(driveLines(block(pts), origin, boundary, driveGround(null, ground), { frontEdge: 2 })[0].why).toBe('not-to-street')
    expect(driveLines(block(pts), origin, boundary, driveGround(null, ground), { frontEdge: 0, battleAxe: true })[0].why).toBe('battle-axe')
  })

  it('has nothing to say about a plan without a driveway', () => {
    const plan = { ...block(pts), areas: [] }
    expect(driveLines(plan, origin, boundary, driveGround(null, ground), { frontEdge: 0 })).toEqual([])
  })
})

describe('a drive on an upper split level', () => {
  const pts: Vec2[] = [
    [2, -21.5],
    [6, -21.5],
    [6, 0],
    [2, 0],
  ]
  /** The garage and drive on the upper level of a made-up split level, with a lower wing 1.5 m down behind them. */
  const split = (plan: Plan): Plan => {
    const c: Vec2[] = [
      [0, 9],
      [10, 9],
      [10, 15],
      [0, 15],
    ]
    let p: Plan = { ...plan, levels: [{ id: 'level_low', name: 'Lower level', elevation: -1.5, height: 2.7 }, ...plan.levels] }
    for (let i = 0; i < 4; i++) p = addWall(p, 'level_low', c[i], c[(i + 1) % 4], { kind: 'external', thickness: 0.27 })
    return p
  }

  it('has its footpath crossing checked, with the same numbers as on the lowest level', () => {
    const opts = { frontEdge: 0, natural: (p: Vec2) => ground.sample(p[0], p[1]) }
    const flat = driveLines(block(pts, { garage: 'slab' }), origin, boundary, driveGround(null, ground), opts)
    const upper = driveLines(split(block(pts, { garage: 'slab' })), origin, boundary, driveGround(null, ground), opts)
    expect(upper).toHaveLength(1)
    expect(upper).toEqual(flat)
    expect(upper[0].floor).toBe(84)
  })
})
