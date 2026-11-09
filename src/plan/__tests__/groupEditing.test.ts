// Arrow nudges, groups, copy and paste, Delete's toast and the level delete's review sheet.
// Uses the made-up garage plan only.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSafety } from '../../safety/store'
import { findSelection } from '../../shell/selection'
import { copySelected, forgetCopied, deleteLevelWithReview, deleteSelected, duplicateSelected, nudgeSelected, pasteCopied, selectAllOnLevel } from '../editActions'
import { allOnLevel, copySelection, itemsInBox, pasteClip, selectionCounts, selectionName, translateSelection } from '../editing'
import { normalizePlan } from '../model'
import { addLevelAbove } from '../ops'
import { usePlan, type Selection } from '../store'
import { garageFloor } from './fixtures'

const load = () => usePlan.getState().load(normalizePlan({ ...garageFloor(), name: 'Sample house' }))
const plan = () => usePlan.getState().plan!
const L = 'level_ground'

beforeEach(() => {
  load()
  forgetCopied()
  useSafety.setState({ review: null, toast: null, busy: false })
})
afterEach(() => vi.useRealTimers())

describe('moving a selection', () => {
  it('moves furniture, rooms and areas by the step', () => {
    const p = garageFloor()
    const room = p.rooms[0]
    const moved = translateSelection(p, [{ type: 'room', id: room.id }, { type: 'area', id: 'a1' }], [0.01, -0.01])
    expect(moved.rooms[0].at).toEqual([room.at[0] + 0.01, room.at[1] - 0.01])
    expect(moved.areas[0].pts[0]).toEqual([p.areas[0].pts[0][0] + 0.01, p.areas[0].pts[0][1] - 0.01])
    expect(moved.rooms[1]).toBe(p.rooms[1])
  })

  it('moves a wall with its doors, and the walls joined to it follow', () => {
    const p = garageFloor()
    const moved = translateSelection(p, [{ type: 'wall', id: 'garage_n' }], [0, 0.1])
    expect(moved.walls.find(w => w.id === 'garage_n')!.a[1]).toBeCloseTo(10.65, 9)
    // the garage's west wall ends there, so it stretches
    expect(moved.walls.find(w => w.id === 'garage_w')!.b[1]).toBeCloseTo(10.65, 9)
    expect(moved.openings.find(o => o.id === 'garage_door')!.offset).toBe(4)
  })

  it('slides a door along its wall by the part of the move along it', () => {
    const p = garageFloor()
    // hall_n runs from x 9.95 to 8.1, so its direction is -x
    const moved = translateSelection(p, [{ type: 'opening', id: 'entry' }], [0.1, 0.1])
    expect(moved.openings.find(o => o.id === 'entry')!.offset).toBeCloseTo(0.8, 9)
  })

  it('moves a door once when its wall is picked too', () => {
    const p = garageFloor()
    const moved = translateSelection(p, [{ type: 'wall', id: 'garage_n' }, { type: 'opening', id: 'garage_door' }], [0.1, 0])
    expect(moved.openings.find(o => o.id === 'garage_door')!.offset).toBe(4)
  })
})

describe('arrow nudges', () => {
  it('moves the selection 10 mm, or 100 mm with Shift, and a run is one undo step', () => {
    const st = usePlan.getState()
    st.select({ type: 'room', id: 'r1' })
    const at = plan().rooms[0].at
    nudgeSelected([1, 0], false)
    nudgeSelected([1, 0], false)
    nudgeSelected([0, 1], true)
    expect(plan().rooms[0].at[0]).toBeCloseTo(at[0] + 0.02, 9)
    expect(plan().rooms[0].at[1]).toBeCloseTo(at[1] + 0.1, 9)
    expect(usePlan.getState().past).toHaveLength(1)
    usePlan.getState().undo()
    expect(plan().rooms[0].at).toEqual(at)
  })

  it('starts a new undo step after a pause, or for another selection', () => {
    vi.useFakeTimers()
    usePlan.getState().select({ type: 'room', id: 'r1' })
    nudgeSelected([1, 0], false)
    vi.advanceTimersByTime(2000)
    nudgeSelected([1, 0], false)
    expect(usePlan.getState().past).toHaveLength(2)
    usePlan.getState().select({ type: 'room', id: 'r2' })
    nudgeSelected([1, 0], false)
    expect(usePlan.getState().past).toHaveLength(3)
  })

  it('does nothing with nothing selected', () => {
    expect(nudgeSelected([1, 0], false)).toBe(false)
    expect(usePlan.getState().past).toHaveLength(0)
  })
})

describe('undo and redo keep the selection', () => {
  it('when the item is still there', () => {
    const st = usePlan.getState()
    st.select({ type: 'room', id: 'r1' })
    st.commit(p => ({ ...p, rooms: p.rooms.map(r => (r.id === 'r1' ? { ...r, name: 'Car port' } : r)) }))
    usePlan.getState().undo()
    expect(usePlan.getState().selection).toEqual({ type: 'room', id: 'r1' })
    usePlan.getState().redo()
    expect(usePlan.getState().selection).toEqual({ type: 'room', id: 'r1' })
  })

  it('drops items that are gone, and keeps the rest of a group', () => {
    const st = usePlan.getState()
    st.selectMany([{ type: 'room', id: 'r1' }, { type: 'room', id: 'r2' }])
    st.commit(p => ({ ...p, rooms: p.rooms.filter(r => r.id !== 'r2') }))
    usePlan.getState().undo()
    expect(usePlan.getState().selection).toEqual({ type: 'room', id: 'r1' })
    usePlan.getState().redo()
    expect(usePlan.getState().selection).toEqual({ type: 'room', id: 'r1' })
    expect(usePlan.getState().extra).toEqual([])
    // undoing the creation of a room that was selected clears it
    st.commit(p => ({ ...p, rooms: [...p.rooms, { id: 'new', level: L, name: 'New', at: [1, 1] as [number, number] }] }))
    st.select({ type: 'room', id: 'new' })
    usePlan.getState().undo()
    expect(usePlan.getState().selection).toBeNull()
  })

  it('findSelection still finds what it did', () => {
    expect(findSelection(plan(), 'entry')?.level).toBe(L)
  })
})

describe('picking several', () => {
  it('adds, removes, and keeps the first as the one the panels read', () => {
    const st = usePlan.getState()
    st.select({ type: 'room', id: 'r1' })
    usePlan.getState().toggleSelect({ type: 'room', id: 'r2' })
    expect(usePlan.getState().selection).toEqual({ type: 'room', id: 'r1' })
    expect(usePlan.getState().extra).toEqual([{ type: 'room', id: 'r2' }])
    usePlan.getState().toggleSelect({ type: 'room', id: 'r1' })
    expect(usePlan.getState().selection).toEqual({ type: 'room', id: 'r2' })
    expect(usePlan.getState().extra).toEqual([])
    usePlan.getState().select({ type: 'room', id: 'r3' })
    expect(usePlan.getState().extra).toEqual([])
  })

  it('picks everything on the level, and only that level', () => {
    const added = addLevelAbove(plan())
    usePlan.getState().commit(() => added.plan)
    selectAllOnLevel()
    const st = usePlan.getState()
    const all = [st.selection!, ...st.extra]
    expect(all).toHaveLength(allOnLevel(plan(), L).length)
    expect(all.every(s => findSelection(plan(), s.id)?.level === L)).toBe(true)
    expect(all.some(s => s.type === 'opening')).toBe(true)
  })

  it('picks what lies wholly inside a box', () => {
    const got = itemsInBox(plan(), L, [5, 0], [10.5, 5])
    const ids = got.map(s => s.id)
    // the study and laundry labels, the office walls and their doors
    expect(ids).toContain('r3')
    expect(ids).toContain('r4')
    expect(ids).toContain('south')
    expect(ids).toContain('office_door')
    // the garage and the long east wall poke out of the box
    expect(ids).not.toContain('r1')
    expect(ids).not.toContain('east')
  })

  it('counts and names a group', () => {
    const sels: Selection[] = [{ type: 'wall', id: 'south' }, { type: 'wall', id: 'east' }, { type: 'room', id: 'r1' }]
    expect(selectionCounts(sels)).toBe('2 walls, 1 room')
    expect(selectionName(plan(), sels)).toBe('3 items')
    expect(selectionName(plan(), [sels[0]])).toBe('Wall')
    expect(selectionName(plan(), [{ type: 'room', id: 'r1' }])).toBe('Garage')
    expect(selectionName(plan(), [{ type: 'opening', id: 'entry' }])).toBe('Door')
  })

  it('moves a group in one undo step', () => {
    const st = usePlan.getState()
    st.selectMany([{ type: 'room', id: 'r1' }, { type: 'wall', id: 'south' }])
    st.beginGesture()
    st.preview(p => translateSelection(p, [{ type: 'room', id: 'r1' }, { type: 'wall', id: 'south' }], [0.5, 0]))
    st.endGesture()
    expect(usePlan.getState().past).toHaveLength(1)
  })
})

describe('copy, paste and duplicate', () => {
  it('copies a wall with its doors and windows, with new ids, offset', () => {
    const p = garageFloor()
    const clip = copySelection(p, [{ type: 'wall', id: 'east' }])!
    expect(clip.walls).toHaveLength(1)
    expect(clip.openings.map(o => o.id).sort()).toEqual(['office_window', 'stairs_gap'])
    const r = pasteClip(p, clip, L, [0.3, 0.3])
    const wall = r.plan.walls.at(-1)!
    expect(wall.id).not.toBe('east')
    expect(wall.a).toEqual([10.25, 0.45])
    const mine = r.plan.openings.filter(o => o.wall === wall.id)
    expect(mine).toHaveLength(2)
    expect(mine.every(o => !['office_window', 'stairs_gap'].includes(o.id))).toBe(true)
    expect(r.added).toEqual([{ type: 'wall', id: wall.id }])
    // the original is untouched
    expect(r.plan.walls.find(w => w.id === 'east')!.a).toEqual([9.95, 0.15])
  })

  it('copies a door only with its wall', () => {
    expect(copySelection(garageFloor(), [{ type: 'opening', id: 'entry' }])).toBeNull()
  })

  it('pastes, selects the pasted things and is one undo step; a second paste steps further', () => {
    const st = usePlan.getState()
    st.select({ type: 'room', id: 'r1' })
    copySelected()
    pasteCopied()
    const sel = usePlan.getState().selection!
    expect(sel.type).toBe('room')
    expect(sel.id).not.toBe('r1')
    expect(plan().rooms).toHaveLength(5)
    expect(usePlan.getState().past).toHaveLength(1)
    const first = plan().rooms.find(r => r.id === sel.id)!.at
    pasteCopied()
    const second = plan().rooms.find(r => r.id === usePlan.getState().selection!.id)!.at
    expect(second[0]).toBeCloseTo(first[0] + 0.3, 9)
    usePlan.getState().undo()
    expect(plan().rooms).toHaveLength(5)
  })

  it('pastes onto the level being shown', () => {
    const added = addLevelAbove(plan())
    usePlan.getState().commit(() => added.plan)
    usePlan.getState().select({ type: 'area', id: 'a1' })
    copySelected()
    usePlan.getState().setActiveLevel(added.id)
    pasteCopied()
    const sel = usePlan.getState().selection!
    expect(plan().areas.find(a => a.id === sel.id)!.level).toBe(added.id)
  })

  it('duplicates in one step without touching what was copied', () => {
    usePlan.getState().select({ type: 'area', id: 'a1' })
    expect(duplicateSelected()).toBe(true)
    expect(plan().areas).toHaveLength(2)
    expect(usePlan.getState().past).toHaveLength(1)
    expect(usePlan.getState().selection!.id).not.toBe('a1')
  })

  it('pastes nothing before anything is copied', () => {
    expect(pasteCopied()).toBe(false)
  })
})

describe('Delete', () => {
  it('says what went and offers Undo', () => {
    usePlan.getState().select({ type: 'room', id: 'r4' })
    expect(deleteSelected()).toBe(true)
    expect(plan().rooms.find(r => r.id === 'r4')).toBeUndefined()
    const t = useSafety.getState().toast!
    expect(t.text).toBe('Study deleted')
    expect(t.undo).toBeTypeOf('function')
    void t.undo!()
    expect(plan().rooms.find(r => r.id === 'r4')).toBeDefined()
    // and the item is selected again
    expect(usePlan.getState().selection).toEqual({ type: 'room', id: 'r4' })
  })

  it('deletes a whole group as one step', () => {
    usePlan.getState().selectMany([{ type: 'wall', id: 'south' }, { type: 'room', id: 'r1' }, { type: 'area', id: 'a1' }])
    deleteSelected()
    expect(useSafety.getState().toast!.text).toBe('3 items deleted')
    expect(plan().walls.find(w => w.id === 'south')).toBeUndefined()
    expect(plan().areas).toHaveLength(0)
    expect(usePlan.getState().past).toHaveLength(1)
  })

  it('lets its toast go when something else changes the plan, so Undo never undoes another thing', () => {
    usePlan.getState().select({ type: 'room', id: 'r4' })
    deleteSelected()
    expect(useSafety.getState().toast).not.toBeNull()
    usePlan.getState().commit(p => ({ ...p, rooms: p.rooms.filter(r => r.id !== 'r3') }))
    expect(useSafety.getState().toast).toBeNull()
  })
})

describe('deleting a level', () => {
  it('asks in the app’s own review sheet, then offers Undo', async () => {
    const added = addLevelAbove(plan())
    usePlan.getState().commit(() => added.plan)
    usePlan.getState().setActiveLevel(added.id)
    const done = deleteLevelWithReview(added.id)
    const review = useSafety.getState().review!
    expect(review.kind).toBe('delete-level')
    expect(review.title).toContain('First floor')
    // nothing changes until it's confirmed
    expect(plan().levels).toHaveLength(2)
    review.answer('ok')
    expect(await done).toBe(true)
    expect(plan().levels).toHaveLength(1)
    expect(useSafety.getState().toast!.text).toBe('First floor deleted')
    useSafety.getState().toast!.undo!()
    expect(plan().levels).toHaveLength(2)
    expect(usePlan.getState().activeLevel).toBe(added.id)
  })

  it('leaves the level when cancelled, and never deletes the last one', async () => {
    const added = addLevelAbove(plan())
    usePlan.getState().commit(() => added.plan)
    const done = deleteLevelWithReview(added.id)
    useSafety.getState().review!.answer(null)
    expect(await done).toBe(false)
    expect(plan().levels).toHaveLength(2)
    usePlan.getState().commit(p => ({ ...p, levels: p.levels.slice(0, 1) }))
    expect(await deleteLevelWithReview(L)).toBe(false)
    expect(useSafety.getState().review).toBeNull()
  })
})
