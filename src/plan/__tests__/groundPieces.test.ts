// Pools and tanks in the ground or on a level base (src/plan/groundPieces.ts), on a made-up block:
// the pit an in-ground pool digs, the pad an above-ground tank stands on, and older plans' pieces
// left exactly as they were.

import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import type { Survey } from '../../lib/survey'
import { Heightfield, type Terrain } from '../../lib/terrain'
import { buildSiteSolid, isWatertight } from '../../lib/terrainMesh'
import { sectionDrawing } from '../../sections/section'
import { newFurniture } from '../furniture'
import { groundApplies, highestGround, levelsOf, meanGround, pieceRing, pieceShape, pieceSpecs } from '../groundPieces'
import { emptyPlan, normalizePlan, toSite, type Furniture, type PieceGround, type Plan } from '../model'
import { addRoom, addWall, updateFurniture } from '../ops'
import { usePlan } from '../store'
import { earthFrom, earthInputs } from '../useEarthworks'

// A made-up 20 m by 40 m block; its survey origin at (1000, 2000).
const origin: Vec2 = [1000, 2000]
const boundary: Vec2[] = [
  [0, 0],
  [20, 0],
  [20, 40],
  [0, 40],
]
const survey = { origin, boundary }
const L = 'level_ground'

/** A 0.25 m grid over the block whose nodes sit half a cell off whole and half metres, so a 7 × 3.5 m pool covers 28 × 14 nodes: 24.5 m² exactly. */
function grid(rl: (x: number, y: number) => number): Heightfield {
  const cell = 0.25
  const x0 = -1.125
  const y0 = -1.125
  const nx = 90
  const ny = 170
  const z = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = rl(x0 + i * cell, y0 + j * cell)
  return new Heightfield(x0, y0, cell, nx, ny, z)
}
const flat = grid(() => 80)
/** Rising 1 in 10 to the north. */
const slope = grid((_x, y) => 80 + 0.1 * y)

/** A 10 m by 8 m house 22 m back from the south boundary (x 5..15, y 22..30 on the block). */
function house(ffl = 82): Plan {
  let plan = emptyPlan({ e: 1005, n: 2022, rotation: 0, ffl })
  const c: Vec2[] = [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ]
  for (let i = 0; i < 4; i++) plan = addWall(plan, L, c[i], c[(i + 1) % 4], { kind: 'external', thickness: 0.27 })
  return addRoom(plan, L, [5, 4], 'Living')
}

/** The plan with a piece added at a point in the house's frame, sitting as given (none: an older plan's piece). */
function withPiece(plan: Plan, kind: string, at: Vec2, ground?: PieceGround | null): { plan: Plan; f: Furniture } {
  const made = newFurniture(kind, L, at)!
  const { ground: _default, ...bare } = made
  const f: Furniture = ground === null ? bare : { ...made, ...(ground ? { ground } : {}) }
  return { plan: { ...plan, furniture: [...plan.furniture, f] }, f }
}

const earthOf = (plan: Plan, natural: Heightfield) => earthFrom(natural, boundary, earthInputs(plan, survey))

// The pool's middle in the house frame: (5, −6), so x 6.5..13.5, y 14.25..17.75 on the block.
const POOL_AT: Vec2 = [5, -6]

describe('a pool in the ground', () => {
  it('starts in the ground and a tank on a level base; other pieces have no setting', () => {
    expect(newFurniture('pool', L, [0, 0])!.ground).toEqual({ sits: 'in' })
    expect(newFurniture('tank', L, [0, 0])!.ground).toEqual({ sits: 'above' })
    expect(newFurniture('bed-queen', L, [0, 0])!.ground).toBeUndefined()
  })

  it('digs its footprint times its depth on flat ground, with straight sides', () => {
    const { plan } = withPiece(emptyPlan({ e: 1005, n: 2022, rotation: 0, ffl: 80.3 }), 'pool', POOL_AT)
    const earth = earthOf(plan, flat)
    // 7 × 3.5 × 1.5 m: the grid's nodes fall exactly on the footprint, so it's exact.
    expect(earth.result.cut).toBeCloseTo(7 * 3.5 * 1.5, 1)
    expect(earth.result.fill).toBeCloseTo(0, 6)
    expect(earth.result.maxCut).toBeCloseTo(1.5, 3)
    // No batter: just past its edge the ground is untouched.
    expect(earth.result.grid.sample(10, 17.9)).toBeCloseTo(80, 3)
    expect(earth.result.grid.sample(10, 16)).toBeCloseTo(78.5, 3)
    // Its shell's step for the 3D ground, which doesn't stop the cut and fill.
    expect(earth.strips.filter(s => s.shell)).toHaveLength(4)
  })

  it('on a slope, takes its coping from the highest corner and digs down from the ground to its floor', () => {
    const { plan, f } = withPiece(emptyPlan({ e: 1005, n: 2022, rotation: 0, ffl: 80.3 }), 'pool', POOL_AT)
    const lv = levelsOf(plan, f, origin, slope)!
    expect(lv).toEqual({ sits: 'in', top: expect.closeTo(80 + 0.1 * 17.75, 4), floor: expect.closeTo(80 + 0.1 * 17.75 - 1.5, 4) })
    const earth = earthOf(plan, slope)
    // Mean ground under it is at y = 16: 1.325 m above the floor on average, over 24.5 m².
    expect(earth.result.cut).toBeCloseTo(24.5 * (0.1 * 16 + 80 - (81.775 - 1.5)), 1)
    expect(earth.result.fill).toBeCloseTo(0, 6)
  })

  it('stands proud of the ground on the low side when its coping is typed high: no fill', () => {
    const { plan } = withPiece(emptyPlan({ e: 1005, n: 2022, rotation: 0, ffl: 80.3 }), 'pool', POOL_AT, { sits: 'in', top: 80.5, depth: 1 })
    const earth = earthOf(plan, flat)
    expect(earth.result.cut).toBeCloseTo(24.5 * 0.5, 1)
    expect(earth.result.fill).toBeCloseTo(0, 6)
  })

  it('draws its shell from its floor to its coping, with the water a little below', () => {
    const { plan, f } = withPiece(house(), 'pool', POOL_AT)
    const lv = levelsOf(plan, f, origin, flat)!
    const shape = pieceShape(f, lv)
    expect(Math.min(...shape.solids.map(s => s.z0))).toBeCloseTo(78.5, 6)
    expect(Math.max(...shape.solids.map(s => s.z1))).toBeCloseTo(80, 6)
    expect(shape.water?.z).toBeCloseTo(79.85, 6)
  })
})

describe('a tank on a level base', () => {
  it('stands on a pad at the mean ground under it, cut on the high side and filled on the low', () => {
    const { plan, f } = withPiece(emptyPlan({ e: 1005, n: 2022, rotation: 0, ffl: 80.3 }), 'tank', [10, -10])
    const lv = levelsOf(plan, f, origin, slope)!
    const mid = toSite(f.at, plan.placement, origin)
    expect(lv.sits).toBe('above')
    if (lv.sits !== 'above') return
    expect(lv.base).toBeCloseTo(80 + 0.1 * mid[1], 2)
    const earth = earthOf(plan, slope)
    expect(earth.result.cut).toBeGreaterThan(0.2)
    expect(earth.result.fill).toBeGreaterThan(0.2)
    // The ground under it is level, at its base.
    expect(earth.result.grid.sample(mid[0], mid[1] + 0.5)).toBeCloseTo(lv.base, 3)
    expect(earth.result.grid.sample(mid[0], mid[1] - 0.5)).toBeCloseTo(lv.base, 3)
    expect(pieceShape(f, lv).solids[0].z0).toBeCloseTo(lv.base, 6)
  })

  it('in the ground, goes down its own height so its lid is at the ground', () => {
    const { plan, f } = withPiece(emptyPlan({ e: 1005, n: 2022, rotation: 0, ffl: 80.3 }), 'tank', [10, -10], { sits: 'in' })
    const lv = levelsOf(plan, f, origin, flat)!
    expect(lv).toEqual({ sits: 'in', top: expect.closeTo(80, 6), floor: expect.closeTo(77.9, 6) })
    expect(pieceShape(f, lv).solids[0].z1).toBeCloseTo(80, 6)
    const ring = pieceRing(f).map(p => toSite(p, plan.placement, origin))
    expect(highestGround(ring, slope)).toBeGreaterThan(meanGround(ring, slope))
  })
})

describe('where the ground options apply', () => {
  it('only outside the house on the lowest level', () => {
    const inside = withPiece(house(), 'pool', [5, 4])
    expect(groundApplies(inside.plan, inside.f)).toBe(false)
    expect(earthOf(inside.plan, flat).platforms.some(p => p.id?.startsWith('piece:'))).toBe(false)
    const outside = withPiece(house(), 'pool', POOL_AT)
    expect(groundApplies(outside.plan, outside.f)).toBe(true)
    const up = { ...outside.plan, levels: [...outside.plan.levels, { id: 'level_1', name: 'First floor', elevation: 3, height: 2.7 }], furniture: [{ ...outside.f, level: 'level_1' }] }
    expect(groundApplies(up, up.furniture[0])).toBe(false)
    expect(pieceSpecs(up, origin)).toEqual([])
  })
})

describe('older plans', () => {
  it('load with their pools and tanks as they were: no setting, no earthworks, nothing else changes', () => {
    const base = house()
    const { plan } = withPiece(withPiece(base, 'pool', POOL_AT, null).plan, 'tank', [10, -10], null)
    const opened = normalizePlan(JSON.parse(JSON.stringify(plan)))
    expect(opened.furniture.every(f => f.ground === undefined)).toBe(true)
    expect(pieceSpecs(opened, origin)).toEqual([])
    const a = earthOf(opened, slope)
    const b = earthOf(base, slope)
    expect(a.result.cut).toBe(b.result.cut)
    expect(a.result.fill).toBe(b.result.fill)
    expect(a.platforms).toEqual(b.platforms)
  })

  it('keeps a setting through saving and opening again', () => {
    const { plan } = withPiece(house(), 'pool', POOL_AT, { sits: 'in', depth: 1.8, top: 81.2 })
    expect(normalizePlan(JSON.parse(JSON.stringify(plan))).furniture[0].ground).toEqual({ sits: 'in', depth: 1.8, top: 81.2 })
  })
})

describe('undo', () => {
  it('takes a change of how it sits back in one step', () => {
    const { plan, f } = withPiece(house(), 'pool', POOL_AT)
    const st = usePlan.getState()
    st.load(plan)
    usePlan.getState().commit(p => updateFurniture(p, f.id, { ground: { sits: 'above' } }))
    expect(usePlan.getState().plan!.furniture[0].ground).toEqual({ sits: 'above' })
    usePlan.getState().undo()
    expect(usePlan.getState().plan!.furniture[0].ground).toEqual({ sits: 'in' })
  })
})

describe('the 3D ground and the sections', () => {
  it('keeps the ground a closed solid with the pool’s hole in it', () => {
    const { plan } = withPiece(house(), 'pool', POOL_AT)
    const earth = earthOf(plan, slope)
    const solid = buildSiteSolid(earth.result.grid, boundary, 70, earth.strips)
    expect(isWatertight(solid.indices)).toBe(true)
  })

  it('draws the pool’s shell where a section crosses it, and the hole in the finished ground', () => {
    const { plan, f } = withPiece(house(), 'pool', POOL_AT)
    const earth = earthOf(plan, flat)
    const terrain = { grid: flat } as unknown as Terrain
    // North to south through the pool's middle, in the house frame.
    const d = sectionDrawing({ id: 's', label: 'A', a: [5, -12], b: [5, 4] }, { plan, survey: survey as unknown as Survey, terrain, finished: earth.result.grid })
    const lv = levelsOf(plan, f, origin, flat)!
    const shell = d.slabs.filter(b => Math.abs(b.z0 - (lv.sits === 'in' ? lv.floor : 0)) < 1e-6)
    // Its two end walls and its floor.
    expect(shell.length).toBeGreaterThanOrEqual(3)
    expect(Math.min(...d.finished.flat().map(p => p[1]))).toBeCloseTo(78.5, 2)
  })
})
