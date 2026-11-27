// Telling a trackpad's two-finger scroll from a mouse wheel. A wheel only ever turns one way, so
// an event with any sideways part comes from two fingers (or a tilt wheel) and means "move the
// plan", as it does in a browser, a map or any drawing program. Pinch arrives with Ctrl and zooms.

import type { Pt } from '../phone/gestures'

/** A scroll this soon after the last sideways one is the same two-finger gesture, even when it runs dead straight (ms). */
export const PAN_STREAK_MS = 300
/** The furthest one event moves the plan (px), so a flick never throws it out of sight. */
const MAX_STEP = 240

export interface WheelLike {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
}

const clamp = (n: number) => Math.max(-MAX_STEP, Math.min(MAX_STEP, n))

/**
 * How far a wheel event moves the plan on screen (the way a drag by that much would), or null
 * when it's a zoom: a mouse wheel, or a pinch. `sincePan` is how long ago the last pan was (ms).
 */
export function wheelPan(e: WheelLike, sincePan = Infinity): Pt | null {
  if (e.ctrlKey || e.deltaMode !== 0) return null
  if (!Number.isFinite(e.deltaX) || !Number.isFinite(e.deltaY)) return null
  if (e.deltaX === 0 && sincePan > PAN_STREAK_MS) return null
  if (e.deltaX === 0 && e.deltaY === 0) return null
  // Scrolling right or down shows what is to the right or below: the plan moves the other way.
  return [-clamp(e.deltaX), -clamp(e.deltaY)]
}
