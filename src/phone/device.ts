// Whether this gets the phone's layout, and the phone's View / Edit switch. Width and pointer
// decide together (PH-09): any narrow window does, and so does a touch screen up to a tablet held
// upright; a tablet on its side (1080 px and wider) has a computer's room, so it gets the
// computer's layout, with its panel beside the plan. On a phone the app opens in View, where the
// plan pans and zooms but nothing can move; Edit brings back the tools. The choice is remembered
// on this device. Desktops are always in Edit.

import { createContext, useContext, useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { usePlan } from '../plan/store'
import { useSiteStore } from '../site/store'

/** The widest touch screen that still gets the phone's layout (px): an iPad on its side is 1080. */
export const TOUCH_MAX_W = 1079

export const PHONE_QUERY = `(max-width: 760px), (pointer: coarse) and (max-width: ${TOUCH_MAX_W}px)`

/** The same rule in plain terms, for tests: a narrow window, or a touch screen that isn't wide. */
export const isPhoneLayout = (width: number, coarse: boolean) => width <= 760 || (coarse && width <= TOUCH_MAX_W)

/** A phone turned sideways: the screen is short, so sheets go to the side and the numbers to one line. */
export const SIDEWAYS_QUERY = '(orientation: landscape) and (max-height: 500px)'

function useMedia(query: string): boolean {
  const media = () => (typeof matchMedia === 'function' ? matchMedia(query) : null)
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

const media = () => (typeof matchMedia === 'function' ? matchMedia(PHONE_QUERY) : null)

export const usePhone = (): boolean => useMedia(PHONE_QUERY)

export const useSideways = (): boolean => useMedia(SIDEWAYS_QUERY)

export type PhoneMode = 'view' | 'edit'

const KEY = 'phone-mode-v1'

export function readMode(s: Pick<Storage, 'getItem'> | null = safeStorage()): PhoneMode {
  try {
    return s?.getItem(KEY) === 'edit' ? 'edit' : 'view'
  } catch {
    return 'view'
  }
}

function safeStorage(): Storage | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

interface ModeState {
  mode: PhoneMode
  setMode: (m: PhoneMode) => void
}

export const usePhoneMode = create<ModeState>(set => ({
  mode: readMode(),
  setMode: mode => {
    set({ mode })
    try {
      safeStorage()?.setItem(KEY, mode)
    } catch {
      // Private windows can refuse storage; the mode then lasts for this visit.
    }
    // View has no tools: back to Select, so nothing half-drawn waits for a tap.
    if (mode === 'view' && usePlan.getState().tool !== 'select') usePlan.getState().setTool('select')
    if (mode === 'view' && useSiteStore.getState().tool) useSiteStore.getState().setTool(null)
  },
}))

/** Whether the plan can change: always on a desktop, only in Edit on a phone. */
export const canEdit = (phone: boolean, mode: PhoneMode) => !phone || mode === 'edit'

/** Picking a tool (from ⌘K, say) means you want to edit, so it switches a phone to Edit. */
const wantsEdit = () => usePhoneMode.getState().mode === 'view' && !!media()?.matches
usePlan.subscribe((s, prev) => {
  if (s.tool !== prev.tool && s.tool !== 'select' && wantsEdit()) usePhoneMode.getState().setMode('edit')
})
// Site features' tools too: lining up a drawing and tracing change the site.
useSiteStore.subscribe((s, prev) => {
  if (s.tool && !prev.tool && wantsEdit()) usePhoneMode.getState().setMode('edit')
})

/**
 * What the frame tells the plan and the 3D view about touch. With nothing provided (a test
 * rendering one alone), they behave as on a desktop.
 */
export interface TouchCanvasInfo {
  /** A phone or tablet. */
  phone: boolean
  /** View mode: pan, zoom and tap to read, but nothing moves. */
  viewOnly: boolean
  /** The project, for remembering its 3D camera. */
  projectKey: string
}

export const TouchCanvas = createContext<TouchCanvasInfo | null>(null)

export const useTouchCanvas = () => useContext(TouchCanvas)
