// Doors and windows against their wall: never dropped for being too big, kept clear of the wall
// that turns the corner, and changes that change nothing adding no undo step. Made-up boxes only.

import { beforeEach, describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { useSafety } from '../../safety/store'
import { emptyPlan, wallLength, type Plan, type Wall } from '../model'
import { addOpening, addRoom, addWall, deleteSelection, moveJoint, moveWall, updateOpening, updateRoof, updateWall } from '../ops'
import { fitOpenings, fixesText, openingClear, wallClear } from '../openingFit'
import { usePlan } from '../store'

const L = 'level_ground'
const wall = (id: string, a: Vec2, b: Vec2, thickness = 0.27): Wall => ({ id, level: L, a, b, thickness, kind: thickness > 0.15 ? 'external' : 'internal' })

/** A 10 × 8 m box of 270 mm walls: south, east, north and west. */
function box(): Plan {
  return {
    ...emptyPlan({ e: 0, n: 0, rotation: 0, ffl: 80 }),
    walls: [wall('s', [0, 0], [10, 0]), wall('e', [10, 0], [10, 8]), wall('n', [10, 8], [0, 8]), wall('w', [0, 8], [0, 0])],
  }
}
const by = (p: Plan, id: string) => p.walls.find(w => w.id === id)!
const door = { width: 0.82, height: 2.04, sill: 0 }
const garage = { width: 4.8, height: 2.1, sill: 0 }

describe('the clear run of a wall (DB-30)', () => {
  it('stops half a wall’s thickness short of a corner, and runs to a free end', () => {
    const p = box()
    const run = wallClear(p.walls, by(p, 'n'))
    expect(run.from).toBeCloseTo(0.135, 9)
    expect(run.to).toBeCloseTo(9.865, 9)
    const spur = wall('spur', [5, 0], [5, 3], 0.11)
    const withSpur = [...p.walls, spur]
    // The spur starts on the south wall (135 mm of it) and ends free.
    expect(wallClear(withSpur, spur)).toEqual({ from: 0.135, to: 3 })
    // A wall running on in line takes nothing.
    expect(wallClear([wall('a', [0, 0], [4, 0]), wall('b', [4, 0], [9, 0])], wall('a', [0, 0], [4, 0]))).toEqual({ from: 0, to: 4 })
  })

  it('a garage door placed at the corner sits clear of the return wall', () => {
    const p = box()
    const placed = addOpening(p, by(p, 'n'), 'garage', 0.1, garage)
    const o = placed.openings[0]
    expect(o.offset - o.width / 2).toBeCloseTo(0.135, 9)
  })
})

describe('an opening that no longer fits is narrowed, never dropped (DB-05, LD-05)', () => {
  it('a width wider than the wall is brought back to the widest that fits', () => {
    let p = box()
    p = addOpening(p, by(p, 'w'), 'window', 4, { width: 1.2, height: 1.2, sill: 0.9 })
    const r = fitOpenings(updateOpening(p, p.openings[0].id, { width: 12 }))
    expect(r.plan.openings).toHaveLength(1)
    expect(r.plan.openings[0].width).toBeCloseTo(7.73, 9)
    expect(r.plan.openings[0].offset).toBeCloseTo(4, 9)
    expect(fixesText(r.fixes)).toBe('Window narrowed to 7730 mm to fit its wall')
  })

  it('a wall dragged shorter than its garage door keeps the door, narrower', () => {
    let p = box()
    p = addOpening(p, by(p, 'n'), 'garage', 5, garage)
    const start = p
    const r = fitOpenings(moveWall(start, 'w', [6, 0], start))
    expect(wallLength(by(r.plan, 'n'))).toBeCloseTo(4, 9)
    expect(r.plan.openings).toHaveLength(1)
    expect(r.plan.openings[0].width).toBeCloseTo(3.73, 9)
    expect(fixesText(r.fixes)).toBe('Garage door narrowed to 3730 mm to fit its wall')
  })

  it('slides one along without a word, and lets one go with its wall', () => {
    let p = box()
    p = addOpening(p, by(p, 'n'), 'door', 9, door)
    const start = p
    const shorter = fitOpenings(moveJoint(start, L, [0, 8], [2, 8]))
    expect(shorter.fixes).toEqual([])
    expect(shorter.plan.openings[0].width).toBe(0.82)
    expect(shorter.plan.openings[0].offset).toBeLessThan(8)
    const gone = fitOpenings(deleteSelection(p, { type: 'wall', id: 'n' }))
    expect(gone.plan.openings).toEqual([])
    expect(gone.fixes).toEqual([])
  })

  it('the store says so with a toast that can undo it', () => {
    let p = box()
    p = addOpening(p, by(p, 'n'), 'garage', 5, garage)
    usePlan.getState().load(p)
    useSafety.setState({ toast: null })
    const start = usePlan.getState().plan!
    usePlan.getState().beginGesture()
    usePlan.getState().preview(() => moveWall(start, 'w', [6, 0], start))
    usePlan.getState().endGesture()
    expect(usePlan.getState().plan!.openings).toHaveLength(1)
    const toast = useSafety.getState().toast!
    expect(toast.text).toBe('Garage door narrowed to 3730 mm to fit its wall')
    void toast.undo!()
    expect(usePlan.getState().plan!.openings[0].width).toBe(4.8)
    expect(wallLength(by(usePlan.getState().plan!, 'n'))).toBeCloseTo(10, 9)
  })
})

describe('an opening an edit didn’t touch stays exactly as saved', () => {
  /** An older plan: a door hard against the corner of the west wall (inside the 135 mm corner zone), and a window too wide for the east wall's clear run. */
  function older(): Plan {
    const p = box()
    return {
      ...p,
      walls: [...p.walls, wall('shed', [20, 0], [24, 0])],
      openings: [
        { id: 'door', wall: 'w', kind: 'door', offset: 0.45, width: 0.82, height: 2.04, sill: 0, flipHinge: false, flipSwing: false },
        { id: 'wide', wall: 'e', kind: 'window', offset: 4, width: 7.9, height: 1.2, sill: 0.9, flipHinge: false, flipSwing: false },
      ],
    }
  }
  const door = () => usePlan.getState().plan!.openings.find(o => o.id === 'door')!
  const wide = () => usePlan.getState().plan!.openings.find(o => o.id === 'wide')!
  beforeEach(() => {
    usePlan.getState().load(older())
    useSafety.setState({ toast: null })
  })

  it('an unrelated edit leaves its offset and width alone, and says nothing', () => {
    const st = usePlan.getState()
    // A wall that touches neither opening's wall: retyped, moved, and a new one drawn; then a room and a setting.
    st.commit(p => updateWall(p, 'shed', { thickness: 0.2 }))
    st.commit(p => moveWall(p, 'shed', [0, 1], p))
    st.commit(p => addWall(p, L, [20, 5], [24, 5], { kind: 'external', thickness: 0.27 }))
    st.commit(p => addRoom(p, L, [5, 4], 'Living'))
    st.commit(p => ({ ...p, name: 'Renamed' }))
    // A drag of that wall, there and back and there again.
    const start = usePlan.getState().plan!
    st.beginGesture()
    st.preview(() => moveWall(start, 'shed', [1, 0], start))
    st.preview(() => moveWall(start, 'shed', [2, 0], start))
    st.endGesture()
    expect(usePlan.getState().past.length).toBe(6)
    expect(door()).toMatchObject({ offset: 0.45, width: 0.82 })
    expect(wide()).toMatchObject({ offset: 4, width: 7.9 })
    expect(useSafety.getState().toast).toBeNull()
    // The card can still say it's in the corner zone.
    const p = usePlan.getState().plan!
    expect(openingClear(p.walls, by(p, 'w'), door())).toBe(false)
  })

  it('editing one opening fits that one only', () => {
    usePlan.getState().commit(p => updateOpening(p, 'door', { height: 2.1 }))
    expect(door().offset).toBeCloseTo(0.135 + 0.41, 9)
    expect(wide()).toMatchObject({ offset: 4, width: 7.9 })
  })

  it('a change to its own wall fits it: its ends moving, or a wall newly joined at its corner', () => {
    const st = usePlan.getState()
    // The north wall moves in, taking the west wall's start and the east wall's end with it: the
    // door is slid clear of the corner, and the window is narrowed to the shorter east wall.
    st.commit(p => moveWall(p, 'n', [0, -1], p))
    expect(door().offset).toBeCloseTo(0.545, 9)
    expect(wide().width).toBeCloseTo(6.73, 9)
    expect(useSafety.getState().toast?.text).toBe('Window narrowed to 6730 mm to fit its wall')
    // A free-standing wall with a door at its end, then a wall drawn square off that end.
    usePlan.getState().load({ ...box(), walls: [wall('a', [0, 0], [4, 0])], openings: [{ id: 'door', wall: 'a', kind: 'door', offset: 0.41, width: 0.82, height: 2.04, sill: 0, flipHinge: false, flipSwing: false }] })
    usePlan.getState().commit(p => addWall(p, L, [20, 5], [24, 5], { kind: 'external', thickness: 0.27 }))
    expect(door().offset).toBe(0.41)
    usePlan.getState().commit(p => addWall(p, L, [0, 0], [0, 3], { kind: 'external', thickness: 0.27 }))
    expect(door().offset).toBeCloseTo(0.545, 9)
  })

  it('a drag that takes its wall away and back leaves it as it was', () => {
    const st = usePlan.getState()
    const start = usePlan.getState().plan!
    st.beginGesture()
    st.preview(() => moveWall(start, 'n', [0, 1], start))
    expect(door().offset).toBeCloseTo(0.545, 9)
    st.preview(() => moveWall(start, 'n', [0, 0], start))
    st.endGesture()
    expect(door().offset).toBe(0.45)
    expect(usePlan.getState().past.length).toBe(0)
  })
})

describe('changes that change nothing add no undo step and keep Redo (LD-19)', () => {
  const style = { kind: 'external' as const, thickness: 0.27 }
  beforeEach(() => usePlan.getState().load(box()))
  const steps = () => usePlan.getState().past.length

  it('a wall with no length, or one drawn on a wall already there', () => {
    const st = usePlan.getState()
    st.commit(p => addWall(p, L, [20, 0], [24, 0], style))
    st.undo()
    expect(usePlan.getState().future).toHaveLength(1)
    const before = usePlan.getState().plan
    st.commit(p => addWall(p, L, [3, 3], [3, 3], style))
    st.commit(p => addWall(p, L, [0, 0], [10, 0], style))
    expect(steps()).toBe(0)
    expect(usePlan.getState().future).toHaveLength(1)
    expect(usePlan.getState().plan).toBe(before)
  })

  it('a setting put to the value it already has', () => {
    const st = usePlan.getState()
    st.commit(p => ({ ...p, roofs: [{ id: 'r', level: L, pts: [[0, 0], [10, 0], [10, 8], [0, 8]], type: 'hip', pitch: 75, overhang: 0.45, gables: [], lowEdge: 0 }] }))
    expect(steps()).toBe(1)
    st.commit(p => updateRoof(p, 'r', { pitch: Math.min(76, 75) }))
    st.commit(p => ({ ...p, walls: p.walls.map(w => ({ ...w })) }))
    expect(steps()).toBe(1)
  })

  it('a drag that ends where it began', () => {
    const st = usePlan.getState()
    const start = usePlan.getState().plan!
    st.beginGesture()
    st.preview(() => moveWall(start, 'e', [1, 0], start))
    st.preview(() => moveWall(start, 'e', [0, 0], start))
    st.endGesture()
    expect(steps()).toBe(0)
    expect(usePlan.getState().plan).toBe(start)
    // One that moved something is still one step.
    st.beginGesture()
    st.preview(() => moveWall(start, 'e', [1, 0], start))
    st.endGesture()
    expect(steps()).toBe(1)
  })
})
