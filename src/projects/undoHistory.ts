// Undo and Redo survive a reload: the plan's undo history is kept with each project, as a
// record of its own, written once edits settle so typing never thrashes storage. Each project
// keeps its own history, and a save that waited goes to the project it came from.
//
// The steps share everything that didn't change between them (each edit makes new objects only
// for what it touched), and IndexedDB keeps that sharing when it stores them, so a hundred
// steps cost little more than the changes themselves.

import type { Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import { projectsNow, registerRecordKind } from './session'

export const HISTORY_KIND = 'history'
/** Steps kept each way. */
export const HISTORY_KEEP = 100
/** Written this long after the last step (ms). */
export const HISTORY_SETTLE_MS = 1000

export interface SavedHistory {
  version: 1
  past: Plan[]
  /** The plan the steps lead to, to check it is still the one saved. */
  present: Plan
  future: Plan[]
}

let pending: { id: string; value: SavedHistory } | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let restoring = false

/** The same drawing, whatever it is called (the project name lives on the plan too). */
function sameDrawing(a: Plan, b: Plan): boolean {
  return JSON.stringify({ ...a, name: '' }) === JSON.stringify({ ...b, name: '' })
}

/** Put a project's saved history back behind the plan it opened with. */
function restore(value: SavedHistory | undefined) {
  const plan = usePlan.getState().plan
  if (!value || value.version !== 1 || !plan || !Array.isArray(value.past) || !Array.isArray(value.future)) return
  // The plan saved after the history did (a reload before it settled): keep the steps that
  // led to what was saved, with that as one more step, and drop Redo, which no longer fits.
  const fits = value.present && sameDrawing(value.present, plan)
  const past = (fits ? value.past : [...value.past, value.present].filter(Boolean)).slice(-HISTORY_KEEP)
  const future = fits ? value.future.slice(0, HISTORY_KEEP) : []
  restoring = true
  try {
    usePlan.setState({ past, future })
  } finally {
    restoring = false
  }
}

const saveHistory = registerRecordKind<SavedHistory>(HISTORY_KIND, restore)

/** Write the waiting history now. */
export function flushHistory(): Promise<void> {
  clearTimeout(timer)
  const job = pending
  pending = null
  return job ? saveHistory(job.value, job.id) : Promise.resolve()
}

usePlan.subscribe((s, prev) => {
  if (restoring || (s.past === prev.past && s.future === prev.future)) return
  // A plan loading (a project opening) clears the history; that's not an edit. Anything waiting
  // belongs to the project before, so it goes now.
  if (!s.past.length && !s.future.length) {
    void flushHistory()
    return
  }
  const id = projectsNow().currentId
  if (!id || !s.plan) return
  if (pending && pending.id !== id) void flushHistory()
  pending = { id, value: { version: 1, past: s.past.slice(-HISTORY_KEEP), present: s.plan, future: s.future.slice(0, HISTORY_KEEP) } }
  clearTimeout(timer)
  timer = setTimeout(() => void flushHistory(), HISTORY_SETTLE_MS)
})

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('pagehide', () => void flushHistory())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushHistory()
  })
}
