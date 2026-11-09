// The open project's costs, with their own Undo and Redo (the top bar's work on them while the
// Costs area is open), and what the estimate points out on the plan.

import { create } from 'zustand'
import type { Target } from './estimate'
import { emptyCosts, type CostsData } from './model'
import type { GroupId } from './rates'

/** A line pointed out on the plan: hovered, focused, or opened to add a quote. */
export interface Pointed {
  line: string
  label: string
  /** Its quantity, as the line shows it: "3 windows, 4.32 m²". */
  what: string
  target: Target | null
}

interface CostsStore {
  data: CostsData
  past: CostsData[]
  future: CostsData[]
  /** The Costs area is open: Undo and Redo work on costs, and its lines point things out on the plan. */
  focus: boolean
  /** The line under the pointer (or keyboard focus). */
  hover: Pointed | null
  /** The line opened to add or change its quote; it stays pointed out on the plan. */
  opened: Pointed | null
  /** The estimate's groups that are open. */
  open: GroupId[]

  commit: (fn: (d: CostsData) => CostsData) => void
  undo: () => void
  redo: () => void
  /** A project's costs, as it opens: no undo history from another project. */
  load: (d: CostsData) => void
  toggleGroup: (g: GroupId) => void
}

const HISTORY = 100

export const useCosts = create<CostsStore>((set, get) => ({
  data: emptyCosts(),
  past: [],
  future: [],
  focus: false,
  hover: null,
  opened: null,
  open: ['site'],

  commit: fn => {
    const { data, past } = get()
    const next = fn(data)
    if (next === data || JSON.stringify(next) === JSON.stringify(data)) return
    set({ data: next, past: [...past, data].slice(-HISTORY), future: [] })
  },
  undo: () => {
    const { data, past, future } = get()
    if (!past.length) return
    set({ data: past[past.length - 1], past: past.slice(0, -1), future: [data, ...future] })
  },
  redo: () => {
    const { data, past, future } = get()
    if (!future.length) return
    set({ data: future[0], past: [...past, data], future: future.slice(1) })
  },
  load: data => set({ data, past: [], future: [], hover: null, opened: null }),
  toggleGroup: g => set(s => ({ open: s.open.includes(g) ? s.open.filter(x => x !== g) : [...s.open, g] })),
}))

/** What the plan points out now: the line under the pointer, else the one opened. */
export const pointedNow = (s: Pick<CostsStore, 'hover' | 'opened' | 'focus'>): Pointed | null => (s.focus ? (s.hover ?? s.opened) : null)

/**
 * ⌘Z and ⌘⇧Z (Ctrl+Y) while the Costs area is open undo and redo cost changes, not the plan.
 * The plan's own keys ask this first; true when it took the key.
 */
export function costsUndoKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): boolean {
  const st = useCosts.getState()
  if (!st.focus || !(e.ctrlKey || e.metaKey)) return false
  const k = e.key.toLowerCase()
  if (k === 'z') {
    if (e.shiftKey) st.redo()
    else st.undo()
    return true
  }
  if (k === 'y') {
    st.redo()
    return true
  }
  return false
}
