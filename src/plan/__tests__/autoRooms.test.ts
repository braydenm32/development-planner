// Rooms that make themselves when walls close round a space (CB-05), the Rectangle room tool's
// walls (HO-27, CB-17) and the first outline that zooms the plan to the house (HO-09). Uses made-up
// plans only.

import { beforeEach, describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { closesFirstOutline, labelSpot, nextRoomName, rectangleWalls, roomsForNewSpaces, roomsMadeNote, typedRectangle } from '../autoRooms'
import { faceAround, planarFaces } from '../geometry'
import { emptyPlan, normalizePlan, type Plan } from '../model'
import { addLevelAbove, addWall, deleteSelection, moveJoint, moveWall } from '../ops'
import { usePlan } from '../store'
import { garageFloor } from './fixtures'

const L = 'level_ground'
const EXT = { kind: 'external' as const, thickness: 0.27 }
const blank = (): Plan => emptyPlan({ e: 1000, n: 1000, rotation: 0, ffl: 50 })
const plan = () => usePlan.getState().plan!
const st = () => usePlan.getState()

/** Draw a run of walls corner to corner, each its own step, as the Wall tool does. */
const draw = (pts: Vec2[], style: { kind: 'external' | 'internal'; thickness: number } = EXT) => {
  for (let i = 0; i + 1 < pts.length; i++) st().commit(p => addWall(p, L, pts[i], pts[i + 1], style))
}
const BOX: Vec2[] = [[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]]
const names = () => plan().rooms.map(r => r.name)

describe('rooms from closed walls', () => {
  beforeEach(() => st().load(blank()))

  it('makes a room when the last wall closes the loop, in that wall’s undo step', () => {
    draw(BOX.slice(0, 4))
    expect(plan().rooms).toEqual([])
    const steps = st().past.length
    draw(BOX.slice(3))
    expect(st().past.length).toBe(steps + 1)
    expect(plan().rooms).toMatchObject([{ level: L, name: 'Room 1', at: [5, 4] }])
    expect(plan().rooms[0].type).toBeUndefined()
    st().undo()
    expect(plan().rooms).toEqual([])
    expect(plan().walls).toHaveLength(3)
    st().redo()
    expect(names()).toEqual(['Room 1'])
  })

  it('makes the second room when a wall cuts the first in two, and keeps both labels off the wall', () => {
    draw(BOX)
    // Straight through the middle, where Room 1’s label sits.
    draw([[5, 0], [5, 8]], { kind: 'internal', thickness: 0.11 })
    expect(names()).toEqual(['Room 1', 'Room 2'])
    const xs = plan().rooms.map(r => r.at[0]).sort()
    expect(xs).toEqual([2.5, 7.5])
    st().undo()
    expect(plan().rooms).toMatchObject([{ name: 'Room 1', at: [5, 4] }])
  })

  it('leaves a label someone moved where they put it', () => {
    draw(BOX)
    const id = plan().rooms[0].id
    st().commit(p => ({ ...p, rooms: p.rooms.map(r => (r.id === id ? { ...r, at: [2, 6] as Vec2 } : r)) }))
    draw([[6, 0], [6, 8]])
    expect(plan().rooms.find(r => r.id === id)!.at).toEqual([2, 6])
    expect(plan().rooms.find(r => r.id !== id)!.at).toEqual([8, 4])
  })

  it('keeps a centred label in the middle when its room is made bigger', () => {
    draw(BOX)
    st().commit(p => moveJoint(moveJoint(p, L, [10, 0], [12, 0]), L, [10, 8], [12, 8]))
    expect(plan().rooms).toMatchObject([{ name: 'Room 1', at: [6, 4] }])
  })

  it('makes the room when a wall end is dragged shut, as one step', () => {
    draw([[0, 0], [10, 0], [10, 8], [0, 8], [0, 1]])
    expect(plan().rooms).toEqual([])
    const steps = st().past.length
    st().beginGesture()
    st().preview(p => moveJoint(p, L, [0, 1], [0, 0.5]))
    expect(plan().rooms).toEqual([])
    st().preview(p => moveJoint(p, L, [0, 0.5], [0, 0]))
    st().endGesture()
    expect(names()).toEqual(['Room 1'])
    expect(st().past.length).toBe(steps + 1)
    st().undo()
    expect(plan().rooms).toEqual([])
  })

  it('makes no room for a sliver under 1 m², or for retaining walls', () => {
    draw([[0, 0], [0.9, 0], [0.9, 0.9], [0, 0.9], [0, 0]])
    expect(plan().rooms).toEqual([])
    st().load(blank())
    draw(BOX, { kind: 'retaining' as never, thickness: 0.2 })
    expect(plan().rooms).toEqual([])
  })

  it('numbers past names already taken, on any level', () => {
    expect(nextRoomName({ rooms: [{ id: 'a', level: L, name: 'Room 1', at: [0, 0] }, { id: 'b', level: 'x', name: ' room 2 ', at: [0, 0] }] })).toBe('Room 3')
  })

  it('gives a room standing free inside another its own room, and keeps the outer label clear of it', () => {
    draw(BOX)
    st().commit(p => rectangleWalls(p, L, [4, 3], [6, 5], EXT))
    expect(names()).toEqual(['Room 1', 'Room 2'])
    const faces = planarFaces(plan().walls).filter(f => f.area > 0)
    const [outer, inner] = plan().rooms.map(r => faceAround(r.at, faces)!)
    expect(Math.round(outer.area)).toBe(80)
    expect(Math.round(inner.area)).toBe(4)
    // Inside walls, since it stands in the house.
    expect(plan().walls.slice(4).every(w => w.kind === 'internal' && w.thickness === 0.11)).toBe(true)
  })

  it('gives a new level copied from the one below its room', () => {
    draw(BOX)
    let up = ''
    st().commit(p => {
      const r = addLevelAbove(p)
      up = r.id
      return r.plan
    })
    expect(plan().rooms.map(r => [r.level === up, r.name])).toEqual([
      [false, 'Room 1'],
      [true, 'Room 2'],
    ])
  })

  it('takes the hint bar’s line about the room away when the step is undone', () => {
    draw(BOX)
    st().notify('The walls close round a space, so it’s a room now: Room 1.')
    st().undo()
    expect(st().notice).toBeNull()
  })

  it('says what it made', () => {
    draw(BOX.slice(0, 4))
    const before = plan()
    draw(BOX.slice(3))
    expect(roomsMadeNote(before, plan())).toBe('The walls close round a space, so it’s a room now: Room 1. Select it to name it and pick its type.')
    expect(roomsMadeNote(plan(), plan())).toBeNull()
  })
})

describe('plans that already had their walls', () => {
  /** A closed box nobody named, as an older plan might have. */
  const unnamed = (): Plan => BOX.slice(0, 4).reduce((p, a, i) => addWall(p, L, a, BOX[i + 1], EXT), blank())

  it('opens with exactly the rooms it was saved with', () => {
    st().load(unnamed())
    expect(plan().rooms).toEqual([])
    const saved = normalizePlan(garageFloor())
    st().load(saved)
    expect(plan().rooms).toEqual(saved.rooms)
    // A change that isn't to the walls leaves them alone too.
    st().commit(p => ({ ...p, name: 'Sample house' }))
    expect(plan().rooms).toEqual(saved.rooms)
  })

  it('leaves a closed space with no room alone when its walls move or a stub wall goes in', () => {
    const p = unnamed()
    expect(roomsForNewSpaces(p, moveJoint(moveJoint(p, L, [10, 0], [12, 0]), L, [10, 8], [12, 8])).rooms).toEqual([])
    expect(roomsForNewSpaces(p, addWall(p, L, [5, 0], [5, 3], EXT)).rooms).toEqual([])
    const w = p.walls[1]
    expect(roomsForNewSpaces(p, moveWall(p, w.id, [-1, 0], p)).rooms).toEqual([])
  })

  it('gives both halves a room once a wall cuts that space, and a room to a new space beside it', () => {
    const p = unnamed()
    const cut = roomsForNewSpaces(p, addWall(p, L, [4, 0], [4, 8], EXT))
    expect(cut.rooms.map(r => [r.name, r.at])).toEqual([
      ['Room 1', [7, 4]],
      ['Room 2', [2, 4]],
    ])
    const beside = roomsForNewSpaces(p, rectangleWalls(p, L, [10, 0], [14, 4], EXT))
    expect(beside.rooms.map(r => r.at)).toEqual([[12, 2]])
  })

  it('keeps hand-placed labels and makes nothing when walls of a named house move', () => {
    const p = normalizePlan(garageFloor())
    const moved = roomsForNewSpaces(p, moveWall(p, 'south', [0, -0.5], p))
    // The Study's label was dead centre, so it stays dead centre of the bigger study; the rest were placed by hand.
    expect(moved.rooms).toEqual(p.rooms.map(r => (r.id === 'r4' ? { ...r, at: [7.7, 1.35] } : r)))
  })

  it('makes nothing when a wall is deleted, even where two unnamed spaces become one', () => {
    const p = addWall(unnamed(), L, [4, 0], [4, 8], EXT)
    const gone = deleteSelection(p, { type: 'wall', id: p.walls.at(-1)!.id })
    expect(roomsForNewSpaces(p, gone).rooms).toEqual([])
  })
})

describe('where a label sits', () => {
  const face = (pts: Vec2[]) => ({ pts, thickness: pts.map(() => 0.1), walls: [], area: 1 })

  it('is the middle of a plain room', () => {
    expect(labelSpot(face([[0, 0], [6, 0], [6, 4], [0, 4]]))).toEqual([3, 2])
  })

  it('is inside an L-shaped room, clear of its walls', () => {
    const l: Vec2[] = [[0, 0], [10, 0], [10, 3], [3, 3], [3, 10], [0, 10]]
    const [x, y] = labelSpot(face(l))
    // The middle of the L (about 3.4, 3.4) is outside it, at the inside corner.
    expect(x < 3 || y < 3).toBe(true)
    expect(Math.min(x, y)).toBeGreaterThan(1)
  })
})

describe('the Rectangle room tool', () => {
  beforeEach(() => st().load(blank()))

  it('draws four walls and their room as one undo step', () => {
    st().commit(p => rectangleWalls(p, L, [0, 0], [4, 3], EXT))
    expect(plan().walls).toHaveLength(4)
    expect(plan().walls.every(w => w.kind === 'external' && w.thickness === 0.27 && w.level === L)).toBe(true)
    expect(plan().rooms).toMatchObject([{ name: 'Room 1', at: [2, 1.5] }])
    expect(st().past).toHaveLength(1)
    st().undo()
    expect(plan().walls).toEqual([])
    expect(plan().rooms).toEqual([])
  })

  it('works from any corner to the opposite one', () => {
    st().commit(p => rectangleWalls(p, L, [4, 3], [0, 0], EXT))
    expect(plan().rooms).toMatchObject([{ at: [2, 1.5] }])
  })

  it('shares the wall of the room it is drawn against, adding only what is missing', () => {
    st().commit(p => rectangleWalls(p, L, [0, 0], [4, 3], EXT))
    // Same height: the shared side is already there.
    st().commit(p => rectangleWalls(p, L, [4, 0], [8, 3], EXT))
    expect(plan().walls).toHaveLength(7)
    expect(names()).toEqual(['Room 1', 'Room 2'])
    // Taller, and starting lower: only the parts past the first room's wall are added on that side.
    st().commit(p => rectangleWalls(p, L, [0, 3], [-3, -1], EXT))
    const onShared = plan().walls.filter(w => w.a[0] === 0 && w.b[0] === 0)
    expect(onShared.map(w => [w.a[1], w.b[1]].sort((a, b) => a - b))).toEqual([
      [0, 3],
      [-1, 0],
    ])
    expect(names()).toEqual(['Room 1', 'Room 2', 'Room 3'])
    expect(plan().rooms[2].at).toEqual([-1.5, 1])
  })

  it('changes nothing for a rectangle too small to be a room', () => {
    const p = blank()
    expect(rectangleWalls(p, L, [0, 0], [0.2, 5], EXT)).toBe(p)
  })

  it('reads a typed width × depth in mm, towards the pointer', () => {
    expect(typedRectangle('4000x3000', [1, 1], [5, 5])).toEqual([5, 4])
    expect(typedRectangle('4000 × 3000', [1, 1], [0, 5])).toEqual([-3, 4])
    expect(typedRectangle('4000*3000', [1, 1], [0, 0], 1)).toEqual([-2, -3])
    expect(typedRectangle('4000', [1, 1], [5, 5])).toBeNull()
    expect(typedRectangle('4000x', [1, 1], [5, 5])).toBeNull()
    expect(typedRectangle('0x3000', [1, 1], [5, 5])).toBeNull()
  })
})

describe('the first outline', () => {
  it('is the change that closes the house’s first space, and no later one', () => {
    const open = BOX.slice(0, 3).reduce((p, a, i) => addWall(p, L, a, BOX[i + 1], EXT), blank())
    const closed = addWall(open, L, BOX[3], BOX[4], EXT)
    expect(closesFirstOutline(blank(), open)).toBe(false)
    expect(closesFirstOutline(open, closed)).toBe(true)
    expect(closesFirstOutline(closed, rectangleWalls(closed, L, [10, 0], [14, 4], EXT))).toBe(false)
  })
})
