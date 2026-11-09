import { describe, expect, it } from 'vitest'
import { prepareEarthworks, type Barrier, type Platform } from '../../lib/earthworks'
import type { Vec2 } from '../../lib/geom'
import { Heightfield } from '../../lib/terrain'
import { ENGINEER_OVER, SUGGEST_RULES, suggestWalls, TALL_BATTER, WIDE_BATTER, WORKS_CLEARANCE, type SuggestInput } from '../suggest'

/** A 40 m square block on a 0.25 m grid with ground level z(x, y); its west side is edge 3. */
function block(z: (x: number, y: number) => number = () => 10) {
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

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

/** A painted area as the earthworks take it: level out to its edge, fill only or cut only. */
const painted = (id: string, ring: Vec2[], level: number, mode: 'cut' | 'fill'): Platform => ({
  id: `grade:${id}`,
  include: [ring],
  exclude: [],
  level,
  fill: mode === 'fill',
  ...(mode === 'fill' ? { cut: false } : {}),
  margin: 0,
  soft: true,
  fixed: true,
})

function suggest(platforms: Platform[], o: { z?: (x: number, y: number) => number; batter?: number; counted?: number[]; barriers?: Barrier[]; trees?: SuggestInput['trees'] } = {}) {
  const { grid, boundary } = block(o.z)
  const b = o.batter ?? 2
  const prep = prepareEarthworks(grid, boundary, platforms, { margin: 0.5, cutBatter: b, fillBatter: b }, o.barriers ?? [])
  return suggestWalls({
    prep,
    boundary,
    counted: o.counted ?? [0, 1, 2, 3],
    barriers: o.barriers ?? [],
    trees: o.trees ?? [],
    sources: platforms.map(p => p.id!),
    family: p => p.id ?? null,
    label: () => 'other painted ground',
  })
}

describe('retaining wall suggestions', () => {
  it('keeps every rule and its reason as data', () => {
    expect(SUGGEST_RULES.map(r => r.id)).toEqual(['boundary', 'clearance', 'room', 'tall', 'wide'])
    for (const r of SUGGEST_RULES) expect(r.why({ kind: 'fill', wall: 0.9, edge: 'east', what: 'the house', height: 1.4, width: 3.5 })).toMatch(/0\.9 m wall/)
    expect(SUGGEST_RULES[0].why({ kind: 'fill', wall: 0.86, edge: 'east' })).toBe('Fill batter crosses the east boundary: a 0.9 m wall here keeps it inside')
  })

  it('suggests nothing for a batter with room to spare', () => {
    // 0.8 m of fill in the middle of the block: a 1.6 m batter, well clear of everything.
    expect(suggest([painted('a', rect(15, 15, 25, 25), 10.8, 'fill')])).toEqual([])
  })

  it('suggests a wall where a batter crosses the boundary', () => {
    // Fill 1 m up, 1.5 m from the west boundary: its 2 m batter runs over it.
    const s = suggest([painted('a', rect(1.6, 15, 10, 25), 11, 'fill')])
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ rule: 'boundary', kind: 'fill', source: 'grade:a' })
    expect(s[0].why).toBe('Fill batter crosses the west boundary: a 1.0 m wall here keeps it inside')
    // Along the west edge of the area, about 10 m long, the face on the area's edge.
    expect(Math.abs(s[0].a[0] - s[0].b[0])).toBeLessThan(0.05)
    expect((s[0].a[0] + s[0].b[0]) / 2).toBeGreaterThan(1.2)
    expect((s[0].a[0] + s[0].b[0]) / 2).toBeLessThan(1.6)
    expect(Math.abs(s[0].b[1] - s[0].a[1])).toBeGreaterThan(9)
    expect(s[0].height).toBeCloseTo(1, 1)
    expect(s[0].engineer).toBe(s[0].height > ENGINEER_OVER)
  })

  it('suggests one where a batter comes within the clearance of a side or rear boundary, but not the front', () => {
    // 0.5 m of fill: a 1 m batter ending 0.6 m from the west boundary.
    const area = painted('a', rect(1.8, 15, 10, 25), 10.5, 'fill')
    const s = suggest([area])
    expect(s).toHaveLength(1)
    expect(s[0].rule).toBe('clearance')
    expect(s[0].why).toBe(`Fill batter comes within ${WORKS_CLEARANCE} m of the west boundary: a 0.5 m wall here keeps it clear`)
    // With the west side the street, the Housing Code's clearance doesn't apply there.
    expect(suggest([area], { counted: [0, 1, 2] })).toEqual([])
  })

  it('suggests one where a batter would be too tall', () => {
    // 1.5 m of fill: a batter 1.5 m high, over the limit, though it has room.
    const s = suggest([painted('a', rect(15, 15, 25, 25), 11.5, 'fill')])
    // One wall right round it, corner to corner.
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ rule: 'tall', engineer: true })
    expect(s[0].path).toHaveLength(5)
    expect(s[0].path[4]).toEqual(s[0].path[0])
    // Its face on the painted edge: the centreline half its 200 mm out, give or take a grid cell or so.
    for (const [x, y] of s[0].path.slice(0, 4)) {
      expect(Math.min(Math.abs(x - 14.8), Math.abs(x - 25.2))).toBeLessThan(0.3)
      expect(Math.min(Math.abs(y - 14.8), Math.abs(y - 25.2))).toBeLessThan(0.3)
    }
    expect(s[0].why).toMatch(new RegExp(`Fill batter would be 1\\.[45] m high, more than the ${TALL_BATTER} m a batter alone should be`))
    // 0.9 m is under it.
    expect(suggest([painted('a', rect(15, 15, 25, 25), 10.9, 'fill')])).toEqual([])
  })

  it('suggests one where a flat batter covers more ground than a wall', () => {
    // 0.9 m of cut at 1 in 4: a batter 3.6 m wide.
    const s = suggest([painted('a', rect(15, 15, 25, 25), 9.1, 'cut')], { batter: 4 })
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ rule: 'wide', kind: 'cut' })
    expect(s[0].why).toMatch(/^Cut batter would be 3\.\d m wide/)
    // At 1 in 2 it's 1.8 m wide, under the limit.
    expect(WIDE_BATTER).toBeGreaterThan(1.8)
    expect(suggest([painted('a', rect(15, 15, 25, 25), 9.1, 'cut')])).toEqual([])
  })

  it('suggests one where a batter runs into other ground at another level, or a tree’s protection zone', () => {
    // A fill pad 0.9 m up, and a cut area 1.5 m east of it, 0.8 m down: one wall between them.
    const s = suggest([painted('a', rect(10, 15, 18, 25), 10.9, 'fill'), painted('b', rect(19.5, 15, 28, 25), 9.2, 'cut')])
    const between = s.filter(x => x.rule === 'room')
    expect(between).toHaveLength(1)
    expect(between[0].why).toMatch(/^No room for the (cut|fill) batter before it meets other painted ground: a \d\.\d m wall here holds it$/)
    expect((between[0].a[0] + between[0].b[0]) / 2).toBeGreaterThan(17.9)
    expect((between[0].a[0] + between[0].b[0]) / 2).toBeLessThan(19.6)
    // Two fills side by side at about the same level: the ground between just fills, no wall.
    expect(suggest([painted('a', rect(10, 15, 18, 25), 10.9, 'fill'), painted('b', rect(19.5, 15, 28, 25), 10.8, 'fill')]).filter(x => x.rule === 'room')).toEqual([])
    const t = suggest([painted('a', rect(15, 15, 25, 25), 10.6, 'fill')], { trees: [{ at: [27, 20], r: 1.5 }] })
    expect(t).toHaveLength(1)
    expect(t[0].why).toMatch(/before it meets a tree’s protection zone/)
  })

  it('cut only looks where it cuts, and a wall already there holds the batter', () => {
    // Cut to 9 on a block falling to the west: the cut is at the east end, so only that side wants a wall.
    const z = (x: number) => 8 + x * 0.1
    const s = suggest([painted('a', rect(5, 15, 25, 25), 9.4, 'cut')], { z })
    expect(s.length).toBeGreaterThan(0)
    for (const x of s) expect(x.kind).toBe('cut')
    // A retaining wall along the west edge of the boundary-crossing fill.
    const area = painted('w', rect(1.6, 15, 10, 25), 11, 'fill')
    expect(suggest([area], { barriers: [[[1.4, 14.5], [1.4, 25.5]]] })).toEqual([])
  })
})
