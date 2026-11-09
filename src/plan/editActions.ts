// What the plan's edit keys do (arrows, Delete, Ctrl/Cmd+A, C, V and D) and the level delete,
// with the toast that says what happened. The keys call these; so can anything else.

import { askReview, dismissToast, showToast } from '../safety/store'
import type { Vec2 } from '../lib/geom'
import { allOnLevel, clipCount, copySelection, deleteSelections, pasteClip, selectedList, selectionName, translateSelection, type Clip } from './editing'
import { deleteLevel } from './ops'
import { sortedLevels, type Plan } from './model'
import { usePlan } from './store'

/** An arrow key moves 10 mm; with Shift, 100 mm. */
export const NUDGE = 0.01
export const NUDGE_BIG = 0.1
/** Pasted things land this far from where they were (m), a little further for each paste in a row. */
export const PASTE_OFFSET = 0.3

/** An Undo toast that goes away on its own once something else changes the plan, so its Undo never undoes another thing. */
function undoToastFor(text: string, restore?: () => void) {
  const after = usePlan.getState().plan
  let unsub = () => {}
  const id = showToast({
    text,
    undo: () => {
      const st = usePlan.getState()
      if (st.plan !== after) return
      st.undo()
      restore?.()
    },
    settle: () => unsub(),
  })
  unsub = usePlan.subscribe(s => {
    if (s.plan === after) return
    unsub()
    dismissToast(id)
  })
}

/** Move the selection by `dir` (a unit step in the plan's frame), 10 mm or 100 mm. One undo step for a run of presses. */
export function nudgeSelected(dir: Vec2, big: boolean): boolean {
  const st = usePlan.getState()
  const sels = selectedList(st)
  if (!st.plan || !sels.length) return false
  const d = big ? NUDGE_BIG : NUDGE
  const delta: Vec2 = [dir[0] * d, dir[1] * d]
  st.nudge(sels.map(s => s.id).join(','), p => translateSelection(p, sels, delta))
  return true
}

/** Delete what is selected, and say so, with Undo. */
export function deleteSelected(): boolean {
  const st = usePlan.getState()
  const sels = selectedList(st)
  if (!st.plan || !sels.length) return false
  const name = selectionName(st.plan, sels)
  st.commit(p => deleteSelections(p, sels))
  st.select(null)
  undoToastFor(`${name} deleted`, () => usePlan.getState().selectMany(sels))
  return true
}

let clipboard: Clip | null = null
/** The level the clipboard was copied on: pasting on another level puts things in the same place. */
let copiedOn: string | null = null
let pastes = 0

/** Empty the clipboard (tests, and a new project). */
export function forgetCopied() {
  clipboard = null
  copiedOn = null
  pastes = 0
}

/** Copy what is selected (walls take their doors and windows). */
export function copySelected(): boolean {
  const st = usePlan.getState()
  const sels = selectedList(st)
  if (!st.plan || !sels.length) return false
  const clip = copySelection(st.plan, sels)
  if (!clip) {
    showToast({ text: 'Doors and windows are copied with their wall. Pick the wall to copy it.' })
    return true
  }
  clipboard = clip
  copiedOn = st.activeLevel
  pastes = 0
  const n = clipCount(clip)
  showToast({ text: n === 1 ? 'Copied. Press Ctrl+V (⌘V on a Mac) to paste.' : `${n} items copied.` })
  return true
}

function put(clip: Clip, offset: Vec2) {
  const st = usePlan.getState()
  if (!st.plan) return
  let added: ReturnType<typeof pasteClip>['added'] = []
  st.commit(p => {
    const r = pasteClip(p, clip, st.activeLevel, offset)
    added = r.added
    return r.plan
  })
  st.selectMany(added)
}

/**
 * Paste the copied things on the level being shown. On the level they came from they land a
 * little off from where they were, so they're seen; on another level, or with `inPlace`
 * (Ctrl+Shift+V), right where they were, lined up with the floor they came from.
 */
export function pasteCopied(inPlace = false): boolean {
  if (!clipboard) return false
  const st = usePlan.getState()
  const elsewhere = copiedOn !== null && copiedOn !== st.activeLevel
  if (inPlace || elsewhere) {
    put(clipboard, [0, 0])
    const level = st.plan?.levels.find(l => l.id === st.activeLevel)
    showToast({ text: elsewhere && level ? `Pasted in place on ${level.name}.` : 'Pasted in place.' })
    return true
  }
  pastes += 1
  put(clipboard, [PASTE_OFFSET * pastes, PASTE_OFFSET * pastes])
  return true
}

/** Copy and paste in one go, without touching what was copied. */
export function duplicateSelected(): boolean {
  const st = usePlan.getState()
  const sels = selectedList(st)
  if (!st.plan || !sels.length) return false
  const clip = copySelection(st.plan, sels)
  if (!clip) return false
  put(clip, [PASTE_OFFSET, PASTE_OFFSET])
  return true
}

/** Select everything on the level being shown. */
export function selectAllOnLevel(): boolean {
  const st = usePlan.getState()
  if (!st.plan) return false
  st.selectMany(allOnLevel(st.plan, st.activeLevel))
  return true
}

const count = (n: number, one: string, many = `${one}s`) => (n ? [`${n} ${n === 1 ? one : many}`] : [])

/** What a level holds, in words, for the review before it's deleted. */
export function levelContents(plan: Plan, id: string): string[] {
  const walls = new Set(plan.walls.filter(w => w.level === id).map(w => w.id))
  return [
    ...count(walls.size, 'wall'),
    ...count(plan.openings.filter(o => walls.has(o.wall)).length, 'door or window', 'doors and windows'),
    ...count(plan.rooms.filter(r => r.level === id).length, 'room'),
    ...count(plan.areas.filter(a => a.level === id).length, 'area'),
    ...count(plan.roofs.filter(r => r.level === id).length, 'roof', 'roofs'),
    ...count(plan.stairs.filter(s => s.level === id).length, 'stair'),
    ...count(plan.furniture.filter(f => f.level === id).length, 'piece of furniture', 'pieces of furniture'),
  ]
}

/** Delete a level after the app's own review sheet, then offer Undo. */
export async function deleteLevelWithReview(id: string): Promise<boolean> {
  const plan = usePlan.getState().plan
  const level = plan?.levels.find(l => l.id === id)
  if (!plan || !level || plan.levels.length <= 1) return false
  const contents = levelContents(plan, id)
  const choice = await askReview({
    kind: 'delete-level',
    title: `Delete ${level.name} and everything on it?`,
    facts: [{ label: 'On this level', value: contents.length ? contents.join(', ') : 'Nothing drawn yet' }],
    changes: [`${level.name} is removed, with everything drawn on it.`],
    kept: ['Your other levels', 'The block and survey', 'Undo, straight after'],
    confirm: 'Delete level',
    replaces: true,
  })
  const st = usePlan.getState()
  // The plan can have changed while the sheet was open (another project opened).
  if (!choice || st.plan !== plan) return false
  st.commit(p => deleteLevel(p, id))
  st.setActiveLevel(sortedLevels(usePlan.getState().plan!)[0].id)
  undoToastFor(`${level.name} deleted`, () => usePlan.getState().setActiveLevel(id))
  return true
}
