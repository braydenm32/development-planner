// The 3D camera's orders from the buttons on the canvas (Street view, From above, Rear,
// North up, Reset), which preset it is showing so the button can say so, and the street
// side the presets look from.

import { create } from 'zustand'
import { loadStreetSide, saveStreetSide, type CameraCommand, type Preset, type StreetSide } from './camera'

interface CameraState {
  /** The latest order; `n` counts them, so the same one twice still moves the camera. */
  command: { to: CameraCommand; n: number; animate: boolean } | null
  /** The preset on screen, until the camera is moved by hand. */
  active: Preset | null
  /** A preset asked for before the 3D view opened: it opens there. */
  queued: CameraCommand | null
  /** The street side picked for each project (by its key); missing means work it out. */
  streetSides: Record<string, StreetSide>
  go: (to: CameraCommand, animate?: boolean) => void
  queue: (to: CameraCommand | null) => void
  setActive: (p: Preset | null) => void
  setStreetSide: (key: string, side: StreetSide) => void
}

export const useCamera = create<CameraState>((set, get) => ({
  command: null,
  active: null,
  queued: null,
  streetSides: {},
  go: (to, animate = true) => set({ command: { to, n: (get().command?.n ?? 0) + 1, animate } }),
  queue: queued => set({ queued }),
  setActive: active => set({ active }),
  setStreetSide: (key, side) => {
    saveStreetSide(key, side)
    set({ streetSides: { ...get().streetSides, [key]: side } })
  },
}))

/** The street side for a project: picked by hand, or 'auto'. */
export function useStreetSide(key: string | null): StreetSide {
  const picked = useCamera(s => (key ? s.streetSides[key] : undefined))
  return picked ?? (key ? loadStreetSide(key) : 'auto')
}
