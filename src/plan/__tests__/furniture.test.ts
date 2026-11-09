import { describe, expect, it, vi } from 'vitest'
import { signedArea, type Vec2 } from '../../lib/geom'
import {
  backDir,
  CATALOG,
  catalogItem,
  facingAway,
  fitFurniture,
  furnitureContains,
  furnitureCorners,
  furnitureName,
  furnitureSolids,
  furnitureSymbol,
  FURNITURE_GROUPS,
  newFurniture,
  resized,
  snapRotation,
  wallClearances,
} from '../furniture'
import { wallPolygons } from '../geometry'
import { emptyPlan, normalizePlan, type Furniture, type Plan, type Wall } from '../model'
import { addFurniture, addLevelAbove, deleteLevel, deleteSelection, planBounds, resizeFurniture, updateFurniture } from '../ops'
import { parsePlanFile, usePlan } from '../store'
import { garageFloor } from './fixtures'

// The store saves to IndexedDB, which tests don't have.
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {} }))

const L = 'level_ground'
const placement = { e: 0, n: 0, rotation: 0, ffl: 80 }
const item = (kind: string, at: Vec2 = [0, 0], rotation = 0): Furniture => newFurniture(kind, L, at, rotation)!
const close = (a: Vec2, b: Vec2, digits = 6) => {
  expect(a[0]).toBeCloseTo(b[0], digits)
  expect(a[1]).toBeCloseTo(b[1], digits)
}

/** A 4 x 3 m room on wall centrelines, 200 mm walls, so the inside faces are at x 0.1..3.9 and y 0.1..2.9. */
function room(): Wall[] {
  const w = (id: string, a: Vec2, b: Vec2): Wall => ({ id, level: L, a, b, thickness: 0.2, kind: 'external' })
  return [w('s', [0, 0], [4, 0]), w('e', [4, 0], [4, 3]), w('n', [4, 3], [0, 3]), w('w', [0, 3], [0, 0])]
}

describe('furniture in saved plans', () => {
  it('loads a plan saved before furniture existed', () => {
    const old = { ...garageFloor() } as Partial<Plan>
    delete old.furniture
    expect(normalizePlan(old as Plan).furniture).toEqual([])
    expect(parsePlanFile(JSON.stringify(old)).furniture).toEqual([])
  })

  it('keeps furniture through a plan file', () => {
    const plan = addFurniture(garageFloor(), { ...item('bed-queen', [2, 2], 90), label: 'Main bed' })
    const back = parsePlanFile(JSON.stringify(plan))
    expect(back.furniture).toEqual(plan.furniture)
    expect(furnitureName(back.furniture[0])).toBe('Main bed')
  })

  it('starts new plans empty and leaves furniture behind on a new level', () => {
    expect(emptyPlan(placement).furniture).toEqual([])
    const plan = addFurniture(garageFloor(), item('sofa-3', [3, 7]))
    const { plan: two, id } = addLevelAbove(plan)
    expect(two.furniture.filter(f => f.level === id)).toHaveLength(0)
    expect(deleteLevel(addFurniture(two, { ...item('desk'), level: id }), id).furniture).toHaveLength(1)
  })
})

describe('furniture catalog', () => {
  it('has about 30 items in every group, with unique keys', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(30)
    expect(new Set(CATALOG.map(c => c.key)).size).toBe(CATALOG.length)
    for (const g of FURNITURE_GROUPS) expect(CATALOG.some(c => c.group === g.id)).toBe(true)
  })

  it('uses sensible sizes', () => {
    for (const c of CATALOG) {
      const [w, d, h] = c.size
      expect(w, c.key).toBeGreaterThanOrEqual(0.3)
      expect(d, c.key).toBeGreaterThanOrEqual(0.3)
      expect(Math.max(w, d), c.key).toBeLessThanOrEqual(5)
      expect(h, c.key).toBeGreaterThan(0)
      expect(h, c.key).toBeLessThanOrEqual(2.4)
    }
  })

  it('uses the usual Australian sizes', () => {
    const size = (key: string) => catalogItem(key)!.size.slice(0, 2)
    expect(size('bed-single')).toEqual([0.92, 1.88])
    expect(size('bed-king-single')).toEqual([1.07, 2.03])
    expect(size('bed-double')).toEqual([1.38, 1.88])
    expect(size('bed-queen')).toEqual([1.53, 2.03])
    expect(size('bed-king')).toEqual([1.83, 2.03])
    expect(size('bench')[1]).toBe(0.6)
    expect(size('fridge')[0]).toBe(0.9)
    expect(size('shower')).toEqual([0.9, 0.9])
    expect(size('bath')[0]).toBe(1.7)
    expect(size('car')).toEqual([1.9, 4.9])
    // Beds get bigger in order.
    const beds = ['bed-single', 'bed-king-single', 'bed-double', 'bed-queen', 'bed-king'].map(k => size(k)[0] * size(k)[1])
    expect([...beds].sort((a, b) => a - b)).toEqual(beds)
  })

  it('draws every symbol and 3D shape inside its footprint', () => {
    for (const c of CATALOG) {
      const f = item(c.key, [5, 5], 30)
      const corners = furnitureCorners(f)
      const grown = furnitureCorners({ ...f, width: f.width + 0.002, depth: f.depth + 0.002 })
      const inside = (p: Vec2) => furnitureContains({ ...f, width: f.width + 0.002, depth: f.depth + 0.002 }, p)
      const sym = furnitureSymbol(f)
      expect(sym.parts.length, c.key).toBeGreaterThan(1)
      for (const part of sym.parts) for (const p of part.pts) expect(inside(p), `${c.key} symbol`).toBe(true)
      const solids = furnitureSolids(f)
      expect(solids.length, c.key).toBeGreaterThan(0)
      for (const s of solids) {
        expect(s.z0, c.key).toBeGreaterThanOrEqual(0)
        expect(s.z1, c.key).toBeLessThanOrEqual(f.height + 1e-9)
        expect(s.z1, c.key).toBeGreaterThan(s.z0)
        for (const p of s.pts) expect(inside(p), `${c.key} solid`).toBe(true)
      }
      expect(Math.abs(signedArea(corners))).toBeCloseTo(f.width * f.depth, 9)
      expect(grown).toHaveLength(4)
    }
  })

  it('draws chairs with the dining tables', () => {
    const four = furnitureSymbol(item('dining-4')).parts.length
    const eight = furnitureSymbol(item('dining-8')).parts.length
    // two parts per chair, plus the table
    expect(four).toBe(4 * 2 + 1)
    expect(eight).toBe(8 * 2 + 1)
  })

  it('draws an unknown item as a plain box', () => {
    const f: Furniture = { ...item('desk'), kind: 'hot-tub' }
    expect(furnitureName(f)).toBe('Furniture')
    expect(furnitureSymbol(f).parts).toHaveLength(2)
    expect(furnitureSolids(f)).toHaveLength(1)
    expect(newFurniture('hot-tub', L, [0, 0])).toBeNull()
  })
})

describe('placing and turning furniture', () => {
  it('starts at the catalog size, centred where it is placed', () => {
    const f = item('bed-queen', [2, 1.5])
    expect([f.width, f.depth, f.height]).toEqual(catalogItem('bed-queen')!.size)
    expect(f.at).toEqual([2, 1.5])
    expect(furnitureContains(f, [2, 2.5])).toBe(true)
    expect(furnitureContains(f, [2, 2.6])).toBe(false)
  })

  it('turns about its centre, anticlockwise, with its back at +y to start with', () => {
    close(backDir(0), [0, 1])
    close(backDir(90), [-1, 0])
    const f = item('bed-queen', [2, 1.5], 90)
    // Now 2.03 across in x and 1.53 in y.
    const xs = furnitureCorners(f).map(p => p[0])
    const ys = furnitureCorners(f).map(p => p[1])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2.03, 9)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1.53, 9)
    expect(newFurniture('desk', L, [0, 0], -90)!.rotation).toBe(270)
  })

  it('snaps turns to square, or to 5° steps', () => {
    expect(snapRotation(86)).toBe(90)
    expect(snapRotation(-4)).toBe(0)
    expect(snapRotation(357)).toBe(0)
    expect(snapRotation(181.5)).toBe(180)
    expect(snapRotation(33)).toBe(35)
    expect(snapRotation(33.4, true)).toBe(33)
    expect(snapRotation(450)).toBe(90)
  })

  it('faces away from a wall', () => {
    expect(facingAway([0, -1])).toBe(0) // a wall above: back up
    expect(facingAway([1, 0])).toBe(90) // a wall on the left: back to the left
    expect(facingAway([0, 1])).toBe(180)
    expect(facingAway([-1, 0])).toBe(270)
  })

  it('keeps the back where it is when the size changes', () => {
    const f = item('bench', [2, 2.6], 0) // back at y 2.9
    const g = resized(f, { depth: 0.7, width: 3 })
    expect(g.at[1] + g.depth / 2).toBeCloseTo(2.9, 9)
    expect(g.at[0]).toBeCloseTo(2, 9)
    expect(resizeFurniture(addFurniture(garageFloor(), f), f.id, { depth: 0.7 }).furniture[0].depth).toBe(0.7)
  })
})

describe('snapping furniture to walls', () => {
  const walls = room()
  const tol = 0.25

  it('pushes the back of a bed flush to the wall it is near, and turns it to face the room', () => {
    // Dragged near the north wall's inside face (y = 2.9), turned the wrong way.
    const bed = item('bed-queen', [0, 0], 170)
    const fit = fitFurniture(bed, [2, 1.8], walls, { tol })
    expect(fit.snapped).toBe('wall')
    expect(fit.rotation).toBe(0)
    expect(fit.at[1] + bed.depth / 2).toBeCloseTo(2.9, 6)
    expect(fit.at[0]).toBeCloseTo(2, 6)
    close(fit.touch!, [2, 2.9])
  })

  it('backs onto a side wall too', () => {
    const sofa = item('sofa-3')
    // Near the west wall's inside face (x = 0.1).
    const fit = fitFurniture(sofa, [0.6, 1.5], walls, { tol })
    expect(fit.rotation).toBe(90) // back to the left
    expect(fit.at[0] - sofa.depth / 2).toBeCloseTo(0.1, 6)
  })

  it('slides into a corner when the side wall is close', () => {
    const bench = item('bench')
    // Back near the north wall and its left end near the west wall.
    const fit = fitFurniture(bench, [1.4, 2.55], walls, { tol })
    expect(fit.snapped).toBe('corner')
    expect(fit.at[1] + 0.3).toBeCloseTo(2.9, 6)
    expect(fit.at[0] - 1.2).toBeCloseTo(0.1, 6)
  })

  it('puts a side flush without turning when it is already square to the wall', () => {
    // A single bed along the west wall, head to the north.
    const bed = item('bed-single', [0, 0], 0)
    const fit = fitFurniture(bed, [0.6, 1.4], walls, { tol })
    expect(fit.rotation).toBe(0)
    expect(fit.at[0] - bed.width / 2).toBeCloseTo(0.1, 6)
  })

  it('moves in 10 mm steps along the wall while staying flush', () => {
    const fit = fitFurniture(item('bench'), [2.0037, 2.55], walls, { tol })
    expect(fit.at[0]).toBeCloseTo(2.0, 9)
    expect(fit.at[1] + 0.3).toBeCloseTo(2.9, 9)
  })

  it('never puts the front of an item against a wall', () => {
    const bed = item('bed-queen', [0, 0], 180)
    const fit = fitFurniture(bed, [2, 1.85], walls, { tol })
    expect(fit.rotation).toBe(0)
  })

  it('leaves free-standing pieces, far-off pieces and Shift alone', () => {
    const table = item('dining-6', [0, 0], 0)
    expect(fitFurniture(table, [2.004, 2.0], walls, { tol })).toMatchObject({ snapped: null, at: [2, 2] })
    const bed = item('bed-queen')
    expect(fitFurniture(bed, [2, 1.45], walls, { tol }).snapped).toBeNull()
    expect(fitFurniture(bed, [2, 1.8], walls, { tol, free: true })).toMatchObject({ snapped: null, rotation: 0, at: [2, 1.8] })
  })

  it('does not snap through a wall from the other side', () => {
    const bed = item('bed-queen', [0, 0], 0)
    // Outside the room, above the north wall.
    const fit = fitFurniture(bed, [2, 3.0 + 0.1 + 1.0], walls, { tol })
    expect(fit.rotation).toBe(180)
    expect(fit.at[1] - bed.depth / 2).toBeCloseTo(3.1, 6)
  })

  it('works on walls at an angle', () => {
    const t = (30 * Math.PI) / 180
    const wall: Wall = { id: 'x', level: L, a: [0, 0], b: [Math.cos(t) * 6, Math.sin(t) * 6], thickness: 0.2, kind: 'internal' }
    const n: Vec2 = [-Math.sin(t), Math.cos(t)]
    const desk = item('desk')
    const raw: Vec2 = [3 * Math.cos(t) + n[0] * 0.5, 3 * Math.sin(t) + n[1] * 0.5]
    const fit = fitFurniture(desk, raw, [wall], { tol })
    expect(fit.rotation).toBeCloseTo(210, 6)
    const s = (fit.at[0] - 0) * n[0] + (fit.at[1] - 0) * n[1]
    expect(s).toBeCloseTo(0.1 + desk.depth / 2, 6)
  })
})

describe('distances from furniture to walls', () => {
  const polys = [...wallPolygons(room()).values()]

  it('measures from the middle of each side to the wall faces', () => {
    // A queen bed with its back on the north wall, in the middle of the room.
    const bed = { ...item('bed-queen', [2, 2.9 - 1.015]) }
    const d = new Map(wallClearances(bed, polys).map(c => [c.side, c]))
    expect(d.get('back')!.dist).toBeCloseTo(0, 6)
    expect(d.get('left')!.dist).toBeCloseTo(2 - 0.765 - 0.1, 6)
    expect(d.get('right')!.dist).toBeCloseTo(3.9 - 2 - 0.765, 6)
    expect(d.get('front')!.dist).toBeCloseTo(2.9 - 2.03 - 0.1, 6)
    close(d.get('front')!.to, [2, 0.1])
  })

  it('follows the item round when it turns', () => {
    const desk = item('desk', [1, 1.5], 90) // back to the west
    const d = new Map(wallClearances(desk, polys).map(c => [c.side, c.dist]))
    expect(d.get('back')).toBeCloseTo(1 - 0.375 - 0.1, 6)
    expect(d.get('front')).toBeCloseTo(3.9 - 1 - 0.375, 6)
  })

  it('reads 0 for a side pushed into a wall, and leaves out sides with no wall', () => {
    const f = item('desk', [2, 2.6])
    expect(wallClearances(f, polys).find(c => c.side === 'back')!.dist).toBe(0)
    expect(wallClearances(item('desk', [20, 20]), polys)).toHaveLength(0)
  })
})

describe('editing furniture', () => {
  it('adds, changes and deletes with undo and redo', () => {
    const st = usePlan.getState()
    st.load(garageFloor())
    const f = item('sofa-2', [3, 7])
    st.commit(p => addFurniture(p, f))
    st.commit(p => updateFurniture(p, f.id, { rotation: 90 }))
    // A drag is one step.
    st.beginGesture()
    st.preview(p => updateFurniture(p, f.id, { at: [3.5, 7] }))
    st.preview(p => updateFurniture(p, f.id, { at: [4, 7] }))
    st.endGesture()
    const now = () => usePlan.getState().plan!.furniture
    expect(now()[0]).toMatchObject({ at: [4, 7], rotation: 90 })
    usePlan.getState().undo()
    expect(now()[0]).toMatchObject({ at: [3, 7], rotation: 90 })
    usePlan.getState().undo()
    expect(now()[0].rotation).toBe(0)
    usePlan.getState().undo()
    expect(now()).toHaveLength(0)
    usePlan.getState().redo()
    usePlan.getState().redo()
    expect(now()[0].rotation).toBe(90)
    usePlan.getState().commit(p => deleteSelection(p, { type: 'furniture', id: f.id }))
    expect(now()).toHaveLength(0)
    usePlan.getState().undo()
    expect(now()).toHaveLength(1)
  })

  it('counts furniture in the plan bounds', () => {
    const b = planBounds(addFurniture(emptyPlan(placement), item('car', [10, 10])))!
    expect(b.maxY - b.minY).toBeCloseTo(4.9, 9)
  })
})
