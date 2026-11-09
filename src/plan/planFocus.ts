// A request for the plan to frame something: a list's row (Rooms & areas) asks, the plan view
// answers by fitting those points. A request made while the plan isn't open is kept a moment, so
// the plan fits it as it opens.

import { create } from 'zustand'
import type { Vec2 } from '../lib/geom'

/** How long a request waits for the plan to open (ms). */
export const FOCUS_WAIT_MS = 3000

/** Room left round what's framed, so it's seen in its place (m). */
const MARGIN = 2

interface FocusState {
  /** Bumped by each request. */
  n: number
  /** The points to frame, in the house's frame, with the margin added. */
  pts: Vec2[]
  /** When it was asked (Date.now()). */
  at: number
}

export const usePlanFocus = create<FocusState>(() => ({ n: 0, pts: [], at: 0 }))

/** Ask the plan to frame these points (in the house's frame), with a little room round them. */
export function focusPlan(pts: Vec2[]) {
  if (!pts.length) return
  const xs = pts.map(p => p[0])
  const ys = pts.map(p => p[1])
  const box: Vec2[] = [
    [Math.min(...xs) - MARGIN, Math.min(...ys) - MARGIN],
    [Math.max(...xs) + MARGIN, Math.max(...ys) + MARGIN],
  ]
  usePlanFocus.setState(s => ({ n: s.n + 1, pts: box, at: Date.now() }))
}
