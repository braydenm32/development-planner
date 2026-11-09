// The live section strip under the plan: whether it's folded away, how tall it is, and where its
// cut runs in each project. All of it is this viewer's own way of looking, kept in this browser
// (like the plan's zoom and pan in src/plan/viewMemory.ts): moving the cut is never an edit to the
// project, and never goes on its Undo.

import { create } from 'zustand'
import type { Vec2 } from '../lib/geom'

/** Height of the strip when folded away: its heading alone (px). */
export const FOLDED_H = 34
/** Height of the strip on a phone, where it can't be resized (px). */
export const PHONE_H = 176
/** The strip's height on a computer before it's resized, and the least and most it takes (px). */
export const DEFAULT_H = 300
export const MIN_H = 150
export const MAX_H = 640

/** A cut across the plan, in the house frame (m), from `a` to `b`. */
export interface Cut {
  a: Vec2
  b: Vec2
}

interface StripState {
  open: boolean
  /** Its height on a computer (px), heading included. */
  height: number
  /** Each project's cut, by project id, once it's been moved; a project not listed cuts along its house. */
  cuts: Record<string, Cut>
}

const PREFS = 'section-strip-v1'
const CUTS = 'section-strip-cuts-v1'
/** Projects whose cut is kept; the oldest go first. */
const MAX_CUTS = 60

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const isVec = (v: unknown): v is Vec2 => Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1])

export const clampHeight = (h: number) => Math.round(Math.min(MAX_H, Math.max(MIN_H, h)))

/** The strip's settings as saved, or the defaults when there are none or they can't be read. */
export function readPrefs(raw: string | null): Pick<StripState, 'open' | 'height'> {
  try {
    const v = JSON.parse(raw ?? 'null') as { open?: unknown; height?: unknown } | null
    return { open: v?.open !== false, height: finite(v?.height) ? clampHeight(v.height) : DEFAULT_H }
  } catch {
    return { open: true, height: DEFAULT_H }
  }
}

/** The cuts as saved, dropping anything that isn't one. */
export function readCuts(raw: string | null): Record<string, Cut> {
  try {
    const v = JSON.parse(raw ?? '{}') as Record<string, { a?: unknown; b?: unknown }>
    const out: Record<string, Cut> = {}
    if (!v || typeof v !== 'object') return out
    for (const [k, c] of Object.entries(v)) if (c && isVec(c.a) && isVec(c.b)) out[k] = { a: c.a, b: c.b }
    return out
  } catch {
    return {}
  }
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Kept for this visit only.
  }
}

export const useStrip = create<StripState>(() => ({ ...readPrefs(load(PREFS)), cuts: readCuts(load(CUTS)) }))

const savePrefs = () => {
  const { open, height } = useStrip.getState()
  save(PREFS, { open, height })
}

export function setStripOpen(open: boolean) {
  useStrip.setState({ open })
  savePrefs()
}

export const toggleStrip = () => setStripOpen(!useStrip.getState().open)

/** Resize while dragging (`keep` false), and keep the height when the drag ends. */
export function setStripHeight(h: number, keep = true) {
  useStrip.setState({ height: clampHeight(h) })
  if (keep) savePrefs()
}

/** Move a project's cut (`keep` false while it's being dragged); null puts it back along the house. */
export function setCut(project: string, cut: Cut | null, keep = true) {
  const cuts = { ...useStrip.getState().cuts }
  delete cuts[project]
  if (cut) cuts[project] = { a: [cut.a[0], cut.a[1]], b: [cut.b[0], cut.b[1]] }
  useStrip.setState({ cuts })
  if (keep) save(CUTS, Object.fromEntries(Object.entries(cuts).slice(-MAX_CUTS)))
}

/** How much of the bottom of the plan the strip takes (px), so fitting keeps the house above it. */
export function stripSpace(shows: boolean, open: boolean, height: number, phone: boolean): number {
  if (!shows) return 0
  if (!open) return FOLDED_H
  return phone ? PHONE_H : height
}

export function useStripSpace(shows: boolean, phone: boolean): number {
  const open = useStrip(s => s.open)
  const height = useStrip(s => s.height)
  return stripSpace(shows, open, height, phone)
}
