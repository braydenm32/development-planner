// Options of the open project: which are there, which is open, and what a person can do with
// them. The record is loaded with each project (registerRecordKind), like the other features'.

import { create } from 'zustand'
import { flushHistory } from '../projects/undoHistory'
import { registerRecordKind, swapPlan } from '../projects/session'
import {
  copiedFrom,
  freeOptionName,
  MAX_NAME,
  MAX_OPTIONS,
  newOptionId,
  normalizeOptions,
  OPTIONS_KIND,
  singleOption,
  switchedTo,
  type OptionItem,
  type OptionsRecord,
} from './model'

interface OptionsState {
  /** The open project's options (one, "Option 1", for a project that has never had more). */
  rec: OptionsRecord
  /** An option change is being saved; the buttons wait. */
  busy: boolean
}

export const useOptions = create<OptionsState>(() => ({ rec: singleOption(), busy: false }))

const set = useOptions.setState
const get = useOptions.getState

const saveRecord = registerRecordKind<OptionsRecord>(OPTIONS_KIND, value => set({ rec: normalizeOptions(value) ?? singleOption() }))

/** Whether the project has ever had a second option (the Options tab says so in its first words). */
export const hasSeveral = (rec: OptionsRecord) => rec.items.length > 1

async function busy<T>(fn: () => Promise<T>): Promise<T | undefined> {
  if (get().busy) return undefined
  set({ busy: true })
  try {
    return await fn()
  } finally {
    set({ busy: false })
  }
}

/** Open another option: the plan in the editor is filed under the one open now. Undo starts afresh. */
export function openOption(id: string): Promise<void | undefined> {
  return busy(async () => {
    if (id === get().rec.current) return
    await flushHistory()
    let next = get().rec
    await swapPlan(open => {
      const s = switchedTo(next, id, open)
      next = s.rec
      return { records: { [OPTIONS_KIND]: s.rec }, plan: s.plan }
    })
    set({ rec: next })
  })
}

/** Keep a copy of the design as it is now, as a new option, and open it to try something. The first stays as it was. */
export function copyOption(name?: string): Promise<string | undefined> {
  return busy(async () => {
    const rec0 = get().rec
    if (rec0.items.length >= MAX_OPTIONS) throw new Error(`A project can hold ${MAX_OPTIONS} options. Delete one to make room.`)
    const cur = rec0.items.find(i => i.id === rec0.current)
    const id = newOptionId()
    const label = freeOptionName(rec0.items, name?.trim() || `${cur?.name ?? 'Option'} copy`)
    await flushHistory()
    let next = rec0
    await swapPlan(open => {
      next = copiedFrom(get().rec, structuredClone(open), id, label)
      return { records: { [OPTIONS_KIND]: next }, plan: structuredClone(open) }
    })
    set({ rec: next })
    return id
  })
}

/** Rename an option. The open one's plan is untouched; only the list changes. */
export async function renameOption(id: string, name: string): Promise<void> {
  const rec = get().rec
  const clean = name.trim().slice(0, MAX_NAME)
  if (!clean) throw new Error('An option needs a name.')
  const items = rec.items.map(i => (i.id === id ? { ...i, name: freeOptionName(rec.items, clean, id) } : i))
  const next = { ...rec, items }
  set({ rec: next })
  await saveRecord(next)
}

/** What Undo for a deleted option needs: the option, and where it stood. */
export interface Removed {
  item: OptionItem
  index: number
  wasOpen: boolean
}

/**
 * Delete an option. Deleting the open one opens the next. Returns what Undo needs, or null when
 * it is the only one (a project always has one).
 */
export function removeOption(id: string): Promise<Removed | null | undefined> {
  return busy(async () => {
    const rec = get().rec
    const index = rec.items.findIndex(i => i.id === id)
    if (index < 0 || rec.items.length < 2) return null
    const wasOpen = id === rec.current
    if (!wasOpen) {
      // The open plan stays as it is; the option just leaves the list.
      const next = { ...rec, items: rec.items.filter(i => i.id !== id) }
      const item = rec.items[index]
      set({ rec: next })
      await saveRecord(next)
      return { item, index, wasOpen }
    }
    // The open one: its own plan is the editor's. Open its neighbour, then drop it.
    const to = rec.items[index === 0 ? 1 : index - 1].id
    await flushHistory()
    let item: OptionItem = rec.items[index]
    let next = rec
    await swapPlan(open => {
      item = { ...rec.items[index], plan: open }
      const s = switchedTo(rec, to, open)
      next = { ...s.rec, items: s.rec.items.filter(i => i.id !== id) }
      return { records: { [OPTIONS_KIND]: next }, plan: s.plan }
    })
    set({ rec: next })
    return { item, index, wasOpen }
  })
}

/** Put a deleted option back where it was (and open it again if it was the open one). */
export async function restoreOption(r: Removed): Promise<void> {
  const rec = get().rec
  if (rec.items.some(i => i.id === r.item.id) || !r.item.plan) return
  const items = [...rec.items]
  items.splice(Math.min(r.index, items.length), 0, { id: r.item.id, name: freeOptionName(items, r.item.name), plan: r.item.plan })
  const next = { ...rec, items }
  set({ rec: next })
  await saveRecord(next)
  if (r.wasOpen) await openOption(r.item.id)
}
