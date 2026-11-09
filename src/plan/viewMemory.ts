// The plan's zoom and pan, remembered for each project and each floor, so a reload, Back or a
// trip to the 3D view comes back to where you were. Like the 3D camera (src/phone/camera.ts) it
// lives on this device, in localStorage: a phone and a desktop each keep their own, and moving
// around never counts as an edit to the project. It's written when a gesture or the wheel ends,
// never on every frame.
//
// Also here: the zoom step the mouse wheel and the + and − buttons take, and the buttons' orders.

import { create } from 'zustand'
import { clampK } from '../phone/gestures'
import { projectsNow } from '../projects/session'
import { usePlan } from './store'

/** Where the plan was left: its centre (house frame, metres) and scale (pixels per metre). */
export interface SavedPlanView {
  cx: number
  cy: number
  k: number
}

/** A floor's view: where it was left, or a fit (Fit house, Fit block) that frames afresh. */
export type LevelView = SavedPlanView | { fit: 'house' | 'block' }

interface Stored {
  version: 1
  levels: Record<string, LevelView>
  /** The view saved last, on whichever floor: a floor not looked at yet opens here. */
  last?: LevelView
}

interface Store {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

const device = (): Store | null => {
  try {
    return localStorage
  } catch {
    return null
  }
}

const keyOf = (project: string) => `plan-view-v1:${project}`

/** This page's copy, which also keeps the view for the session when storage is blocked. */
const memory = new Map<string, Stored>()

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

function valid(v: unknown): LevelView | null {
  const o = v as Partial<SavedPlanView & { fit: string }> | null
  if (!o || typeof o !== 'object') return null
  if (o.fit === 'house' || o.fit === 'block') return { fit: o.fit }
  if (finite(o.cx) && finite(o.cy) && finite(o.k) && o.k > 0) return { cx: o.cx, cy: o.cy, k: clampK(o.k) }
  return null
}

function read(project: string, s: Store | null): Stored {
  const had = memory.get(project)
  if (had) return had
  const out: Stored = { version: 1, levels: {} }
  try {
    const raw = s?.getItem(keyOf(project))
    const p = raw ? (JSON.parse(raw) as Partial<Stored>) : null
    if (p && p.version === 1 && p.levels && typeof p.levels === 'object') {
      for (const [level, v] of Object.entries(p.levels)) {
        const ok = valid(v)
        if (ok) out.levels[level] = ok
      }
      const last = valid(p.last)
      if (last) out.last = last
    }
  } catch {
    // Unreadable: start afresh.
  }
  memory.set(project, out)
  return out
}

/** Whether a floor's view is where it was left (not a fit). */
export const isPlace = (v: LevelView | null | undefined): v is SavedPlanView => !!v && 'k' in v

/**
 * The view to open a floor at: its own, or (for a floor not looked at yet) the last one saved
 * in the project. `own` asks for the floor's own only. Null when there's none: it fits, as before.
 */
export function loadPlanView(project: string, level: string, own = false, s: Store | null = device()): LevelView | null {
  const st = read(project, s)
  return st.levels[level] ?? (own ? null : (st.last ?? null))
}

const round = (v: LevelView): LevelView => (isPlace(v) ? { cx: Math.round(v.cx * 1000) / 1000, cy: Math.round(v.cy * 1000) / 1000, k: Math.round(v.k * 1000) / 1000 } : v)

const same = (a: LevelView | undefined, b: LevelView) => !!a && JSON.stringify(a) === JSON.stringify(b)

/** Remember a floor's view. Returns whether anything changed (nothing is written when it's the same). */
export function savePlanView(project: string, level: string, v: LevelView, s: Store | null = device()): boolean {
  const st = read(project, s)
  const r = round(v)
  if (same(st.levels[level], r) && same(st.last, r)) return false
  const next: Stored = { version: 1, levels: { ...st.levels, [level]: r }, last: r }
  memory.set(project, next)
  try {
    s?.setItem(keyOf(project), JSON.stringify(next))
  } catch {
    // Storage full or blocked: this page still remembers it.
  }
  return true
}

/** Forget a project's views, so its plan fits afresh. */
export function forgetPlanViews(project: string, s: Store | null = device()): void {
  memory.delete(project)
  try {
    s?.removeItem(keyOf(project))
  } catch {
    // as above
  }
}

// A fit asked for (Fit house, Fit block, or a review that moved the house) is remembered as a
// fit for the floor showing, so the plan opens framed the same way next time. A project
// opening (its plan loading) isn't one: it opens where it was left.
usePlan.subscribe((s, prev) => {
  if (s.fitToken === prev.fitToken || s.plan !== prev.plan || !s.plan) return
  const id = projectsNow().currentId
  if (id) savePlanView(id, s.activeLevel, { fit: s.fitTarget })
})

// ---------------------------------------------------------------------------
// Zooming in steps

/** One notch of the mouse wheel zooms this much (12%). */
export const ZOOM_STEP = 1.12
/** A press of + or − (a button or a key) zooms two notches' worth (25%). */
export const BUTTON_ZOOM = ZOOM_STEP ** 2
/** How far a wheel moves for one notch, in pixels (Chrome and Safari report 100 to 120). */
export const NOTCH_PX = 100

/**
 * How much one wheel event zooms (above 1 is in). However far the wheel says it went, one
 * event is at most one notch, so a quick spin or a big delta never jumps the plan; small
 * deltas (a trackpad) zoom in proportion, smoothly.
 */
export function wheelZoom(deltaY: number, deltaMode = 0, pageHeight = 800): number {
  if (!finite(deltaY) || deltaY === 0) return 1
  // Lines (Firefox: 3 a notch) and pages, in pixels.
  const px = deltaMode === 1 ? (deltaY * NOTCH_PX) / 3 : deltaMode === 2 ? deltaY * pageHeight : deltaY
  const notches = Math.max(-1, Math.min(1, px / NOTCH_PX))
  return ZOOM_STEP ** -notches
}

// The + and − buttons, and ⌘K: an order the plan carries out when it shows.
interface ZoomOrders {
  n: number
  factor: number
}

export const usePlanZoom = create<ZoomOrders>(() => ({ n: 0, factor: 1 }))

/** Zoom the plan in (1) or out (−1) one press, about the middle of what's showing. */
export function zoomPlan(dir: 1 | -1) {
  usePlanZoom.setState(s => ({ n: s.n + 1, factor: dir > 0 ? BUTTON_ZOOM : 1 / BUTTON_ZOOM }))
}
