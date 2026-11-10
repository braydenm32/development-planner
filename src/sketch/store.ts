// The sketch layer's settings, kept in this browser: how the Sketch tool draws, whether the layer
// shows, and whether the Measure tool keeps what it measures. The sketch itself is in the plan.

import { create } from 'zustand'

/** What a click with the Sketch tool puts down. */
export type SketchMode = 'line' | 'arc' | 'circle' | 'curve'

interface SketchPrefs {
  mode: SketchMode
  /** The Key's "Sketch & measurements" switch: off hides them, and nothing snaps to them. */
  shown: boolean
  /** Each finished measurement stays on the plan (on unless switched off). */
  keepMeasures: boolean
}

interface SketchStore extends SketchPrefs {
  setMode: (m: SketchMode) => void
  setShown: (on: boolean) => void
  setKeepMeasures: (on: boolean) => void
}

const KEY = 'sketch-v1'
const DEFAULTS: SketchPrefs = { mode: 'line', shown: true, keepMeasures: true }
const MODES: SketchMode[] = ['line', 'arc', 'circle', 'curve']

function load(): SketchPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as Partial<SketchPrefs>) : {}
    return {
      mode: MODES.includes(v.mode as SketchMode) ? (v.mode as SketchMode) : DEFAULTS.mode,
      shown: v.shown !== false,
      keepMeasures: v.keepMeasures !== false,
    }
  } catch {
    return DEFAULTS
  }
}

function save(p: SketchPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Not kept; it still works for this visit.
  }
}

export const useSketch = create<SketchStore>((set, get) => {
  const keep = (patch: Partial<SketchPrefs>) => {
    set(patch)
    const { mode, shown, keepMeasures } = get()
    save({ mode, shown, keepMeasures })
  }
  return {
    ...load(),
    setMode: mode => keep({ mode }),
    setShown: shown => keep({ shown }),
    setKeepMeasures: keepMeasures => keep({ keepMeasures }),
  }
})
