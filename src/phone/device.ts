// Whether this is a phone (or a tablet: anything with a finger for a pointer), and the
// phone's View / Edit switch. On a phone the app opens in View, where the plan pans and
// zooms but nothing can move; Edit brings back the tools. The choice is remembered on
// this device. Desktops are always in Edit.

import { createContext, useContext, useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { usePlan } from '../plan/store'
import { useSiteStore } from '../site/store'

export const PHONE_QUERY = '(max-width: 760px), (pointer: coarse)'

const media = () => (typeof matchMedia === 'function' ? matchMedia(PHONE_QUERY) : null)

export function usePhone(): boolean {
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
