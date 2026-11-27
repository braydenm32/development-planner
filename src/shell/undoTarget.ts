// What the top bar's Undo and Redo (and ⌘Z) take back. The plan, the site features and the costs
// each keep their own history, but there is one order across them: the most recent change
// anywhere in the project is what Undo takes back, whichever screen is open, and a new change
// ends Redo everywhere. The order is kept here by watching the three histories, so a step made
// or undone from anywhere (a tree marked for removal from Approvals › Checks, say) is in it.
// A file change just made (Replace survey, opening the example: src/safety/fileUndo.ts) comes
// before them all, until anything else changes.
//
// Each step has a name ("move wall", ./undoSteps.ts) for the buttons' tips, and when the step
// taken back is on another screen a toast says what it was and where, with the way there.

import type { StoreApi } from 'zustand'
import { costsKeys, useCosts } from '../costs/store'
import { tabRoute } from '../nav/route'
import { navigate, useRouter } from '../nav/router'
import { usePlan } from '../plan/store'
import { useSiteStore } from '../site/store'
import { fileStepNow, forgetFileStep, undoFileStep } from '../safety/fileUndo'
import { showToast } from '../safety/store'
import { announce } from '../a11y/announce'
import { nameCostsStep, namePlanStep, nameSiteStep, placeLabel, stepOnScreen, type StepName } from './undoSteps'
// Undo and Redo that change another floor go to it and say so.
import '../plan/undoLevel'

export type UndoKind = 'plan' | 'site' | 'costs'

export interface UndoTarget {
  /** Whose step it is; `file` for a file change (it has no Redo). Null when there is nothing to take back. */
  kind: UndoKind | 'file' | null
  /** The step's name: "move wall", "Replace survey". Null when there is none. */
  label: string | null
  past: unknown[]
  future: unknown[]
  undo: () => void
  redo: () => void
}

interface Hist {
  past: unknown[]
  future: unknown[]
  undo: () => void
  redo: () => void
}

interface Source {
  store: StoreApi<Hist>
  /** What the history holds steps of, as it is now: the plan, the site features, the costs. */
  now: () => unknown
  name: (before: never, after: never) => StepName
}

const SOURCES: Record<UndoKind, Source> = {
  plan: { store: usePlan as unknown as StoreApi<Hist>, now: () => usePlan.getState().plan, name: namePlanStep },
  site: { store: useSiteStore as unknown as StoreApi<Hist>, now: () => useSiteStore.getState().data, name: nameSiteStep },
  costs: { store: useCosts as unknown as StoreApi<Hist>, now: () => useCosts.getState().data, name: nameCostsStep },
}
const KINDS = Object.keys(SOURCES) as UndoKind[]
const source = (k: UndoKind) => SOURCES[k]

/** Whose step each one was, oldest first: one entry for every step in the three `past`s. */
let done: UndoKind[] = []
/** The steps undone, the last one undone last: one entry for every step in the three `future`s. */
let undone: UndoKind[] = []

const countOf = (list: UndoKind[], k: UndoKind) => list.reduce((n, x) => n + (x === k ? 1 : 0), 0)

/** `list` with its newest (or oldest) `n` entries of a kind taken out. */
function without(list: UndoKind[], k: UndoKind, n: number, from: 'newest' | 'oldest'): UndoKind[] {
  const out = [...list]
  for (; n > 0; n--) {
    const i = from === 'newest' ? out.lastIndexOf(k) : out.indexOf(k)
    if (i < 0) break
    out.splice(i, 1)
  }
  return out
}

/** Make the order hold exactly as many of a kind as its history does (a saved history put back when a project opens, say). */
function settle(k: UndoKind, past: number, future: number) {
  const d = countOf(done, k) - past
  if (d > 0) done = without(done, k, d, 'newest')
  else if (d < 0) done = [...(Array(-d).fill(k) as UndoKind[]), ...done]
  const u = countOf(undone, k) - future
  if (u > 0) undone = without(undone, k, u, 'newest')
  else if (u < 0) undone = [...(Array(-u).fill(k) as UndoKind[]), ...undone]
}

for (const k of KINDS) {
  const src = source(k)
  src.store.subscribe((s, prev) => {
    if (s.past === prev.past && s.future === prev.future) return
    const dp = s.past.length - prev.past.length
    const df = s.future.length - prev.future.length
    const now = src.now()
    if (dp === -1 && df === 1 && now === prev.past[prev.past.length - 1]) {
      // Undone, however it was asked for.
      done = without(done, k, 1, 'newest')
      undone = [...undone, k]
    } else if (dp === 1 && df === -1 && now === prev.future[0]) {
      undone = without(undone, k, 1, 'newest')
      done = [...done, k]
    } else if (s.past !== prev.past && s.past.length > 0 && s.future.length === 0 && dp >= 0 && s.past[s.past.length - 1] !== prev.past[prev.past.length - 1]) {
      // A new step: it is the latest, and nothing undone before it (in any history) can be redone.
      done = [...done, k]
      if (countOf(done, k) > s.past.length) done = without(done, k, 1, 'oldest')
      undone = []
      for (const other of KINDS) if (other !== k && source(other).store.getState().future.length) source(other).store.setState({ future: [] })
      // And a file change before it is no longer the last thing done.
      forgetFileStep()
    }
    settle(k, s.past.length, s.future.length)
  })
}

const EMPTY: UndoTarget = { kind: null, label: null, past: [], future: [], undo: () => {}, redo: () => {} }

/** The step Undo (or Redo) would take, named. */
function stepNow(k: UndoKind, which: 'undo' | 'redo'): StepName | null {
  const src = source(k)
  const s = src.store.getState()
  const now = src.now()
  const other = which === 'undo' ? s.past[s.past.length - 1] : s.future[0]
  if (!now || !other) return null
  try {
    return which === 'undo' ? src.name(other as never, now as never) : src.name(now as never, other as never)
  } catch {
    return null
  }
}

/** After a step was undone or redone: when it doesn't show on the screen open now, say what it was and where. */
function say(step: StepName | null, word: 'Undone' | 'Redone') {
  const route = useRouter.getState().route
  if (!step || route.kind !== 'app' || stepOnScreen(step, route.area)) {
    // On this screen the change shows, but not to a screen reader: say what it was (a toast speaks for itself).
    announce(undoWords(step, word))
    return
  }
  showToast({
    text: `${word}: ${step.what}, in ${placeLabel(step)}.`,
    link: { label: 'Show', go: () => navigate(tabRoute(useRouter.getState().route, step.area, step.tab)) },
  })
}

/** "Undone: move wall.", for the live region. */
export const undoWords = (step: StepName | null, word: 'Undone' | 'Redone'): string => (step ? `${word}: ${step.what}.` : `${word}.`)

const sayFailed = (e: unknown) => void showToast({ text: `That couldn’t be undone: ${(e as Error)?.message || 'storage error'}.`, error: true })

/** What Undo (or Redo) works on now: the latest step anywhere in the project. */
export function undoTarget(which: 'undo' | 'redo' = 'undo'): UndoTarget {
  const file = which === 'undo' ? fileStepNow() : null
  // "Replace survey" reads "Undo: replace survey", like the other steps.
  if (file) return { kind: 'file', label: file.label.charAt(0).toLowerCase() + file.label.slice(1), past: [file], future: [], undo: () => void undoFileStep().catch(sayFailed), redo: () => {} }
  const list = which === 'undo' ? done : undone
  const k = list[list.length - 1]
  if (!k) return EMPTY
  const h = source(k).store.getState()
  const step = stepNow(k, which)
  return {
    kind: k,
    label: step?.what ?? null,
    past: h.past,
    future: h.future,
    undo: () => {
      source(k).store.getState().undo()
      say(step, 'Undone')
    },
    redo: () => {
      source(k).store.getState().redo()
      say(step, 'Redone')
    },
  }
}

// ⌘Z while Costs is open (src/costs/store.ts) follows the same order.
costsKeys.undo = () => undoTarget('undo').undo()
costsKeys.redo = () => undoTarget('redo').redo()
