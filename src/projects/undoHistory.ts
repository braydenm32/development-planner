// Undo and Redo survive a reload: the undo histories of the plan, the site features and the costs
// are kept with each project, as one record of its own with the one order across them
// (src/shell/undoTarget.ts), written once edits settle so typing never thrashes storage. Each
// project keeps its own history, and a save that waited goes to the project it came from.
//
// The steps share everything that didn't change between them (each edit makes new objects only
// for what it touched), and IndexedDB keeps that sharing when it stores them, so a hundred
// steps cost little more than the changes themselves.

import type { StoreApi } from 'zustand'
import { normalizeCosts, type CostsData } from '../costs/model'
import { useCosts } from '../costs/store'
import { normalizePlan, type Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import { normalizeSiteData, useSiteStore, type SiteData } from '../site/store'
// Imported first so the order is up to date by the time a change here is saved (zustand calls
// listeners in the order they subscribed).
import { putBackOrder, quietly, undoOrderNow, type UndoKind } from '../shell/undoTarget'
import { projectsNow, registerRecordKind, saveBesidePlan } from './session'

export const HISTORY_KIND = 'history'
/** Steps kept each way. */
export const HISTORY_KEEP = 100
/** Written this long after the last step (ms). */
export const HISTORY_SETTLE_MS = 1000

export interface SavedSteps<T> {
  past: T[]
  /** What the steps lead to, to check it is still what was saved. */
  present: T | null
  future: T[]
}

export interface SavedHistory {
  version: 1
  past: Plan[]
  /** The plan the steps lead to, to check it is still the one saved (null: no house yet). */
  present: Plan | null
  future: Plan[]
  /** The site features' and the costs' steps; saves before these were kept have neither. */
  site?: SavedSteps<SiteData>
  costs?: SavedSteps<CostsData>
  /** Whose step each one was (see undoTarget.ts), oldest first. */
  order?: { done: UndoKind[]; undone: UndoKind[] }
}

interface Hist<T> {
  past: T[]
  future: T[]
}

interface Kind<T> {
  store: StoreApi<Hist<T>>
  now: () => T | null
  /** The same thing, as it opened (each is tidied as it opens; the saved one is read the same way). */
  same: (saved: T, now: T) => boolean
  saved: (v: SavedHistory) => SavedSteps<T> | undefined
}

const json = (v: unknown) => JSON.stringify(v)

/** The same drawing, whatever it is called (the project name lives on the plan too). */
function sameDrawing(a: Plan, b: Plan): boolean {
  return json({ ...a, name: '' }) === json({ ...b, name: '' })
}

const KINDS: { plan: Kind<Plan>; site: Kind<SiteData>; costs: Kind<CostsData> } = {
  plan: {
    store: usePlan as unknown as StoreApi<Hist<Plan>>,
    now: () => usePlan.getState().plan,
    same: (a, b) => sameDrawing(a, b) || sameDrawing(normalizePlan(a), b),
    saved: v => v,
  },
  site: {
    store: useSiteStore as unknown as StoreApi<Hist<SiteData>>,
    now: () => useSiteStore.getState().data,
    same: (a, b) => json(a) === json(b) || json(normalizeSiteData(a)) === json(b),
    saved: v => v.site,
  },
  costs: {
    store: useCosts as unknown as StoreApi<Hist<CostsData>>,
    now: () => useCosts.getState().data,
    same: (a, b) => json(a) === json(b) || json(normalizeCosts(a)) === json(b),
    saved: v => v.costs,
  },
}
const NAMES = Object.keys(KINDS) as UndoKind[]

let pending: { id: string; value: SavedHistory } | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let restoring = false

/**
 * Putting a saved history back. The plan is in the editor before the history is read; the site
 * features and the costs are read as records of their own and may come in after it (at start-up
 * they are read once their part of the app starts), so each is put back once it is in.
 */
let waiting: { id: string; value: SavedHistory; done: Set<UndoKind>; dropRedo: boolean } | null = null
/** Which project the site features and the costs in the stores now came from. */
const loadedFor: Partial<Record<UndoKind, string>> = {}

/** The site features or the costs of the project open now are in (src/site/persist.ts, src/costs/persist.ts). */
export function historyCanRestore(kind: 'site' | 'costs') {
  const id = projectsNow().currentId
  if (id) loadedFor[kind] = id
  else delete loadedFor[kind]
  putBack()
}

function putBackOne<T>(k: Kind<T>, w: NonNullable<typeof waiting>): boolean {
  const steps = k.saved(w.value)
  const now = k.now()
  if (!steps || !now || !Array.isArray(steps.past) || !Array.isArray(steps.future)) return false
  if (!steps.past.length && !steps.future.length) return false
  // Saved after its history (a reload before it settled): keep the steps that led to what was
  // saved, with that as one more step, and drop Redo, which no longer fits. A reload that changed
  // nothing never adds a step that undoes nothing.
  const fits = !!steps.present && k.same(steps.present, now)
  const past = (fits ? steps.past : [...steps.past, steps.present].filter((x): x is T => !!x)).slice(-HISTORY_KEEP)
  const future = fits ? steps.future.slice(0, HISTORY_KEEP) : []
  if (!fits) w.dropRedo = true
  k.store.setState({ past, future })
  return true
}

function putBack() {
  const w = waiting
  if (!w || w.id !== projectsNow().currentId) return
  const ready = NAMES.filter(n => !w.done.has(n) && (n === 'plan' || loadedFor[n] === w.id))
  if (!ready.length) return
  restoring = true
  try {
    quietly(() => {
      for (const n of ready) {
        w.done.add(n)
        putBackOne(KINDS[n] as Kind<unknown>, w)
      }
      // A step saved after the history ends Redo everywhere, as any new step does.
      if (w.dropRedo)
        for (const n of NAMES) {
          const store = KINDS[n].store as StoreApi<Hist<unknown>>
          if (store.getState().future.length) store.setState({ future: [] })
        }
    })
    putBackOrder(w.dropRedo ? { done: w.value.order?.done, undone: [] } : w.value.order)
  } finally {
    restoring = false
  }
}

/** A project's saved history, as it opens (undefined: none, or no project open). */
function restore(value: SavedHistory | undefined) {
  waiting = null
  const id = projectsNow().currentId
  if (!id || !value || value.version !== 1) return
  waiting = { id, value, done: new Set(), dropRedo: false }
  putBack()
}

const saveHistory = registerRecordKind<SavedHistory>(HISTORY_KIND, restore)

/** Write the waiting history now. */
export function flushHistory(): Promise<void> {
  clearTimeout(timer)
  const job = pending
  pending = null
  return job ? saveHistory(job.value, job.id) : Promise.resolve()
}

// The history waiting goes in the same write as the plan it belongs to, whenever that is saved:
// a reload within the second it would otherwise wait (after an Undo, say) keeps Redo.
saveBesidePlan(id => {
  if (pending?.id !== id) return null
  clearTimeout(timer)
  const value = pending.value
  pending = null
  return { [HISTORY_KIND]: value }
})

function steps<T>(k: Kind<T>): SavedSteps<T> {
  const s = k.store.getState()
  return { past: s.past.slice(-HISTORY_KEEP), present: k.now(), future: s.future.slice(0, HISTORY_KEEP) }
}

function changed(kind: UndoKind, s: Hist<unknown>, prev: Hist<unknown>) {
  if (restoring || (s.past === prev.past && s.future === prev.future)) return
  // A project opening clears each history; that's not an edit (and a plan loading starts the
  // opening, so what was in the stores is no longer known to be this project's). Anything
  // waiting belongs to the project before, so it goes now.
  if (!s.past.length && !s.future.length) {
    if (kind === 'plan') for (const n of NAMES) delete loadedFor[n]
    void flushHistory()
    return
  }
  // An edit, Undo or Redo: a saved history still to come in no longer fits behind it.
  waiting = null
  const id = projectsNow().currentId
  if (!id) return
  if (pending && pending.id !== id) void flushHistory()
  const plan = steps(KINDS.plan)
  const { done, undone } = undoOrderNow()
  pending = { id, value: { version: 1, ...plan, site: steps(KINDS.site), costs: steps(KINDS.costs), order: { done: [...done], undone: [...undone] } } }
  clearTimeout(timer)
  timer = setTimeout(() => void flushHistory(), HISTORY_SETTLE_MS)
}

for (const n of NAMES) (KINDS[n].store as StoreApi<Hist<unknown>>).subscribe((s, prev) => changed(n, s, prev))

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('pagehide', () => void flushHistory())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushHistory()
  })
}
