import { describe, expect, it } from 'vitest'
import { signedArea, type Vec2 } from '../../lib/geom'
import { isWatertight } from '../../lib/terrainMesh'
import type { Roof, RoofType } from '../model'
import { addRoof } from '../ops'
import { defaultGables, levelOutlines, outlineAround, ROOF_EDGE, roofGeometry } from '../roof'
import { straightSkeleton } from '../skeleton'
import { garageFloor } from './fixtures'

const rect: Vec2[] = [
  [0, 0],
  [10, 0],
  [10, 4],
  [0, 4],
]
const L: Vec2[] = [
  [0, 0],
  [10, 0],
  [10, 4],
  [4, 4],
  [4, 10],
  [0, 10],
]
const T: Vec2[] = [
  [-1, 0],
  [1, 0],
  [1, 5],
  [5, 5],
  [5, 8],
  [-5, 8],
  [-5, 5],
  [-1, 5],
]
const U: Vec2[] = [
  [0, 0],
  [10, 0],
  [10, 8],
  [7, 8],
  [7, 3],
  [3, 3],
  [3, 8],
  [0, 8],
]

const roof = (pts: Vec2[], type: RoofType, patch: Partial<Roof> = {}): Roof => ({
  id: 'r',
  level: 'level_ground',
  pts,
  type,
  pitch: 45,
  overhang: 0,
  gables: defaultGables(pts),
  lowEdge: 0,
  ...patch,
})

/** Plan area of each face, which together must cover the outline exactly. */
function faceArea(pts: Vec2[], speeds: number[]): number {
  const s = straightSkeleton(pts, speeds)
  return s.faces.reduce((t, f) => t + signedArea(f.map(k => s.nodes[k].p)), 0)
}

describe('straight skeleton', () => {
  it('puts a hip roof ridge down the middle of a rectangle', () => {
    const s = straightSkeleton(rect, [1, 1, 1, 1])
    const inner = s.nodes.slice(4)
    expect(inner.map(n => [n.p[0], n.p[1], n.t])).toEqual(
      expect.arrayContaining([
        [2, 2, 2],
        [8, 2, 2],
      ]),
    )
    expect(inner).toHaveLength(2)
  })

  it('runs the ridge out to upright gable ends', () => {
    const s = straightSkeleton(rect, [1, 0, 1, 0])
    const inner = s.nodes.slice(4).map(n => [n.p[0], n.p[1], n.t])
    expect(inner).toEqual(
      expect.arrayContaining([
        [0, 2, 2],
        [10, 2, 2],
      ]),
    )
  })

  it.each([
    ['rectangle', rect],
    ['L', L],
    ['T', T],
    ['U', U],
  ] as const)('covers a %s shape exactly with its faces', (_, pts) => {
    expect(faceArea([...pts], pts.map(() => 1))).toBeCloseTo(signedArea([...pts]), 9)
  })

  it('meets wings of different widths with a valley', () => {
    // T: a 2 m stem meets a 3 m bar; the stem's ridge is lower than the bar's.
    const s = straightSkeleton([...T], T.map(() => 1))
    const heights = s.nodes.slice(T.length).map(n => n.t)
    expect(Math.min(...heights)).toBeCloseTo(1, 9)
    expect(Math.max(...heights)).toBeCloseTo(1.5, 9)
  })
})

describe('roofs', () => {
  it.each(['hip', 'gable', 'skillion', 'flat'] as const)('builds a closed %s roof solid', type => {
    for (const pts of [rect, L, T, U]) {
      const g = roofGeometry(roof([...pts], type, { overhang: 0.45 }))
      expect(g.error).toBeNull()
      expect(isWatertight(g.mesh.tris)).toBe(true)
    }
  })

  it('reaches the expected height for its pitch', () => {
    // 4 m wide at 45° with no overhang: ridge 2 m above the eaves.
    expect(roofGeometry(roof(rect, 'hip')).height).toBeCloseTo(2 + ROOF_EDGE, 9)
    expect(roofGeometry(roof(rect, 'gable')).height).toBeCloseTo(2 + ROOF_EDGE, 9)
    // a skillion rises across the full width from its low edge
    expect(roofGeometry(roof(rect, 'skillion', { lowEdge: 0 })).height).toBeCloseTo(4 + ROOF_EDGE, 9)
  })

  it('measures the sloping roof area', () => {
    // every face slopes at 45°, so the roof is √2 times the plan area
    expect(roofGeometry(roof(rect, 'hip')).area).toBeCloseTo(40 * Math.SQRT2, 6)
    // the overhang adds to both
    const g = roofGeometry(roof(rect, 'hip', { overhang: 0.5 }))
    expect(g.area).toBeCloseTo(11 * 5 * Math.SQRT2, 6)
  })

  it('puts gable ends on the short ends of each wing', () => {
    expect(defaultGables(rect)).toEqual([false, true, false, true])
    // L: the ends of both wings
    expect(defaultGables(L)).toEqual([false, true, false, false, true, false])
  })

  it('draws ridges and hips but not lines inside one roof plane', () => {
    const hip = roofGeometry(roof(rect, 'hip'))
    expect(hip.lines).toHaveLength(5) // ridge and four hips
    const gable = roofGeometry(roof(rect, 'gable'))
    expect(gable.lines).toHaveLength(1) // just the ridge
  })

  it('roofs the garage floor from the outside of its walls', () => {
    const plan = garageFloor()
    const outlines = levelOutlines(plan.walls)
    expect(outlines).toHaveLength(1)
    const outline = outlineAround(plan.walls, [3.8, 7])!
    // garage and east wing, out to the outside face of the walls
    expect(Math.abs(signedArea(outline))).toBeGreaterThan(70)
    const p = addRoof(plan, 'level_ground', outline, { type: 'hip', pitch: 22.5, overhang: 0.45 })
    const g = roofGeometry(p.roofs[0])
    expect(g.error).toBeNull()
    expect(isWatertight(g.mesh.tris)).toBe(true)
  })
})
