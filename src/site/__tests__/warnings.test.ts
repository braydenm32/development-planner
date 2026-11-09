import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { Heightfield } from '../../lib/terrain'
import { emptyPlan, type AreaKind, type Plan, type Wall } from '../../plan/model'
import type { SiteFeature } from '../model'
import { clipToBoundary, linePartsOnBlock, nearBlock } from '../shape'
import { circlePolygon, levelChanges, overlapArea, siteWarnings, splitPercents, srzRadius, tpzRadius } from '../warnings'

const ORIGIN: Vec2 = [1000, 2000]
// The house frame on the survey's local frame, so plan coordinates are local ones.
const placement = { e: ORIGIN[0], n: ORIGIN[1], rotation: 0, ffl: 80 }

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

function planWith(areas: { kind: AreaKind; pts: Vec2[] }[]): Plan {
  const plan = emptyPlan(placement)
  return { ...plan, areas: areas.map((a, i) => ({ id: `a${i}`, level: 'level_ground', name: '', kind: a.kind, pts: a.pts })) }
}

const tree = (trunk: number, extra: Partial<SiteFeature> = {}): SiteFeature => ({
  id: 't1',
  type: 'tree',
  source: 'trace',
  label: 'T1',
  geom: { kind: 'point', at: [0, 0] },
  trunk,
  canopy: 6,
  height: 8,
  ...extra,
})

/** Area of a circle of radius r beyond a chord d from its centre. */
const segment = (r: number, d: number) => r * r * Math.acos(d / r) - d * Math.sqrt(r * r - d * d)

describe('tree zones (AS 4970 rules of thumb)', () => {
  it('sizes the protection and structural root zones from the trunk', () => {
    expect(tpzRadius(0.5)).toBe(6)
    expect(tpzRadius(0.1)).toBe(2) // at least 2 m
    expect(tpzRadius(2)).toBe(15) // at most 15 m
    // (0.5 × 50)^0.42 × 0.64
    expect(srzRadius(0.5)).toBeCloseTo(Math.pow(25, 0.42) * 0.64, 6)
    expect(srzRadius(0.5)).toBeCloseTo(2.474, 2)
    expect(srzRadius(0.05)).toBe(1.5) // at least 1.5 m
  })

  it('measures an overlap exactly, against the circular segment worked by hand', () => {
    const zone = circlePolygon([0, 0], 6)
    // 36·acos(2/3) − 4·√20 = 12.39 m²
    expect(Math.abs(overlapArea(zone, [rect(4, -10, 20, 10)]) - segment(6, 4))).toBeLessThan(0.05)
    // Overlapping works count once.
    expect(Math.abs(overlapArea(zone, [rect(4, -10, 20, 10), rect(4, -10, 20, 0)]) - segment(6, 4))).toBeLessThan(0.05)
    expect(overlapArea(zone, [rect(7, -1, 9, 1)])).toBe(0)
  })

  it('warns when works cover more than 10% of the zone', () => {
    const [w] = siteWarnings(planWith([{ kind: 'slab', pts: rect(4, -10, 20, 10) }]), [tree(0.5)], ORIGIN)
    expect(w.kind).toBe('tree')
    expect(w.severity).toBe('attn')
    // 12.39 / 113.1 = 10.96%
    expect(w.share!).toBeCloseTo(segment(6, 4) / (Math.PI * 36), 2)
    expect(w.srz).toBe(false)
    expect(w.text).toBe("Tree T1's root zone · 11% (slab)")
    expect(w.detail).toMatch(/arborist and council/)
  })

  it('only notes a small encroachment that keeps clear of the structural root zone', () => {
    const [w] = siteWarnings(planWith([{ kind: 'driveway', pts: rect(5, -10, 20, 10) }]), [tree(0.5)], ORIGIN)
    expect(w.severity).toBe('note')
    // 4.50 / 113.1 = 3.98%
    expect(w.share!).toBeCloseTo(segment(6, 5) / (Math.PI * 36), 2)
    expect(w.text).toContain('4%')
  })

  it('warns about anything in the structural root zone, however small', () => {
    const [w] = siteWarnings(planWith([{ kind: 'deck', pts: rect(2.2, -0.25, 2.7, 0.25) }]), [tree(0.5)], ORIGIN)
    expect(w.severity).toBe('attn')
    expect(w.srz).toBe(true)
    expect(w.share!).toBeLessThan(0.01)
  })

  it('counts cut and fill as works in the zone', () => {
    // Flat ground, raised 0.5 m east of x = 4 (grid nodes every 0.5 m from −10 to 10).
    const n = 41
    const flat = new Heightfield(-10, -10, 0.5, n, n, new Float32Array(n * n))
    const z = new Float32Array(n * n)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = -10 + i * 0.5 >= 4 ? 0.5 : 0
    const raised = new Heightfield(-10, -10, 0.5, n, n, z)
    expect(levelChanges(flat, raised, { minX: -6, minY: -6, maxX: 6, maxY: 6 }).length).toBeGreaterThan(0)
    const [w] = siteWarnings(planWith([]), [tree(0.5)], ORIGIN, { natural: flat, finished: raised })
    expect(w.works).toBe('Cut and fill')
    // Cells from x = 3.75: the segment beyond 3.75 m.
    expect(w.share!).toBeCloseTo(segment(6, 3.75) / (Math.PI * 36), 2)
  })

  it("splits a tree's share between the house and the cut and fill, counting the house's ground once", () => {
    // A house of 200 mm walls on the centre lines x = 4 to 12, y = −10 to 10: its outside face is x = 3.9.
    const walls: Wall[] = rect(4, -10, 12, 10).map((a, i, r) => ({ id: `w${i}`, level: 'level_ground', a, b: r[(i + 1) % 4], thickness: 0.2, kind: 'external' }))
    const plan: Plan = { ...emptyPlan(placement), walls }
    // The ground raised 0.5 m east of x = 2 (grid nodes every 0.5 m), so cut and fill from x = 1.75, under the house too.
    const n = 41
    const flat = new Heightfield(-10, -10, 0.5, n, n, new Float32Array(n * n))
    const z = new Float32Array(n * n)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = -10 + i * 0.5 >= 2 ? 0.5 : 0
    const raised = new Heightfield(-10, -10, 0.5, n, n, z)
    const [w] = siteWarnings(plan, [tree(0.5)], ORIGIN, { natural: flat, finished: raised })

    // By hand: the zone is a 6 m circle, 113.1 m². The house covers the segment beyond 3.9 m,
    // 36·acos(0.65) − 3.9·√20.79 = 13.29 m² (11.8%); the cut and fill reaches to 1.75 m,
    // 36·acos(1.75/6) − 1.75·√32.94 = 35.85 m² (31.7%), of which 22.56 m² (19.9%) is beyond the house.
    const zone = Math.PI * 36
    expect(segment(6, 3.9)).toBeCloseTo(13.29, 1)
    expect(segment(6, 1.75)).toBeCloseTo(35.85, 1)
    expect(w.share!).toBeCloseTo(segment(6, 1.75) / zone, 2)
    expect(w.parts!.map(p => p.works)).toEqual(['The house', 'Cut and fill'])
    expect(w.parts![0].share).toBeCloseTo(segment(6, 3.9) / zone, 2)
    expect(w.parts![1].share).toBeCloseTo((segment(6, 1.75) - segment(6, 3.9)) / zone, 2)
    expect(w.parts![0].share + w.parts![1].share).toBeCloseTo(w.share!, 9)
    // 31.7% → 32%, split 11.8 : 19.9 → 12% and 20%, which add up to it.
    expect(w.text).toBe("Tree T1's root zone · 32% (house 12%, cut and fill 20%)")
    expect(w.severity).toBe('attn')
    expect(w.works).toBe('The house and cut and fill')
    expect(w.detail).toContain('In the zone: house 13 m², cut and fill another 23 m²; 32% of it in all.')
    expect(w.neighbour).toBe(false)
  })

  it("names the neighbours' trees, and a tree with no label", () => {
    const plan = planWith([{ kind: 'slab', pts: rect(1, -10, 20, 10) }])
    const block = rect(0, -20, 30, 20)
    // The trunk 1 m outside the block, its zone reaching the slab 1 m inside.
    const [next] = siteWarnings(plan, [tree(0.5, { geom: { kind: 'point', at: [-1, 0] } })], ORIGIN, null, block)
    expect(next.neighbour).toBe(true)
    expect(next.text).toMatch(/^Neighbour's tree T1's root zone · \d+% \(slab\)$/)
    expect(next.detail).toContain("neighbour's tree")
    // Inside the block, with no label.
    const [mine] = siteWarnings(plan, [tree(0.5, { label: undefined, geom: { kind: 'point', at: [3, 0] } })], ORIGIN, null, block)
    expect(mine.neighbour).toBe(false)
    expect(mine.text).toMatch(/^A tree's root zone · /)
    const [theirs] = siteWarnings(plan, [tree(0.5, { label: undefined, geom: { kind: 'point', at: [-1, 0] } })], ORIGIN, null, block)
    expect(theirs.text).toMatch(/^A neighbour's tree's root zone · /)
    // With no boundary to go by, every tree is taken as yours.
    expect(siteWarnings(plan, [tree(0.5, { geom: { kind: 'point', at: [-1, 0] } })], ORIGIN)[0].neighbour).toBe(false)
  })

  it('rounds the parts of a share so they add up to it', () => {
    expect(splitPercents(0.72, [0.31, 0.41])).toEqual([31, 41])
    expect(splitPercents(0.317, [0.1175, 0.1995])).toEqual([12, 20])
    // 3 × 33.3% of 100%: the remainder goes to the first
    expect(splitPercents(1, [1 / 3, 1 / 3, 1 / 3])).toEqual([34, 33, 33])
    // a sliver rounds to nothing; the text says "under 1%"
    expect(splitPercents(0.05, [0.049, 0.001])).toEqual([5, 0])
    // never less than 1% in all
    expect(splitPercents(0.002, [0.002])).toEqual([1])
  })

  it('leaves trees to be removed, and trees clear of the works, alone', () => {
    const plan = planWith([{ kind: 'slab', pts: rect(4, -10, 20, 10) }])
    expect(siteWarnings(plan, [tree(0.5, { remove: true })], ORIGIN)).toEqual([])
    expect(siteWarnings(plan, [tree(0.2)], ORIGIN)).toEqual([]) // 2.4 m zone
  })
})

describe('easements', () => {
  it('warns when a driveway is on an easement, with the area it covers', () => {
    const easement: SiteFeature = { id: 'e1', type: 'easement', source: 'pdf', label: '(B)', purpose: 'Drainage of water', width: 2, geom: { kind: 'area', pts: rect(10, -10, 12, 10) } }
    const [w] = siteWarnings(planWith([{ kind: 'driveway', pts: rect(8, 0, 11, 5) }]), [easement], ORIGIN)
    expect(w.kind).toBe('easement')
    expect(w.severity).toBe('attn')
    expect(w.overlap).toBeCloseTo(5)
    expect(w.text).toBe('Driveway on easement (B)')
    expect(w.detail).toMatch(/5\.0 m² of easement \(b\) \(Drainage of water, 2 m wide\).*Check with council/)
  })

  it('gives one warning for all the works on an easement, counting overlaps once', () => {
    const easement: SiteFeature = { id: 'e1', type: 'easement', source: 'pdf', label: '(B)', geom: { kind: 'area', pts: rect(10, -10, 12, 10) } }
    const plan = planWith([
      { kind: 'driveway', pts: rect(8, 0, 11, 5) },
      { kind: 'slab', pts: rect(8, 3, 13, 6) },
    ])
    const ws = siteWarnings(plan, [easement], ORIGIN)
    expect(ws).toHaveLength(1)
    expect(ws[0].text).toBe('Slab and driveway on easement (B)')
    // 1 × 5 under the driveway, 2 × 3 under the slab, 1 × 2 under both: 9 m².
    expect(ws[0].overlap).toBeCloseTo(9)
    expect(ws[0].detail).toContain('(slab 6.0 m², driveway 5.0 m²)')
  })

  it('says nothing when the works keep off it', () => {
    const easement: SiteFeature = { id: 'e1', type: 'easement', source: 'pdf', geom: { kind: 'area', pts: rect(10, -10, 12, 10) } }
    expect(siteWarnings(planWith([{ kind: 'slab', pts: rect(0, 0, 9, 5) }]), [easement], ORIGIN)).toEqual([])
  })
})

describe('features near the block', () => {
  const block = rect(0, 0, 20, 30)
  it('clips an area to a convex block', () => {
    const part = clipToBoundary(rect(15, -5, 25, 10), block)!
    expect(part).not.toBeNull()
    const xs = part.map(p => p[0])
    expect(Math.max(...xs)).toBeCloseTo(20)
    expect(clipToBoundary(rect(30, 0, 40, 5), block)).toBeNull()
  })

  it('keeps what reaches the block, a tree by its canopy', () => {
    const t = (x: number, canopy: number): SiteFeature => ({ id: 't', type: 'tree', source: 'trace', geom: { kind: 'point', at: [x, 10] }, canopy })
    expect(nearBlock(t(10, 6), block)).toBe(true)
    expect(nearBlock(t(24, 8), block)).toBe(true) // 4 m out, 4 m canopy radius
    expect(nearBlock(t(30, 4), block)).toBe(false)
    const fence: SiteFeature = { id: 'f', type: 'fence', source: 'trace', geom: { kind: 'line', pts: [[-5, 30.5], [25, 30.5]] } }
    expect(nearBlock(fence, block)).toBe(true)
  })

  it('trims a line to the block, keeping a fence on the boundary whole', () => {
    const [across] = linePartsOnBlock([[-10, 10], [30, 10]], block)
    expect(across[0][0]).toBeCloseTo(-0.25)
    expect(across[across.length - 1][0]).toBeCloseTo(20.25)
    const onEdge = linePartsOnBlock([[0, 30.1], [20, 30.1], [20, 40]], block)
    expect(onEdge).toHaveLength(1)
    expect(onEdge[0][0]).toEqual([0, 30.1])
    expect(onEdge[0][onEdge[0].length - 1]).toEqual([20, 30.1])
    expect(linePartsOnBlock([[30, 0], [40, 10]], block)).toEqual([])
  })
})
