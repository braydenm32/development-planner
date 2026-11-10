// The sketch layer's settings, kept in this browser: how the Sketch tool draws (and in which colour), whether the layer
// shows, and whether the Measure tool keeps what it measures. The sketch itself is in the plan.

import { create } from 'zustand'
import { isSketchColour, type SketchColour } from '../plan/model'

/** What a click with the Sketch tool puts down. */
export type SketchMode = 'line' | 'arc' | 'circle' | 'curve'

interface SketchPrefs {
  mode: SketchMode
  /** The colour new sketch lines are drawn in. */
  colour: SketchColour
  /** The Key's "Sketch & measurements" switch: off hides them, and nothing snaps to them. */
  shown: boolean
  /** Each finished measurement stays on the plan (on unless switched off). */
  keepMeasures: boolean
}

interface SketchStore extends SketchPrefs {
  setMode: (m: SketchMode) => void
  setColour: (c: SketchColour) => void
  setShown: (on: boolean) => void
  setKeepMeasures: (on: boolean) => void
}

const KEY = 'sketch-v1'
const DEFAULTS: SketchPrefs = { mode: 'line', colour: 'blue', shown: true, keepMeasures: true }
const MODES: SketchMode[] = ['line', 'arc', 'circle', 'curve']

function load(): SketchPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as Partial<SketchPrefs>) : {}
    return {
      mode: MODES.includes(v.mode as SketchMode) ? (v.mode as SketchMode) : DEFAULTS.mode,
      colour: isSketchColour(v.colour) ? v.colour : DEFAULTS.colour,
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
    const { mode, colour, shown, keepMeasures } = get()
    save({ mode, colour, shown, keepMeasures })
  }
  return {
    ...load(),
    setMode: mode => keep({ mode }),
    setColour: colour => keep({ colour }),
    setShown: shown => keep({ shown }),
    setKeepMeasures: keepMeasures => keep({ keepMeasures }),
  }
})
