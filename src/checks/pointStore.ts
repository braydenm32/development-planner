// What Design › Checks points out on the plan: a numbered pin for each row to fix or confirm, and
// the row under the pointer (or tapped) drawn in full. The panel fills this while it's open and
// empties it as it closes, so the plan never shows pins for a panel that isn't there.

import { create } from 'zustand'
import type { CheckTarget } from './targets'

export interface Pin {
  id: string
  n: number
  word: 'fix' | 'confirm'
  title: string
}

interface ChecksPointing {
  pins: Pin[]
  /** Every row with a place on the plan, by its id. */
  targets: Record<string, CheckTarget>
  /** The row under the pointer or keyboard focus. */
  hover: string | null
  /** The row tapped (or its pin clicked): it stays pointed out until another is. */
  picked: string | null
  /** A pin was clicked on the plan: the panel scrolls to this row. Bumped each click. */
  reveal: { id: string; n: number } | null
}

export const useChecksPointing = create<ChecksPointing>(() => ({ pins: [], targets: {}, hover: null, picked: null, reveal: null }))

/** The row the plan points out now: the one under the pointer, else the one tapped. */
export const pointedRow = (s: Pick<ChecksPointing, 'hover' | 'picked'>) => s.hover ?? s.picked

export function setCheckPins(pins: Pin[], targets: Record<string, CheckTarget>) {
  useChecksPointing.setState(s => ({ pins, targets, picked: s.picked && targets[s.picked] ? s.picked : null, hover: s.hover && targets[s.hover] ? s.hover : null }))
}

export function clearCheckPins() {
  useChecksPointing.setState({ pins: [], targets: {}, hover: null, picked: null, reveal: null })
}

export const hoverCheck = (id: string | null) => useChecksPointing.setState({ hover: id })

export const pickCheck = (id: string | null) => useChecksPointing.setState({ picked: id })

/** A pin on the plan was clicked: point its row out and bring it into view in the panel. */
export function revealCheck(id: string) {
  useChecksPointing.setState(s => ({ picked: id, reveal: { id, n: (s.reveal?.n ?? 0) + 1 } }))
}
