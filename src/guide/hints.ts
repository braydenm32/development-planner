// The tips on the plan: what to do on an empty floor (draw its walls), then the next step, one
// at a time: name the rooms, add doors and windows, put a roof on. Each can be hidden, and all
// of them at once; that's remembered on this device. Worked out from the plan alone, so a tip
// goes as soon as its step is done, however it was done.

import { useSyncExternalStore } from 'react'
import { planarFaces } from '../plan/geometry'
import type { Plan } from '../plan/model'
import type { Tool } from '../plan/store'

export type HintId = 'walls' | 'rooms' | 'openings' | 'roof'

export interface HintPrefs {
  /** Tips hidden one at a time. */
  hidden: HintId[]
  /** All tips hidden. */
  off: boolean
}

export const NO_PREFS: HintPrefs = { hidden: [], off: false }

/** The tip for this floor of the plan now, if there is one to show. */
export function nextHint(plan: Plan, level: string, prefs: HintPrefs): HintId | null {
  if (prefs.off) return null
  const walls = plan.walls.filter(w => w.level === level && w.kind !== 'retaining')
  const show = (id: HintId) => (prefs.hidden.includes(id) ? null : id)
  if (!walls.length) return show('walls')
  // While the first walls are going in (nothing closed yet), there's nothing more to say.
  if (!planarFaces(walls).length) return null
  const ids = new Set(walls.map(w => w.id))
  const steps: [HintId, boolean][] = [
    ['rooms', plan.rooms.some(r => r.level === level)],
    ['openings', plan.openings.some(o => ids.has(o.wall))],
    ['roof', plan.roofs.length > 0],
  ]
  for (const [id, done] of steps) if (!done && !prefs.hidden.includes(id)) return id
  return null
}

/** What each tip says, on a desktop and on a phone, the tool its button picks and its step of the guide. */
export interface Tip {
  title: string
  desk: string
  phone: string
  tool: Tool
  button: string
  /** The guide's section. */
  section: string
}

export const TIPS: Record<HintId, Tip> = {
  walls: {
    title: 'Start with the outside walls',
    desk: 'Press W, then click each corner. Click the first corner again to close the outline, or double-click or press Esc to stop.',
    phone: 'Tap Wall, then tap each corner. Tap the first corner again to close the outline.',
    tool: 'wall',
    button: 'Draw walls',
    section: 'walls',
  },
  rooms: {
    title: 'Name the rooms',
    desk: 'Press R, then click inside each space the walls close round. Rooms give you the floor areas.',
    phone: 'Tap Room, then tap inside each space the walls close round.',
    tool: 'room',
    button: 'Name rooms',
    section: 'rooms',
  },
  openings: {
    title: 'Add doors and windows',
    desk: 'Press D for a door or N for a window, then click on a wall.',
    phone: 'Tap Door or Window, then tap on a wall.',
    tool: 'door',
    button: 'Add a door',
    section: 'openings',
  },
  roof: {
    title: 'Put a roof on',
    desk: 'Press F, then click inside the walls. Select the roof to change its shape and pitch.',
    phone: 'Tap Roof, then tap inside the walls.',
    tool: 'roof',
    button: 'Add a roof',
    section: 'roof',
  },
}

// ---------------------------------------------------------------------------
// Remembered on this device.

const KEY = 'plan-hints-v1'

function read(): HintPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<HintPrefs> | null
    if (!v) return NO_PREFS
    const known: HintId[] = ['walls', 'rooms', 'openings', 'roof']
    return { hidden: Array.isArray(v.hidden) ? known.filter(h => v.hidden!.includes(h)) : [], off: v.off === true }
  } catch {
    return NO_PREFS
  }
}

let prefs: HintPrefs | null = null
const listeners = new Set<() => void>()

function write(next: HintPrefs) {
  prefs = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Kept for this visit only.
  }
  listeners.forEach(l => l())
}

export const hintPrefs = (): HintPrefs => (prefs ??= read())

export function useHintPrefs(): HintPrefs {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    hintPrefs,
    () => NO_PREFS,
  )
}

export const hideHint = (id: HintId) => write({ ...hintPrefs(), hidden: [...new Set([...hintPrefs().hidden, id])] })
export const hideAllHints = () => write({ ...hintPrefs(), off: true })
export const showHintsAgain = () => write(NO_PREFS)
