import { describe, expect, it } from 'vitest'
import { signedArea, type Vec2 } from '../../lib/geom'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { allOnLevel, copySelection, deleteSelections, itemsWhere, pasteClip, selectionName, translateSelection } from '../../plan/editing'
import { normalizePlan, type Plan, type SketchItem } from '../../plan/model'
import { addLevelAbove, deleteLevel } from '../../plan/ops'
import { snap } from '../../plan/snap'
import { findSelection } from '../../shell/selection'
import { arcOf, BUILD_SAGITTA, circleThrough, sketchCentre, sketchClosed, sketchGuides, sketchLength, sketchPolyline, sketchToOutline, sketchToSegments } from '../geometry'
import { addSketch, clearSketch, keptMeasures, moveSketchPoint, newSketch, sketchCount, sketchLines, sketchOf, sketchToArea, sketchToWalls } from '../ops'
import { typedPoint } from '../useSketchLayer'

const L = 'level_ground'
const near = (a: Vec2, b: Vec2, tol = 1e-6) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol
const item = (kind: SketchItem['kind'], pts: Vec2[], level = L): SketchItem => ({ id: `s_${kind}_${pts.length}`, level, kind, pts })

describe('sketch geometry', () => {
  it('finds the circle through three points, and none through three in a line', () => {
    const c = circleThrough([1, 0], [0, 1], [-1, 0])!
    expect(near(c.c, [0, 0])).toBe(true)
    expect(c.r).toBeCloseTo(1, 9)
    expect(circleThrough([0, 0], [1, 1], [2, 2])).toBeNull()
  })

  it('goes round an arc the way its middle point says', () => {
    // Start on the right, end on the left: over the top is anticlockwise, under is clockwise.
    expect(arcOf([1, 0], [0, 1], [-1, 0])!.sweep).toBeCloseTo(Math.PI, 9)
    expect(arcOf([1, 0], [0, -1], [-1, 0])!.sweep).toBeCloseTo(-Math.PI, 9)
    // A small bulge stays a small arc.
    const flat = arcOf([0, 0], [5, 0.5], [10, 0])!
    expect(Math.abs(flat.sweep)).toBeLessThan(1)
  })

  it('draws an arc in pieces within the sagitta, ending exactly on the points clicked', () => {
    const arc = item('arc', [[5, 0], [0, 5], [-5, 0]])
    const run = sketchPolyline(arc, BUILD_SAGITTA)
    expect(run[0]).toEqual([5, 0])
    expect(run.at(-1)).toEqual([-5, 0])
    for (let i = 1; i < run.length; i++) {
      // The gap between each piece's middle and the circle is the sagitta.
      const mid: Vec2 = [(run[i - 1][0] + run[i][0]) / 2, (run[i - 1][1] + run[i][1]) / 2]
      expect(5 - Math.hypot(mid[0], mid[1])).toBeLessThanOrEqual(BUILD_SAGITTA + 1e-9)
    }
    // A 5 m radius half circle at 100 mm: about 2 m pieces, so eight of them.
    expect(sketchToSegments(arc)).toHaveLength(8)
    expect(sketchLength(arc)).toBeCloseTo(5 * Math.PI, 6)
    expect(sketchCentre(arc)!.r).toBeCloseTo(5, 9)
  })

  it('draws a circle closed, and an arc with no bulge as a straight line', () => {
    const circle = item('circle', [[0, 0], [2, 0]])
    const run = sketchPolyline(circle)
    expect(run[0]).toEqual(run.at(-1))
    expect(sketchClosed(circle)).toBe(true)
    expect(sketchLength(circle)).toBeCloseTo(4 * Math.PI, 9)
    expect(sketchPolyline(item('arc', [[0, 0], [1, 0], [2, 0]]))).toEqual([[0, 0], [2, 0]])
  })

  it('runs a curve through every point clicked', () => {
    const pts: Vec2[] = [[0, 0], [3, 2], [6, 0], [9, 3]]
    const run = sketchPolyline(item('curve', pts), 0.001)
    for (const p of pts) expect(run.some(q => near(p, q, 1e-9))).toBe(true)
    expect(sketchLength(item('curve', pts))).toBeGreaterThan(Math.hypot(9, 3))
  })

  it('makes an outline from a closed shape, or an open line of three or more corners, anticlockwise', () => {
    const ring = sketchToOutline(item('circle', [[0, 0], [3, 0]]))!
    expect(signedArea(ring)).toBeGreaterThan(0)
    expect(Math.abs(signedArea(ring))).toBeGreaterThan(0.95 * Math.PI * 9)
    // Clockwise, and left open: closed back to its start and turned round.
    const tri = sketchToOutline(item('line', [[0, 0], [0, 4], [4, 0]]))!
    expect(tri).toHaveLength(3)
    expect(signedArea(tri)).toBeCloseTo(8, 9)
    // A closed square doesn't repeat its first corner.
    expect(sketchToOutline(item('line', [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]))).toHaveLength(4)
    expect(sketchToOutline(item('line', [[0, 0], [4, 0]]))).toBeNull()
    expect(sketchToOutline(item('line', [[0, 0], [4, 0], [8, 0]]))).toBeNull()
  })
})

describe('snapping to the sketch', () => {
  const cross = [item('line', [[0, 0], [10, 0]]), { ...item('line', [[5, -5], [5, 5]]), id: 'b' }, item('circle', [[20, 0], [22, 0]])]
  const guides = sketchGuides(cross)

  it('offers ends, middles, crossings and centres', () => {
    const has = (p: Vec2) => guides.points.some(q => near(p, q, 1e-6))
    expect(has([0, 0])).toBe(true)
    expect(has([10, 0])).toBe(true)
    // The middle of the first line is also where the two cross.
    expect(has([5, 0])).toBe(true)
    expect(has([5, -5])).toBe(true)
    expect(has([20, 0])).toBe(true)
    expect(has([22, 0])).toBe(true)
    expect(has([20, 2])).toBe(true)
  })

  it('finds where a line crosses an arc', () => {
    const g = sketchGuides([item('line', [[-5, 3], [5, 3]]), item('circle', [[0, 0], [5, 0]])])
    expect(g.points.some(p => near(p, [4, 3], 0.02))).toBe(true)
    expect(g.points.some(p => near(p, [-4, 3], 0.02))).toBe(true)
  })

  it('snaps to a sketch point as to a wall end, and onto a sketch line as onto a wall', () => {
    const end = snap([5.04, 0.03], { walls: [], tol: 0.1, guides })
    expect(end.kind).toBe('end')
    expect(end.p).toEqual([5, 0])
    const on = snap([2.53, 0.06], { walls: [], tol: 0.1, guides })
    expect(on.kind).toBe('wall')
    expect(on.p[1]).toBeCloseTo(0, 9)
    // Nothing sketched near: the grid, as before.
    expect(snap([2.53, 3.06], { walls: [], tol: 0.1, guides }).kind).toBe('grid')
    // Without the sketch (hidden), it isn't there to snap to.
    expect(snap([5.04, 0.03], { walls: [], tol: 0.1 }).kind).not.toBe('end')
  })

  it('stops a square line where it meets a sketch line', () => {
    const s = snap([5.03, 3.2], { walls: [], tol: 0.1, guides: sketchGuides([item('line', [[0, 3.2], [14, 3.2]])]), anchor: [5, 8] })
    expect(s.kind).toBe('wall')
    expect(s.p[0]).toBeCloseTo(5, 9)
    expect(s.p[1]).toBeCloseTo(3.2, 9)
  })

  it('snaps to the ends of a kept measurement, but not along it', () => {
    const g = sketchGuides([item('measure', [[0, 0], [4, 0]])])
    expect(g.points).toEqual([[0, 0], [4, 0]])
    expect(g.segs).toEqual([])
  })
})

describe('typed points', () => {
  it('puts a typed length towards the pointer, or at a typed angle', () => {
    expect(typedPoint([0, 0], [10, 0], '3000')).toEqual([3, 0])
    const p = typedPoint([1, 1], [10, 0], '2000<90')!
    expect(p[0]).toBeCloseTo(1, 9)
    expect(p[1]).toBeCloseTo(3, 9)
    expect(typedPoint([0, 0], [10, 0], '<45')).toBeNull()
  })
})

describe('the sketch in the plan', () => {
  const base = (): Plan => normalizePlan(garageFloor())

  it('loads older plans as they were, and drops sketch items that cannot be drawn', () => {
    expect('sketch' in base()).toBe(false)
    const loaded = normalizePlan({
      ...garageFloor(),
      sketch: [item('line', [[0, 0], [1, 1]]), { id: 'x', level: L, kind: 'arc', pts: [[0, 0], [1, 1]] }, { id: 'y', level: L, kind: 'blob', pts: [[0, 0], [1, 1]] }, null] as unknown as SketchItem[],
    })
    expect(sketchOf(loaded).map(s => s.kind)).toEqual(['line'])
  })

  it('makes walls along a sketch line on the level shown, and keeps the sketch', () => {
    const line = newSketch(L, 'line', [[20, 0], [24, 0], [24, 3]])
    const plan = addSketch(base(), line)
    const { plan: next, ids } = sketchToWalls(plan, line, L, { kind: 'external', thickness: 0.27 })
    expect(ids).toHaveLength(2)
    const made = next.walls.filter(w => ids.includes(w.id))
    expect(made.map(w => [w.a, w.b])).toEqual([
      [[20, 0], [24, 0]],
      [[24, 0], [24, 3]],
    ])
    expect(made.every(w => w.thickness === 0.27 && w.kind === 'external' && w.level === L)).toBe(true)
    expect(sketchOf(next)).toHaveLength(1)
  })

  it('makes an area of a circle, in short straight sides', () => {
    const circle = newSketch(L, 'circle', [[20, 5], [22, 5]])
    const r = sketchToArea(addSketch(base(), circle), circle, L, 'deck')!
    const area = r.plan.areas.find(a => a.id === r.id)!
    expect(area.kind).toBe('deck')
    expect(area.pts.length).toBeGreaterThan(8)
    // Inside the circle, short of it by no more than its 100 mm sagitta all round.
    expect(Math.abs(signedArea(area.pts))).toBeLessThan(Math.PI * 4)
    expect(Math.abs(signedArea(area.pts))).toBeGreaterThan(Math.PI * (2 - BUILD_SAGITTA) ** 2)
    expect(sketchToArea(base(), newSketch(L, 'line', [[0, 0], [5, 0]]), L, 'slab')).toBeNull()
  })

  it('changes nothing else: rooms, walls and areas are the same with or without it', () => {
    const plan = base()
    const sketched = addSketch(addSketch(plan, newSketch(L, 'circle', [[3, 3], [5, 3]])), newSketch(L, 'measure', [[0, 0], [9, 0]]))
    expect(sketched.walls).toBe(plan.walls)
    expect(sketched.rooms).toBe(plan.rooms)
    expect(sketched.areas).toBe(plan.areas)
    expect(sketchLines(sketched)).toHaveLength(1)
    expect(keptMeasures(sketched)).toHaveLength(1)
    expect(sketchCount(sketched)).toBe('1 sketch line and 1 measurement')
    expect(clearSketch(sketched).sketch).toEqual([])
    expect(clearSketch(plan)).toBe(plan)
  })

  it('moves one point of an item, as a handle drags', () => {
    const line = newSketch(L, 'line', [[0, 0], [4, 0]])
    expect(sketchOf(moveSketchPoint(addSketch(base(), line), line.id, 1, [4, 2]))[0].pts).toEqual([[0, 0], [4, 2]])
  })

  it('keeps the sketch when a level goes: it moves to a level that stays', () => {
    const up = addLevelAbove(base())
    const plan = addSketch(up.plan, newSketch(up.id, 'line', [[0, 0], [1, 0]]))
    const after = deleteLevel(plan, up.id)
    expect(sketchOf(after).map(s => s.level)).toEqual([L])
  })
})

describe('picking the sketch', () => {
  const up = addLevelAbove(normalizePlan(garageFloor()))
  const a = newSketch(L, 'line', [[20, 0], [24, 0]])
  const m = newSketch(up.id, 'measure', [[20, 2], [24, 2]])
  const plan = addSketch(addSketch(up.plan, a), m)

  it('is found by its id, with the level it was drawn on', () => {
    expect(findSelection(plan, m.id)).toEqual({ sel: { type: 'sketch', id: m.id }, level: up.id })
  })

  it('is picked on every level, unless the layer is hidden', () => {
    const ids = (l: string, o = {}) => allOnLevel(plan, l, o).filter(s => s.type === 'sketch').map(s => s.id)
    expect(ids(L)).toEqual([a.id, m.id])
    expect(ids(up.id)).toEqual([a.id, m.id])
    expect(ids(L, { sketch: false })).toEqual([])
    const inBox = itemsWhere(plan, L, p => p[0] >= 19 && p[1] <= 1)
    expect(inBox).toEqual([{ type: 'sketch', id: a.id }])
  })

  it('moves, copies, pastes and deletes like everything else', () => {
    const sel = [{ type: 'sketch' as const, id: a.id }]
    expect(sketchOf(translateSelection(plan, sel, [1, 2])).find(s => s.id === a.id)!.pts).toEqual([[21, 2], [25, 2]])
    const clip = copySelection(plan, sel)!
    const pasted = pasteClip(plan, clip, up.id, [0.3, 0.3])
    expect(pasted.added).toHaveLength(1)
    const copy = sketchOf(pasted.plan).find(s => s.id === pasted.added[0].id)!
    expect(copy.level).toBe(up.id)
    expect(copy.pts[0]).toEqual([20.3, 0.3])
    expect(sketchOf(deleteSelections(plan, sel)).map(s => s.id)).toEqual([m.id])
    expect(selectionName(plan, sel)).toBe('Sketch line')
    expect(selectionName(plan, [{ type: 'sketch', id: m.id }])).toBe('Measurement')
  })
})
