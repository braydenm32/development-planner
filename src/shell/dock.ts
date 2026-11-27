// Docked panels (DB-21): on a computer, the tab's panel (and the tool rail, the selection's card
// and Check everything) can sit fixed beside the canvas instead of floating over it, and the
// canvas takes the space left, so nothing covers the drawing. Floating stays the default. The
// choice, and how much wider or narrower the docked panel was dragged, are kept per device.

import { useSyncExternalStore } from 'react'
import { create } from 'zustand'

const KEY = 'panel-layout-v1'

/** The narrowest window that docks (px): narrower, the panels float as before, whatever was chosen. */
export const DOCK_MIN_W = 1024
export const DOCK_QUERY = `(min-width: ${DOCK_MIN_W}px)`

/** How far the docked panel's edge can move from its own width (px), and how far each arrow key moves it. */
export const DOCK_EXTRA = { min: -80, max: 320, step: 16 }
/** The canvas keeps at least this much width beside docked panels (px). */
export const DOCK_CANVAS_MIN = 360

interface DockState {
  docked: boolean
  /** Added to the tab's own panel width while docked (px; negative is narrower). */
  extra: number
}

const clampExtra = (n: number) => Math.round(Math.min(DOCK_EXTRA.max, Math.max(DOCK_EXTRA.min, Number.isFinite(n) ? n : 0)))

/** What was kept, or floating with no change of width. */
export function readDock(s: Pick<Storage, 'getItem'> | null = storage()): DockState {
  try {
    const raw = JSON.parse(s?.getItem(KEY) ?? 'null') as Partial<DockState> | null
    return { docked: raw?.docked === true, extra: clampExtra(Number(raw?.extra ?? 0)) }
  } catch {
    return { docked: false, extra: 0 }
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function keep(s: DockState) {
  try {
    storage()?.setItem(KEY, JSON.stringify(s))
  } catch {
    // a per-device convenience only
  }
}

export const useDock = create<DockState>(() => readDock())

export function setDocked(docked: boolean) {
  useDock.setState({ docked })
  keep(useDock.getState())
}

export const toggleDocked = () => setDocked(!useDock.getState().docked)

export function setDockExtra(extra: number) {
  useDock.setState({ extra: clampExtra(extra) })
  keep(useDock.getState())
}

/** The docked panel's width for a tab's own width, kept to what the window has room for. */
export function dockedWidth(base: number, extra: number, room = Infinity): number {
  const w = base + clampExtra(extra)
  return Math.round(Math.max(240, Math.min(w, room)))
}

function useWideWindow(): boolean {
  const media = () => (typeof matchMedia === 'function' ? matchMedia(DOCK_QUERY) : null)
  return useSyncExternalStore(
    cb => {
      const m = media()
      m?.addEventListener('change', cb)
      return () => m?.removeEventListener('change', cb)
    },
    () => media()?.matches ?? false,
    () => false,
  )
}

/** Whether docking can be chosen here: a computer's layout in a window wide enough. */
export const useDockable = (phone: boolean): boolean => useWideWindow() && !phone

/** Whether the panels dock now: chosen, where they can. */
export function useDocked(phone: boolean): boolean {
  const chosen = useDock(s => s.docked)
  return useDockable(phone) && chosen
}
