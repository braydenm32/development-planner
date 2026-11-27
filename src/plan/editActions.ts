// What the plan's edit keys do (arrows, Delete, Ctrl/Cmd+A, C, X, V and D) and the level delete,
// with the toast that says what happened. The keys call these; so can anything else.

import { askReview, dismissToast, showToast } from '../safety/store'
import type { Vec2 } from '../lib/geom'
import { allOnLevel, clipCount, copySelection, deleteSelections, pasteClip, selectedList, selectionName, translateSelection, type Clip } from './editing'
import { deleteLevel } from './ops'
import { floorRL, type Plan } from './model'
import { usePlan } from './store'
import { levelLeftAbove } from './storeys'
import { useSketch } from '../sketch/store'

/** An arrow key moves 10 mm; with Shift, 100 mm. */
export const NUDGE = 0.01
export const NUDGE_BIG = 0.1
/** Pasted things land this far from where they were (m), a little further for each paste in a row. */
export const PASTE_OFFSET = 0.3

/** An Undo toast that goes away on its own once something else changes the plan, so its Undo never undoes another thing. */
export function undoToastFor(text: string, restore?: () => void) {
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

/** Copy what is selected: walls take their doors and windows, and a door or window can be copied on its own. */
export function copySelected(): boolean {
  const st = usePlan.getState()
  const sels = selectedList(st)
  if (!st.plan || !sels.length) return false
  const clip = copySelection(st.plan, sels)
  if (!clip) return false
  clipboard = clip
  copiedOn = st.activeLevel
  pastes = 0
  const n = clipCount(clip)
  showToast({ text: n === 1 ? 'Copied. Press Ctrl+V (⌘V on a Mac) to paste.' : `${n} items copied.` })
  return true
}

/**
 * Cut: copy what is selected, then take it away, as one undo step (the toast has Undo). The
 * first paste on the same level puts it back exactly where it was.
 */
export function cutSelected(): boolean {
  const st = usePlan.getState()
  const sels = selectedList(st)
  if (!st.plan || !sels.length) return false
  const clip = copySelection(st.plan, sels)
  if (!clip) return false
  clipboard = clip
  copiedOn = st.activeLevel
  pastes = -1
  const name = selectionName(st.plan, sels)
  st.commit(p => deleteSelections(p, sels))
  st.select(null)
  undoToastFor(`${name} cut. Press Ctrl+V (⌘V on a Mac) to paste.`, () => usePlan.getState().selectMany(sels))
  return true
}

/** Why a door or window copied on its own couldn't be pasted. */
const NO_ROOM = 'There’s no room in that wall for another one that size. Make a gap, or pick another wall and paste.'
const NO_WALL = 'Pick the wall to put it in, then paste.'

/**
 * Put a clip on the level being shown, as one undo step, select what was added and say so (`did`:
 * "pasted", "duplicated"), with Undo. False when nothing could be added, which is said instead.
 */
function put(clip: Clip, offset: Vec2, did: string): boolean {
  const st = usePlan.getState()
  const plan = st.plan
  if (!plan) return false
  // A door or window copied on its own goes into the wall that is picked, when one is.
  const picked = selectedList(st)
  const wall = clip.loose?.length && picked.length === 1 && picked[0].type === 'wall' ? picked[0].id : undefined
  const r = pasteClip(plan, clip, st.activeLevel, offset, wall)
  if (!r.added.length) {
    showToast({ text: clip.loose?.some(o => plan.walls.some(w => w.id === (wall ?? o.wall) && w.level === st.activeLevel)) ? NO_ROOM : NO_WALL })
    return false
  }
  st.commit(() => r.plan)
  st.selectMany(r.added)
  const name = selectionName(r.plan, r.added)
  undoToastFor(`${name} ${did}${r.left ? `. ${r.left === 1 ? 'One door or window' : `${r.left} doors and windows`} had no room in the wall` : ''}`)
  return true
}

/**
 * Paste the copied things on the level being shown, and say how many. On the level they came
 * from they land a little off from where they were, so they're seen; on another level, or with
 * `inPlace` (Ctrl+Shift+V), right where they were, lined up with the floor they came from. A
 * door or window copied on its own lands beside the original, or in the wall that is picked.
 */
export function pasteCopied(inPlace = false): boolean {
  if (!clipboard) return false
  const st = usePlan.getState()
  const elsewhere = copiedOn !== null && copiedOn !== st.activeLevel
  if (inPlace || elsewhere) {
    const level = st.plan?.levels.find(l => l.id === st.activeLevel)
    put(clipboard, [0, 0], elsewhere && level ? `pasted in place on ${level.name}` : 'pasted in place')
    return true
  }
  if (put(clipboard, [PASTE_OFFSET * (pastes + 1), PASTE_OFFSET * (pastes + 1)], 'pasted')) pastes += 1
  return true
}

/** Copy and paste in one go, without touching what was copied. A door or window on its own gets a copy beside it in its wall. */
export function duplicateSelected(): boolean {
  const st = usePlan.getState()
  const sels = selectedList(st)
  if (!st.plan || !sels.length) return false
  const clip = copySelection(st.plan, sels)
  if (!clip) return false
  put(clip, [PASTE_OFFSET, PASTE_OFFSET], 'duplicated')
  return true
}

/** Select everything on the level being shown. */
export function selectAllOnLevel(): boolean {
  const st = usePlan.getState()
  if (!st.plan) return false
  st.selectMany(allOnLevel(st.plan, st.activeLevel, { sketch: useSketch.getState().shown }))
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
  // The level built over the lowest one would be left as the lowest, a storey up in the air: say so, and offer to bring it down.
  const left = levelLeftAbove(plan, id)
  const rl = (z: number) => `RL ${z.toFixed(2)}`
  const others = plan.levels.length > 2
  const choice = await askReview({
    kind: 'delete-level',
    title: `Delete ${level.name} and everything on it?`,
    facts: [{ label: 'On this level', value: contents.length ? contents.join(', ') : 'Nothing drawn yet' }],
    changes: [`${level.name} is removed, with everything drawn on it.`, ...(left ? [`${left.level.name} becomes the lowest level: the one the ground is shaped for.`] : [])],
    kept: ['Your other levels', 'The block and survey', 'Undo, straight after'],
    ...(left
      ? {
          warning: `${left.level.name} is built over ${level.name}. Without it, ${left.level.name} is the lowest level, ${left.drop.toFixed(2)} m above where ${level.name}’s floor is now.`,
          choicesLegend: `What happens to ${left.level.name}`,
          choices: [
            {
              id: 'lower',
              label: `Bring it down to ${rl(floorRL(plan, id))}`,
              detail: `It sits where ${level.name}’s floor was${others ? ', and the levels above come down with it' : ''}.${left.level.name === 'First floor' ? ' It’s renamed Ground floor.' : ''}`,
            },
            {
              id: 'keep',
              label: `Leave it at ${rl(floorRL(plan, left.level.id))}`,
              detail: `Its floor stays ${left.drop.toFixed(2)} m up and is treated as built on the ground there, so expect a lot of fill until you lower it in Design › Floors.`,
            },
          ],
        }
      : {}),
    confirm: 'Delete level',
    replaces: true,
  })
  const st = usePlan.getState()
  // The plan can have changed while the sheet was open (another project opened).
  if (!choice || st.plan !== plan) return false
  // The store goes to the nearest level left when the one showing is deleted.
  st.commit(p => deleteLevel(p, id, choice === 'lower'))
  undoToastFor(choice === 'lower' && left ? `${level.name} deleted, and ${left.level.name} brought down to ${rl(floorRL(plan, id))}` : `${level.name} deleted`, () => usePlan.getState().setActiveLevel(id))
  return true
}
