// The 3D camera's orders from the buttons on the canvas (Street view, From above, Rear,
// North up, Reset), and which preset it is showing so the button can say so. The street side
// the presets look from is kept with the plan (src/plan/streetSide.ts).

import { create } from 'zustand'
import type { CameraCommand, Preset } from './camera'

interface CameraState {
  /** The latest order; `n` counts them, so the same one twice still moves the camera. */
  command: { to: CameraCommand; n: number; animate: boolean } | null
  /** The preset on screen, until the camera is moved by hand. */
  active: Preset | null
  /** A preset asked for before the 3D view opened: it opens there. */
  queued: CameraCommand | null
  go: (to: CameraCommand, animate?: boolean) => void
  queue: (to: CameraCommand | null) => void
  setActive: (p: Preset | null) => void
}

export const useCamera = create<CameraState>((set, get) => ({
  command: null,
  active: null,
  queued: null,
  go: (to, animate = true) => set({ command: { to, n: (get().command?.n ?? 0) + 1, animate } }),
  queue: queued => set({ queued }),
  setActive: active => set({ active }),
}))
