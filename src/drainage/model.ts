// The stormwater concept's settings, kept with the plan. Older plans have none; defaults apply.

import { usePlan } from '../plan/store'
import type { Plan } from '../plan/model'

export interface Stormwater {
  /**
   * The tank the person is planning, in litres; 0 means no tank yet. The app never suggests a
   * size: the BASIX certificate and the council's stormwater rules decide it (see the SOURCES
   * in ./stormwater.ts for why there is no sourced rule to suggest one from).
   */
  tankLitres: number
  /** Which roofs drain to the tank (roof ids). Missing means all of them. */
  tankRoofs?: string[]
}

export const DEFAULT_STORMWATER: Stormwater = { tankLitres: 0 }

/** The plan's stormwater settings, defaults filled in. */
export function stormwaterOf(plan: Pick<Plan, 'stormwater'>): Stormwater {
  return { ...DEFAULT_STORMWATER, ...plan.stormwater }
}

/** Change the stormwater settings as one undoable step. */
export function setStormwater(patch: Partial<Stormwater>) {
  usePlan.getState().commit(p => ({ ...p, stormwater: { ...stormwaterOf(p), ...patch } }))
}
