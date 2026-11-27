// Snapping on the plan, as people bring it from other drawing programs: Shift keeps the line being
// drawn square, Alt (Option on a Mac) turns snapping off while it's held, and the Key has a switch
// for snapping and one for a grid to see it by. Both switches are kept in this browser.

import { create } from 'zustand'
import { isMac } from '../nav/keys'

interface SnapPrefs {
  /** The Key's Snapping switch: off, and points go exactly where they're clicked. */
  on: boolean
  /** The Key's Grid switch: 1 m squares (finer zoomed in) drawn under the plan. */
  grid: boolean
}

interface SnapStore extends SnapPrefs {
  setOn: (on: boolean) => void
  setGrid: (on: boolean) => void
}

const KEY = 'plan-snapping-v1'

function load(): SnapPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<SnapPrefs>
    return { on: v.on !== false, grid: v.grid === true }
  } catch {
    return { on: true, grid: false }
  }
}

export const useSnapping = create<SnapStore>((set, get) => {
  const keep = (patch: Partial<SnapPrefs>) => {
    set(patch)
    try {
      localStorage.setItem(KEY, JSON.stringify({ on: get().on, grid: get().grid }))
    } catch {
      // Not kept; it still holds for this visit.
    }
  }
  return { ...load(), setOn: on => keep({ on }), setGrid: grid => keep({ grid }) }
})

/** The key that turns snapping off while it's held, as it's printed on the keyboard. */
export const FREE_KEY = isMac() ? 'Option' : 'Alt'

/** Whether this pointer event draws or drags without snapping: Alt held, or the Snapping switch off. */
export const snapFree = (e: { altKey: boolean }): boolean => e.altKey || !useSnapping.getState().on

/** Whether this pointer event keeps the line being drawn square to the house: Shift held. */
export const snapSquare = (e: { shiftKey: boolean }): boolean => e.shiftKey
