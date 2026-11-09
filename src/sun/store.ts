// The sun study's settings: whether the 3D light follows the sun, the day and the time it shows,
// whether it's playing through the day, and whether the plan shows the 21 June shadows. They're
// how you're looking, not the design, so they aren't saved with the project; the plan's shadow
// switch is remembered in this browser like the plan's other switches.

import { create } from 'zustand'
import { usePlan } from '../plan/store'
import type { SiteLocation } from './location'
import type { SunDate } from './solar'

/** The days the sun study offers in one tap. */
export const QUICK_DAYS: { id: string; label: string; month: number; day: number }[] = [
  { id: 'winter', label: '21 June', month: 6, day: 21 },
  { id: 'equinox', label: 'Equinox', month: 3, day: 21 },
  { id: 'summer', label: '21 Dec', month: 12, day: 21 },
]

/** The time slider runs from 6 am to 6 pm (AEST minutes after midnight). */
export const DAY_START = 6 * 60
export const DAY_END = 18 * 60
/** A played day takes this long (ms). */
export const PLAY_MS = 9000

const PREF = 'sun-plan-shadows-v1'

function readPlanPref(): boolean {
  try {
    return localStorage.getItem(PREF) === 'on'
  } catch {
    return false
  }
}

interface SunState {
  /** The 3D light follows the sun, and casts true shadows. */
  on: boolean
  month: number
  day: number
  /** AEST minutes after midnight. */
  minutes: number
  playing: boolean
  /** The plan shows the shadows at 9 am, 12 pm and 3 pm on 21 June. */
  planShadows: boolean
  setOn: (on: boolean) => void
  setDay: (month: number, day: number) => void
  setMinutes: (m: number) => void
  setPlaying: (p: boolean) => void
  setPlanShadows: (on: boolean) => void
}

export const useSun = create<SunState>(set => ({
  on: false,
  month: 6,
  day: 21,
  minutes: 9 * 60,
  playing: false,
  planShadows: readPlanPref(),
  setOn: on => set(on ? { on } : { on, playing: false }),
  setDay: (month, day) => set({ month, day }),
  setMinutes: minutes => set({ minutes: Math.min(DAY_END, Math.max(DAY_START, minutes)) }),
  setPlaying: playing => set({ playing }),
  setPlanShadows: planShadows => {
    try {
      localStorage.setItem(PREF, planShadows ? 'on' : 'off')
    } catch {
      // Not kept; it still works for this visit.
    }
    set({ planShadows })
  },
}))

/** The study's day, this year. */
export const studyDate = (s: Pick<SunState, 'month' | 'day'>): SunDate => ({ year: new Date().getFullYear(), month: s.month, day: s.day })

/** Change where the block is, as one undoable step kept with the plan. */
export function setLocation(location: SiteLocation) {
  usePlan.getState().commit(p => ({ ...p, location }))
}
