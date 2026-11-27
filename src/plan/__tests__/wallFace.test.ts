// Drawing walls by their outside or inside face (DB-10): the points and lengths are the face,
// the walls are kept by their centrelines.

import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { roomsForNewSpaces } from '../autoRooms'
import { garageFloor } from './fixtures'
import { normalizePlan, type Plan } from '../model'
import { bodySide, centreFromFace, faceRunStep, rectCentre, startSide, type FaceRun, type Side } from '../wallFace'

const empty = (): Plan => normalizePlan({ ...garageFloor(), levels: [{ id: 'g', name: 'Ground floor', elevation: 0, height: 2.7 }], walls: [], openings: [], rooms: [], furniture: [], stairs: [], areas: [], roofs: [] })
const ext = { kind: 'external' as const, thickness: 0.27 }
const close = (a: Vec2, b: Vec2) => {
  expect(a[0]).toBeCloseTo(b[0], 9)
  expect(a[1]).toBeCloseTo(b[1], 9)
}

/** Draw a run by its face, click by click, as the Wall tool does: each click one change. */
function drawRun(face: Vec2[], side: (pts: Vec2[]) => Side, closes = false): Plan {
  let plan = empty()
  let run: FaceRun = { ids: [] }
  for (let i = 1; i < face.length; i++) {
    const pts = face.slice(0, i + 1)
    const r = faceRunStep(plan, 'g', run, pts, closes && i === face.length - 1, side(pts), ext)
    plan = r.plan
    run = r.run
  }
  return plan
}

describe('which side a wall drawn by a face goes', () => {
  it('follows the run’s turn once it has one, the marker before that', () => {
    // Anticlockwise in the house frame: the outline closes round to the left.
    const ccw: Vec2[] = [
      [0, 0],
      [10, 0],
      [10, 8],
    ]
    expect(bodySide('outside', ccw, -1)).toBe(1)
    expect(bodySide('inside', ccw, 1)).toBe(-1)
    expect(bodySide('outside', [...ccw].reverse(), 1)).toBe(-1)
    // A straight run hasn't turned: the marker says.
    expect(bodySide('outside', [[0, 0], [5, 0], [10, 0.01]], -1)).toBe(-1)
    expect(bodySide('outside', ccw.slice(0, 2), 1)).toBe(1)
  })

  it('starts the marker inside a clockwise outline for the outside face, and flips', () => {
    expect(startSide('outside', 1, false)).toBe(1)
    expect(startSide('inside', 1, false)).toBe(-1)
    expect(startSide('outside', -1, true)).toBe(1)
  })
})

describe('a run drawn by its outside face', () => {
  it('10000 × 8000 by the outside face is 10000 × 8000 outside, the centreline half a wall in', () => {
    const face: Vec2[] = [
      [0, 0],
      [10, 0],
      [10, 8],
      [0, 8],
      [0, 0],
    ]
    const plan = drawRun(face, pts => bodySide('outside', pts, 1), true)
    expect(plan.walls).toHaveLength(4)
    const h = 0.135
    const xs = plan.walls.flatMap(w => [w.a[0], w.b[0]])
    const ys = plan.walls.flatMap(w => [w.a[1], w.b[1]])
    expect(Math.min(...xs)).toBeCloseTo(h, 9)
    expect(Math.max(...xs)).toBeCloseTo(10 - h, 9)
    expect(Math.min(...ys)).toBeCloseTo(h, 9)
    expect(Math.max(...ys)).toBeCloseTo(8 - h, 9)
    // Overall, face to face: the centreline plus a wall's thickness.
    expect(Math.max(...xs) - Math.min(...xs) + 0.27).toBeCloseTo(10, 9)
    // The corners still meet: each wall's end is the next one's start, the last back to the first.
    for (let i = 0; i < 4; i++) close(plan.walls[i].b, plan.walls[(i + 1) % 4].a)
    // And the four walls close round a room (as the store's commit makes it, src/plan/autoRooms.ts).
    expect(roomsForNewSpaces(empty(), plan).rooms.length).toBe(1)
  })

  it('by the inside face, the room inside is the size drawn', () => {
    const face: Vec2[] = [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
      [0, 0],
    ]
    const plan = drawRun(face, pts => bodySide('inside', pts, -1), true)
    const xs = plan.walls.flatMap(w => [w.a[0], w.b[0]])
    expect(Math.min(...xs)).toBeCloseTo(-0.135, 9)
    expect(Math.max(...xs) - Math.min(...xs) - 0.27).toBeCloseTo(4, 9)
  })

  it('a first wall goes to the marker’s side, then moves over when the turn says otherwise, in the same click', () => {
    let plan = empty()
    let r = faceRunStep(plan, 'g', { ids: [] }, [[0, 0], [10, 0]], false, -1, ext)
    plan = r.plan
    close(plan.walls[0].a, [0, -0.135])
    // The second wall turns left (anticlockwise): drawn by the outside face, the body is to the left.
    const pts: Vec2[] = [[0, 0], [10, 0], [10, 8]]
    r = faceRunStep(plan, 'g', r.run, pts, false, bodySide('outside', pts, -1), ext)
    expect(r.plan.walls).toHaveLength(2)
    close(r.plan.walls[0].a, [0, 0.135])
    close(r.plan.walls[0].b, [9.865, 0.135])
    close(r.plan.walls[1].a, [9.865, 0.135])
    close(r.plan.walls[1].b, [9.865, 8])
  })

  it('an L-shaped outline keeps its walls inside at the corner that turns back', () => {
    const face: Vec2[] = [
      [0, 0],
      [10, 0],
      [10, 4],
      [6, 4],
      [6, 8],
      [0, 8],
      [0, 0],
    ]
    const plan = drawRun(face, pts => bodySide('outside', pts, 1), true)
    // At the corner that turns back in (6, 4) the centreline is outside the face's corner, by half a wall each way.
    const corner = plan.walls[2].b
    close(corner, [6 - 0.135, 4 - 0.135])
  })

  it('starts afresh from the last corner if the run’s walls were undone', () => {
    const r = faceRunStep(empty(), 'g', { ids: ['gone'] }, [[0, 0], [5, 0], [5, 5]], false, 1, ext)
    expect(r.plan.walls).toHaveLength(1)
    close(r.plan.walls[0].a, [5 - 0.135, 0])
  })
})

describe('the centreline from a face', () => {
  it('moves each side square off the face and meets them at the corners', () => {
    const c = centreFromFace(
      [
        [0, 0],
        [4, 0],
        [4, 4],
      ],
      [0.1, 0.2],
      1,
    )
    close(c[0], [0, 0.1])
    close(c[1], [3.8, 0.1])
    close(c[2], [3.8, 4])
  })
})

describe('the rectangle room by a face', () => {
  it('by the outside face the corners come in, by the inside face they go out', () => {
    expect(rectCentre('outside', [0, 0], [10, 8], 0.27)).toEqual([
      [0.135, 0.135],
      [9.865, 7.865],
    ])
    expect(rectCentre('inside', [10, 8], [0, 0], 0.27)).toEqual([
      [10.135, 8.135],
      [-0.135, -0.135],
    ])
    expect(rectCentre('centre', [0, 0], [4, 3], 0.27)).toEqual([
      [0, 0],
      [4, 3],
    ])
  })
})
