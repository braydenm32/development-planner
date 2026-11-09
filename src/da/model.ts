// The DA pack's own settings, kept with the plan: the revision letter on its title blocks. Older
// plans have none; revision A applies. Nothing private goes here, since the plan is what share
// links carry: the address and Lot/DP come from the map placement (src/map) when the pack is made.

import { usePlan } from '../plan/store'
import type { Plan } from '../plan/model'

export interface DaSettings {
  /** The revision on every sheet's title block: A for the first issue, then B, C… as the owner changes it. */
  revision: string
}

export const DEFAULT_DA: DaSettings = { revision: 'A' }

/** The plan's DA pack settings, defaults filled in. */
export function daOf(plan: Pick<Plan, 'da'>): DaSettings {
  const r = cleanRevision(plan.da?.revision ?? '')
  return { ...DEFAULT_DA, ...(r ? { revision: r } : {}) }
}

/** A revision as typed, made fit for a title block: up to four letters or digits, capitals. Null if nothing is left. */
export function cleanRevision(text: string): string | null {
  const r = text
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 4)
    .toUpperCase()
  return r || null
}

/** Change the revision as one undoable step; anything that cleans to nothing is ignored. */
export function setDaRevision(text: string) {
  const revision = cleanRevision(text)
  if (!revision) return
  usePlan.getState().commit(p => ({ ...p, da: { ...daOf(p), revision } }))
}
