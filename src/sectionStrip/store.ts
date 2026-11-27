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

/**
 * Its height on this phone: turned sideways the screen is short, and the strip keeps to a third
 * of it, so it never reaches the level chip at the top of the plan.
 */
export function phoneHeight(screenH: number = typeof window === 'undefined' ? Infinity : window.innerHeight): number {
  return Math.round(Math.min(PHONE_H, Math.max(FOLDED_H + 60, screenH * 0.34)))
}
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
  /** Whether it's open now: the viewer's own choice, or until they make one, `auto`. */
  open: boolean
  /** What the viewer chose with Fold away or Show the section, kept in this browser; null until they do. */
  choice: boolean | null
  /** Whether it opens by itself: on a computer, once there is a house to cut through (setStripAuto). */
  auto: boolean
  /** Its height on a computer (px), heading included. */
  height: number
  /** The plan has too little room left for it (stripTight): it folds for now, without that being kept as a choice. */
  tight: boolean
  /** Shown all the same while tight: the viewer asked for it. */
  tightShown: boolean
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

/**
 * The strip's settings as saved, or the defaults when there are none or they can't be read.
 * Folded away is always the viewer's choice. Open is theirs only when saved as chosen: older
 * settings saved "open" for everyone, whether they had asked for it or not.
 */
export function readPrefs(raw: string | null): Pick<StripState, 'choice' | 'height'> {
  try {
    const v = JSON.parse(raw ?? 'null') as { open?: unknown; chose?: unknown; height?: unknown } | null
    const choice = v?.open === false ? false : v?.open === true && v.chose === true ? true : null
    return { choice, height: finite(v?.height) ? clampHeight(v.height) : DEFAULT_H }
  } catch {
    return { choice: null, height: DEFAULT_H }
  }
}

/**
 * Whether the strip opens by itself, before the viewer has chosen: never on a phone, where the
 * plan needs the screen (PH-03), and on a computer only once a floor is drawn, so a new project
 * starts with the whole canvas for the block (HO-10, CB-37).
 */
export const opensItself = (phone: boolean, houseDrawn: boolean) => !phone && houseDrawn

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

export const useStrip = create<StripState>(() => {
  const prefs = readPrefs(load(PREFS))
  // Folded until the plan says there's a house (setStripAuto), unless the viewer chose.
  return { ...prefs, auto: false, tight: false, tightShown: false, open: prefs.choice ?? false, cuts: readCuts(load(CUTS)) }
})

/** Open as chosen, or as the plan has it, unless folded for room. */
const openNow = (s: Pick<StripState, 'choice' | 'auto' | 'tight' | 'tightShown'>) => (s.choice ?? s.auto) && (!s.tight || s.tightShown)

/** Plan narrower than this between the panel and the selection's card (px)… */
export const TIGHT_W = 400
/** …on a window shorter than this (px): the strip folds to leave the plan some room. */
export const TIGHT_H = 900

/**
 * Whether the plan is too cramped for the strip on a computer: a small window with a panel and the
 * selection's card both open leaves a strip of plan 200 px wide, and the strip took most of its height.
 */
export const stripTight = (planRoom: number, windowH: number) => planRoom < TIGHT_W && windowH < TIGHT_H

const savePrefs = () => {
  const { choice, height } = useStrip.getState()
  save(PREFS, choice === null ? { height } : { open: choice, chose: true, height })
}

/** Fold away, or Show the section: the viewer's choice, which is kept. */
export function setStripOpen(open: boolean) {
  // Shown while the plan is cramped, it stays shown until the room changes.
  useStrip.setState({ open, choice: open, tightShown: open && useStrip.getState().tight })
  savePrefs()
}

/** The plan has room for the strip, or not (stripTight): folded for now, back as it was when there's room. */
export function setStripTight(tight: boolean) {
  const s = useStrip.getState()
  if (s.tight === tight) return
  useStrip.setState({ tight, tightShown: false, open: openNow({ ...s, tight, tightShown: false }) })
}

/** Whether the strip opens by itself (see opensItself): it does unless the viewer has chosen. */
export function setStripAuto(auto: boolean) {
  const s = useStrip.getState()
  if (s.auto === auto) return
  useStrip.setState({ auto, open: openNow({ ...s, auto }) })
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
  return phone ? phoneHeight() : height
}

export function useStripSpace(shows: boolean, phone: boolean): number {
  const open = useStrip(s => s.open)
  const height = useStrip(s => s.height)
  return stripSpace(shows, open, height, phone)
}
