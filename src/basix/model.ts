// What the person tells the BASIX checklist, kept with the plan. Older plans have none; defaults apply.

import { usePlan } from '../plan/store'
import type { Plan } from '../plan/model'

/** The checklist's own items: ticked when the person has an answer ready for the BASIX tool. */
export type BasixItemId = 'orientation' | 'glazing' | 'floor-area' | 'roof-tank' | 'insulation' | 'hot-water' | 'heating' | 'cooling' | 'lighting' | 'pool'

export type HotWater = 'undecided' | 'heat-pump' | 'solar-electric' | 'solar-gas' | 'gas-instant' | 'gas-storage' | 'electric-storage'
export type Heating = 'undecided' | 'none' | 'reverse-cycle' | 'ducted-reverse-cycle' | 'gas' | 'electric-other'
export type Cooling = 'undecided' | 'none' | 'fans' | 'reverse-cycle' | 'ducted-reverse-cycle' | 'evaporative'
export type Lighting = 'undecided' | 'led-all' | 'led-most' | 'mixed'

export interface BasixAnswers {
  /** Items the person has ticked as ready. */
  done?: Partial<Record<BasixItemId, boolean>>
  /** The insulation they intend, in their words ("R4 ceiling, R2.5 walls"). */
  insulation?: string
  hotWater?: HotWater
  heating?: Heating
  cooling?: Cooling
  lighting?: Lighting
  /** A pool or spa is planned. */
  pool?: boolean
  /** Its size, litres, when it is. */
  poolLitres?: number
}

export const DEFAULT_BASIX: BasixAnswers = {}

/** The plan's BASIX answers, defaults filled in. */
export function basixOf(plan: Pick<Plan, 'basix'>): BasixAnswers {
  return { ...DEFAULT_BASIX, ...plan.basix }
}

/** Change the answers as one undoable step. */
export function setBasix(patch: Partial<BasixAnswers>) {
  usePlan.getState().commit(p => ({ ...p, basix: { ...basixOf(p), ...patch } }))
}

/** Tick or untick one item. */
export function setBasixDone(id: BasixItemId, on: boolean) {
  usePlan.getState().commit(p => {
    const b = basixOf(p)
    return { ...p, basix: { ...b, done: { ...b.done, [id]: on } } }
  })
}
