// Flip, turn and line up a selection, and flip the whole plan (CB-19, LD-38, DB-18).
// Uses the made-up garage plan only.

import { beforeEach, describe, expect, it } from 'vitest'
import { signedArea } from '../../lib/geom'
import { allOnLevel } from '../editing'
import { normalizePlan, wallLength, type Furniture, type Plan, type Roof, type Stair } from '../model'
import { openingClear } from '../openingFit'
import { houseBounds } from '../ops'
import { stairLayout } from '../stairs'
import { usePlan, type Selection } from '../store'
import { alignSelection, canTransform, flipPlan, flipSelection, rotateSelection, screenAxes, selectionMiddle } from '../transform'
import { garageFloor } from './fixtures'

const L = 'level_ground'
const roof: Roof = { id: 'roof1', level: L, pts: [[0, 0], [10, 0], [10, 6], [4, 6], [4, 9], [0, 9]], type: 'gable', pitch: 22.5, overhang: 0.45, gables: [false, true, false, false, true, false], lowEdge: 1, plateLift: 0 }
const stair: Stair = { id: 'stair1', level: L, at: [9, 6], angle: 90, width: 0.9, base: 0, rise: 3, going: 0.25, shape: 'l', turn: 'left', toLevel: null }
const bed: Furniture = { id: 'bed1', level: L, kind: 'bed-queen', at: [3, 7], rotation: 90, width: 1.53, depth: 2.03, height: 1 }
const full = (): Plan => ({ ...garageFloor(), roofs: [roof], stairs: [stair], furniture: [bed], notes: [{ id: 'n1', level: L, at: [1, 1], text: 'Meter box' }], sections: [{ id: 's1', label: 'A', a: [0, 5], b: [10, 5] }] })
const all = (p: Plan) => allOnLevel(p, L)
const wall = (p: Plan, id: string) => p.walls.find(w => w.id === id)!
const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 3))

describe('flipping a selection', () => {
  it('mirrors every point about the middle of what is picked, and twice puts it back', () => {
    const p = full()
    const c = selectionMiddle(p, all(p))!
    const f = flipSelection(p, all(p), 'x')
    close(wall(f, 'south').a, [2 * c[0] - 5.45, 0.15])
    close(wall(f, 'south').b, [2 * c[0] - 9.95, 0.15])
    close(f.rooms[0].at, [2 * c[0] - 4, 7.5])
    expect(f.areas[0].pts.map(q => q[1]).sort()).toEqual(p.areas[0].pts.map(q => q[1]).sort())
    const back = flipSelection(f, all(f), 'x')
    back.walls.forEach((w, i) => {
      close(w.a, p.walls[i].a)
      close(w.b, p.walls[i].b)
    })
    expect(back.openings).toEqual(p.openings)
    close(back.stairs[0].at, stair.at)
    expect(back.stairs[0]).toMatchObject({ angle: 90, turn: 'left' })
    expect(back.furniture[0].rotation).toBeCloseTo(90, 6)
  })

  it('keeps each wall its length and its doors their place along it, swinging the other way', () => {
    const p = full()
    const f = flipSelection(p, all(p), 'y')
    for (const w of p.walls) expect(wallLength(wall(f, w.id))).toBeCloseTo(wallLength(w), 6)
    for (const o of p.openings) {
      const o2 = f.openings.find(x => x.id === o.id)!
      expect(o2).toMatchObject({ wall: o.wall, offset: o.offset, width: o.width, flipHinge: o.flipHinge, flipSwing: !o.flipSwing })
    }
  })

  it('a stair points and turns the mirrored way, and furniture faces the mirrored way', () => {
    const p = full()
    const lr = flipSelection(p, all(p), 'x')
    // Going up the page stays up the page; its turn swaps sides.
    expect(lr.stairs[0]).toMatchObject({ angle: 90, turn: 'right' })
    // A bed with its back to the left wall has it to the right wall.
    expect(lr.furniture[0].rotation).toBeCloseTo(270, 6)
    const tb = flipSelection(p, all(p), 'y')
    expect(tb.stairs[0]).toMatchObject({ angle: 270, turn: 'right' })
    expect(tb.furniture[0].rotation).toBeCloseTo(90, 6)
    // The stair's mirrored outline is the outline of the mirrored stair.
    const c = selectionMiddle(p, all(p))!
    const want = stairLayout(stair).outline.map(q => [2 * c[0] - q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const got = stairLayout(lr.stairs[0]).outline.map(q => [...q]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    got.forEach((q, i) => close(q, want[i]))
  })

  it('a roof stays anticlockwise and its gable ends and low side stay on the same edges', () => {
    const p = full()
    const f = flipSelection(p, [{ type: 'roof', id: 'roof1' }], 'x').roofs[0]
    expect(Math.sign(signedArea(f.pts))).toBe(Math.sign(signedArea(roof.pts)))
    const edge = (r: Roof, i: number) => [r.pts[i], r.pts[(i + 1) % r.pts.length]].map(q => q[1]).sort().join()
    // The gable ends were the two edges running up the page at x = 10 and x = 4: they still run up the page.
    const gableYs = (r: Roof) => r.gables.flatMap((g, i) => (g ? [edge(r, i)] : [])).sort()
    expect(gableYs(f)).toEqual(gableYs(roof))
    expect(edge(f, f.lowEdge)).toBe(edge(roof, roof.lowEdge))
    expect(f.gables.filter(Boolean)).toHaveLength(2)
  })

  it('a retaining wall holds back the mirrored side', () => {
    const p = full()
    p.walls.push({ id: 'ret', level: L, a: [12, 0], b: [12, 5], thickness: 0.2, kind: 'retaining', retain: { high: 'left' } })
    expect(wall(flipSelection(p, [{ type: 'wall', id: 'ret' }], 'x'), 'ret').retain?.high).toBe('right')
    expect(wall(rotateSelection(p, [{ type: 'wall', id: 'ret' }], 90), 'ret').retain?.high).toBe('left')
  })

  it('leaves what isn’t picked alone, and a door or window on its own is not a thing to flip', () => {
    const p = full()
    const f = flipSelection(p, [{ type: 'wall', id: 'south' }], 'x')
    expect(f.walls.filter(w => w.id !== 'south')).toEqual(p.walls.filter(w => w.id !== 'south'))
    expect(canTransform([{ type: 'opening', id: 'entry' }])).toBe(false)
    expect(flipSelection(p, [{ type: 'opening', id: 'entry' }], 'x')).toBe(p)
  })
})

describe('turning a selection', () => {
  it('a quarter turn clockwise takes up-the-page to the right, exactly', () => {
    const p = full()
    const c = selectionMiddle(p, all(p))!
    const t = rotateSelection(p, all(p), 90)
    // (x, y) about c goes to (c.x + (y − c.y), c.y − (x − c.x)).
    close(wall(t, 'south').a, [c[0] + (0.15 - c[1]), c[1] - (5.45 - c[0])])
    expect(t.stairs[0].angle).toBe(0)
    expect(t.stairs[0].turn).toBe('left')
    expect(t.furniture[0].rotation).toBe(0)
    expect(t.openings).toEqual(p.openings)
    // Every wall is still square to the page.
    for (const w of t.walls) expect(Math.min(Math.abs(w.a[0] - w.b[0]), Math.abs(w.a[1] - w.b[1]))).toBeLessThan(1e-9)
  })

  it('four quarter turns put it back', () => {
    const p = full()
    let t = p
    for (let i = 0; i < 4; i++) t = rotateSelection(t, all(t), 90)
    t.walls.forEach((w, i) => {
      close(w.a, p.walls[i].a)
      close(w.b, p.walls[i].b)
    })
    close(t.roofs[0].pts.flat(), roof.pts.flat())
    expect(t.stairs[0].angle).toBe(90)
  })

  it('turns by any angle, anticlockwise for a minus one, keeping lengths', () => {
    const p = full()
    const t = rotateSelection(p, [{ type: 'wall', id: 'south' }], -30)
    expect(wallLength(wall(t, 'south'))).toBeCloseTo(4.5, 3)
    const d = [wall(t, 'south').b[0] - wall(t, 'south').a[0], wall(t, 'south').b[1] - wall(t, 'south').a[1]]
    expect((Math.atan2(d[1], d[0]) * 180) / Math.PI).toBeCloseTo(30, 1)
    expect(rotateSelection(p, all(p), 0)).toBe(p)
    expect(rotateSelection(p, all(p), 360)).toBe(p)
  })
})

describe('flipping the whole plan', () => {
  it('mirrors every level about the middle of the house, which stays where it is', () => {
    const p = normalizePlan(full())
    const f = flipPlan(p, 'x')
    const [b0, b1] = [houseBounds(p)!, houseBounds(f)!]
    close([b1.minX, b1.maxX, b1.minY, b1.maxY], [b0.minX, b0.maxX, b0.minY, b0.maxY])
    const cx = (b0.minX + b0.maxX) / 2
    close(wall(f, 'east').a, [2 * cx - 9.95, 0.15])
    close(f.notes![0].at, [2 * cx - 1, 1])
    close(f.sections![0].a, [2 * cx - 0, 5])
    close(f.areas[0].pts.map(q => q[0]).sort(), p.areas[0].pts.map(q => 2 * cx - q[0]).sort())
    expect(f.openings.every((o, i) => o.flipSwing !== p.openings[i].flipSwing && o.offset === p.openings[i].offset)).toBe(true)
  })

  it('leaves the sketch layer where it is, and an empty plan alone', () => {
    const p = { ...full(), sketch: [{ id: 'k1', level: L, kind: 'line' as const, pts: [[0, 0], [3, 0]] as [number, number][] }] }
    expect(flipPlan(p, 'y').sketch).toBe(p.sketch)
    const empty = { ...garageFloor(), walls: [], openings: [], rooms: [], areas: [] }
    expect(flipPlan(empty, 'x')).toBe(empty)
  })

  it('through the store it is one undo step and every door and window still fits its wall', () => {
    usePlan.getState().load(normalizePlan(full()))
    usePlan.getState().commit(p => flipPlan(p, 'x'))
    const st = usePlan.getState()
    expect(st.past).toHaveLength(1)
    for (const o of st.plan!.openings) expect(openingClear(st.plan!.walls, wall(st.plan!, o.wall), o), o.id).toBe(true)
    expect(st.plan!.openings).toHaveLength(5)
    st.undo()
    expect(usePlan.getState().plan!.walls).toEqual(normalizePlan(full()).walls)
  })
})

describe('turning part of the plan through the store', () => {
  beforeEach(() => usePlan.getState().load(normalizePlan(full())))

  it('keeps the doors in a turned wall fitted to it, in one undo step', () => {
    const sels: Selection[] = [{ type: 'wall', id: 'east' }]
    usePlan.getState().commit(p => rotateSelection(p, sels, 90))
    const st = usePlan.getState()
    expect(st.past).toHaveLength(1)
    const east = wall(st.plan!, 'east')
    expect(wallLength(east)).toBeCloseTo(13.7, 3)
    for (const o of st.plan!.openings.filter(x => x.wall === 'east')) expect(openingClear(st.plan!.walls, east, o)).toBe(true)
  })
})

describe('lining things up', () => {
  const beds = (): Plan => ({
    ...garageFloor(),
    furniture: [
      { ...bed, id: 'f1', at: [2, 6], rotation: 0 },
      { ...bed, id: 'f2', at: [4, 8], rotation: 0, width: 1 },
      { ...bed, id: 'f3', at: [7, 7], rotation: 0 },
    ],
  })
  const three: Selection[] = ['f1', 'f2', 'f3'].map(id => ({ type: 'furniture', id }))
  const lefts = (p: Plan) => p.furniture.map(f => f.at[0] - f.width / 2)

  it('left edges, right edges and middles, across the page', () => {
    const p = beds()
    const left = alignSelection(p, three, [1, 0], 'min')
    close(lefts(left), [2 - 1.53 / 2, 2 - 1.53 / 2, 2 - 1.53 / 2])
    // Up and down the page nothing moved.
    expect(left.furniture.map(f => f.at[1])).toEqual([6, 8, 7])
    const right = alignSelection(p, three, [1, 0], 'max')
    close(right.furniture.map(f => f.at[0] + f.width / 2), [7 + 1.53 / 2, 7 + 1.53 / 2, 7 + 1.53 / 2])
    const mid = alignSelection(p, three, [1, 0], 'mid')
    const m = (2 - 1.53 / 2 + 7 + 1.53 / 2) / 2
    close(mid.furniture.map(f => f.at[0]), [m, m, m])
  })

  it('tops and bottoms, up the page', () => {
    const top = alignSelection(beds(), three, [0, 1], 'max')
    close(top.furniture.map(f => f.at[1] + f.depth / 2), [8 + 2.03 / 2, 8 + 2.03 / 2, 8 + 2.03 / 2])
    expect(top.furniture.map(f => f.at[0])).toEqual([2, 4, 7])
  })

  it('walls joined to one another move as one, and one thing alone has nothing to line up with', () => {
    const p = { ...beds(), walls: [...garageFloor().walls, { id: 'x1', level: L, a: [20, 0], b: [20, 3], thickness: 0.11, kind: 'internal' as const }, { id: 'x2', level: L, a: [20, 3], b: [23, 3], thickness: 0.11, kind: 'internal' as const }] } as Plan
    const sels: Selection[] = [{ type: 'wall', id: 'x1' }, { type: 'wall', id: 'x2' }, { type: 'furniture', id: 'f1' }]
    const a = alignSelection(p, sels, [1, 0], 'min')
    // The pair's left edge (x = 20) comes to the bed's, and the corner between them is still a corner.
    close(wall(a, 'x1').a, [2 - 1.53 / 2, 0])
    close(wall(a, 'x1').b, wall(a, 'x2').a)
    expect(wallLength(wall(a, 'x2'))).toBeCloseTo(3, 6)
    expect(alignSelection(p, [{ type: 'furniture', id: 'f1' }], [1, 0], 'min')).toBe(p)
    expect(alignSelection(p, [{ type: 'wall', id: 'x1' }, { type: 'wall', id: 'x2' }], [1, 0], 'max')).toBe(p)
  })
})

describe('which way is right on the screen', () => {
  it('follows the page to the nearest quarter turn, so a flip stays square to the house', () => {
    expect(screenAxes(0)).toEqual({ right: [1, 0], up: [0, 1] })
    expect(screenAxes(0.03)).toEqual({ right: [1, 0], up: [0, 1] })
    expect(screenAxes(Math.PI / 2)).toEqual({ right: [0, -1], up: [1, 0] })
    expect(screenAxes(Math.PI)).toEqual({ right: [-1, 0], up: [0, -1] })
    expect(screenAxes(-Math.PI / 2)).toEqual({ right: [0, 1], up: [-1, 0] })
  })
})
