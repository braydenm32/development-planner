import { usePlan } from '../plan/store'
import { checkSettingsOf, switchCouncil, type Council } from './councils'
import type { CheckSettings, CouncilId, Pathway } from './types'

export const PATHWAYS: { id: Pathway; label: string }[] = [
  { id: 'cdc', label: 'CDC' },
  { id: 'da', label: 'DA' },
]

/** What a pathway is checked against, in words: the Housing Code, or the council's LEP and DCP. */
export function pathwayLong(pathway: Pathway, council: Council | null): string {
  if (pathway === 'cdc') return 'Housing Code (complying development), NSW-wide'
  return council ? `${council.rules} (development application)` : 'Council rules (development application): switch on your council below'
}

/** What the checks were run against, for a tooltip: "Checked against the Housing Code". */
export function checkedAgainst(pathway: Pathway, council: Council | null): string {
  return `Checked against the ${pathway === 'cdc' ? 'Housing Code' : council ? council.rules : 'council rules'}`
}

/** Change the checks' settings as one undoable step. */
export function setCheckSettings(patch: Partial<CheckSettings>) {
  usePlan.getState().commit(p => ({ ...p, checks: { ...checkSettingsOf(p.checks), ...patch } }))
}

/** Switch a council's rules on (switching any other off) or off, as one undoable step. */
export function setCouncil(id: CouncilId, on: boolean) {
  usePlan.getState().commit(p => {
    const s = checkSettingsOf(p.checks)
    return { ...p, checks: { ...s, ...switchCouncil(s, id, on) } }
  })
}
