// Copying doors and windows on their own (CB-11), and the copy and paste toasts' counts (DB-24).
// Uses the made-up garage plan only.

import { beforeEach, describe, expect, it } from 'vitest'
import { useSafety } from '../../safety/store'
import { copySelected, duplicateSelected, forgetCopied, pasteCopied, selectAllOnLevel } from '../editActions'
import { allOnLevel, clipCount, copySelection, selectedList } from '../editing'
import { normalizePlan } from '../model'
import { copyOpeningTo, COPY_GAP, freeSpot } from '../openingCopy'
import { openingClear, wallClear } from '../openingFit'
import { usePlan } from '../store'
import { garageFloor } from './fixtures'

const plan = () => usePlan.getState().plan!
const toast = () => useSafety.getState().toast
const wallOf = (id: string) => plan().walls.find(w => w.id === id)!

beforeEach(() => {
  usePlan.getState().load(normalizePlan({ ...garageFloor(), name: 'Sample house' }))
  forgetCopied()
  useSafety.setState({ review: null, toast: null, busy: false })
})

describe('a free spot in a wall', () => {
  it('is beside the original, a small gap along, clear of the corners and the other openings', () => {
    const p = garageFloor()
    const east = p.walls.find(w => w.id === 'east')!
    const win = p.openings.find(o => o.id === 'office_window')!
    const at = freeSpot(p, east, win.width, win.offset + win.width + COPY_GAP)!
    // Edge to edge with a 100 mm gap.
    expect(at - win.width / 2).toBeCloseTo(win.offset + win.width / 2 + COPY_GAP, 6)
    expect(openingClear(p.walls, east, { offset: at, width: win.width })).toBe(true)
  })

  it('goes to the nearest gap that is wide enough when the spot beside is taken', () => {
    const p = garageFloor()
    const east = p.walls.find(w => w.id === 'east')!
    // Past the stair opening (10.6 to 12.6 m along) there is under a metre left: a 2 m copy goes before it.
    const at = freeSpot(p, east, 2, 13.7)!
    expect(at + 1).toBeCloseTo(10.6 - COPY_GAP, 6)
    expect(wallClear(p.walls, east).to).toBeLessThan(13.7)
  })

  it('is null when no gap is wide enough', () => {
    const p = garageFloor()
    const hall = p.walls.find(w => w.id === 'hall_n')!
    expect(freeSpot(p, hall, 1.2, 0.5)).toBeNull()
    expect(copyOpeningTo(p, { ...p.openings[1], width: 1.2 }, hall)).toBeNull()
  })
})

describe('duplicating a door or window', () => {
  it('Ctrl+D puts a copy beside it in the same wall, selected, as one undo step', () => {
    const st = usePlan.getState()
    const before = plan().openings.length
    st.select({ type: 'opening', id: 'office_window' })
    expect(duplicateSelected()).toBe(true)
    expect(plan().openings).toHaveLength(before + 1)
    expect(usePlan.getState().past).toHaveLength(1)
    const sel = usePlan.getState().selection!
    const copy = plan().openings.find(o => o.id === sel.id)!
    const orig = plan().openings.find(o => o.id === 'office_window')!
    expect(sel.type).toBe('opening')
    expect(copy).toMatchObject({ wall: 'east', kind: 'window', width: orig.width, height: orig.height, sill: orig.sill })
    expect(copy.offset).toBeGreaterThan(orig.offset + orig.width - 1e-6)
    expect(openingClear(plan().walls, wallOf('east'), copy)).toBe(true)
    expect(toast()?.text).toBe('Window duplicated')
    // One Undo takes the copy away again.
    usePlan.getState().undo()
    expect(plan().openings).toHaveLength(before)
  })

  it('a row of windows: each Ctrl+D steps along the wall without overlapping', () => {
    usePlan.getState().select({ type: 'opening', id: 'office_window' })
    duplicateSelected()
    duplicateSelected()
    const on = plan().openings.filter(o => o.wall === 'east').sort((a, b) => a.offset - b.offset)
    for (let i = 1; i < on.length; i++) expect(on[i].offset - on[i].width / 2).toBeGreaterThanOrEqual(on[i - 1].offset + on[i - 1].width / 2 - 1e-6)
  })

  it('says so, and changes nothing, when the wall has no room for another', () => {
    usePlan.getState().select({ type: 'opening', id: 'garage_door' })
    const before = plan()
    duplicateSelected()
    expect(plan()).toBe(before)
    expect(usePlan.getState().past).toHaveLength(0)
    expect(toast()?.text).toMatch(/no room in that wall/)
  })
})

describe('copying and pasting a door or window', () => {
  it('Ctrl+C then Ctrl+V pastes one beside the original', () => {
    usePlan.getState().select({ type: 'opening', id: 'office_window' })
    expect(copySelected()).toBe(true)
    expect(toast()?.text).toMatch(/^Copied\./)
    pasteCopied()
    expect(plan().openings.filter(o => o.wall === 'east' && o.kind === 'window')).toHaveLength(2)
    expect(toast()?.text).toBe('Window pasted')
    expect(toast()?.undo).toBeTypeOf('function')
  })

  it('pastes into the wall that is picked, at the same distance along, kept inside it', () => {
    usePlan.getState().select({ type: 'opening', id: 'office_door' })
    copySelected()
    usePlan.getState().select({ type: 'wall', id: 'south' })
    pasteCopied()
    const sel = usePlan.getState().selection!
    const copy = plan().openings.find(o => o.id === sel.id)!
    expect(copy).toMatchObject({ wall: 'south', kind: 'door', width: 0.82 })
    expect(openingClear(plan().walls, wallOf('south'), copy)).toBe(true)
    expect(usePlan.getState().past).toHaveLength(1)
  })

  it('on another floor it asks for a wall instead of doing nothing silently', () => {
    usePlan.getState().select({ type: 'opening', id: 'entry' })
    copySelected()
    usePlan.setState({ activeLevel: 'somewhere_else', selection: null, extra: [] })
    const before = plan()
    pasteCopied()
    expect(plan()).toBe(before)
    expect(toast()?.text).toMatch(/Pick the wall/)
  })
})

describe('counts in the copy and paste toasts', () => {
  it('Select all, Copy and Paste all give the same number', () => {
    selectAllOnLevel()
    const picked = selectedList(usePlan.getState())
    const p = plan()
    // 10 walls, 5 doors, windows and openings, 4 rooms and an area.
    expect(picked).toHaveLength(20)
    expect(clipCount(copySelection(p, allOnLevel(p, 'level_ground'))!)).toBe(20)
    copySelected()
    expect(toast()?.text).toBe('20 items copied.')
    pasteCopied()
    expect(toast()?.text).toBe('20 items pasted')
    expect(selectedList(usePlan.getState())).toHaveLength(20)
    expect(usePlan.getState().past).toHaveLength(1)
  })

  it('the paste toast has Undo, which takes the pasted things away', async () => {
    usePlan.getState().select({ type: 'room', id: 'r1' })
    copySelected()
    pasteCopied()
    expect(plan().rooms).toHaveLength(5)
    expect(toast()?.text).toBe('Garage pasted')
    await toast()!.undo!()
    expect(plan().rooms).toHaveLength(4)
  })
})
