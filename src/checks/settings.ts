import { usePlan } from '../plan/store'
import { locationForCouncil } from '../sun/location'
import type { PlanningFacts } from '../map/planning'
import { activeCouncil, checkSettingsOf, councilFor, switchCouncil, type Council } from './councils'
import type { CheckSettings, CouncilId, Pathway } from './types'

export const PATHWAYS: { id: Pathway; label: string }[] = [
  { id: 'cdc', label: 'CDC' },
  { id: 'da', label: 'DA' },
]

/** What a pathway is checked against, in words: the Housing Code, or the council's LEP and DCP. */
export function pathwayLong(pathway: Pathway, council: Council | null): string {
  if (pathway === 'cdc') return 'Housing Code (complying development), NSW-wide'
  return council ? `${council.rules} (development application)` : 'Council rules (development application): pick your council'
}

/** What the checks were run against, for a tooltip: "Checked against the Housing Code". */
export function checkedAgainst(pathway: Pathway, council: Council | null): string {
  return `Checked against the ${pathway === 'cdc' ? 'Housing Code' : council ? council.rules : 'council rules'}`
}

/** Change the checks' settings as one undoable step. */
export function setCheckSettings(patch: Partial<CheckSettings>) {
  usePlan.getState().commit(p => ({ ...p, checks: { ...checkSettingsOf(p.checks), ...patch } }))
}

/**
 * Switch a council's rules on (switching any other off) or off, as one undoable step. Switching
 * one on also puts the sun at its town (Site › Sun), unless another place was picked there, so the
 * DA checks and the shadows are for the same place.
 */
export function setCouncil(id: CouncilId, on: boolean) {
  usePlan.getState().commit(p => {
    const s = checkSettingsOf(p.checks)
    const next = { ...p, checks: { ...s, ...switchCouncil(s, id, on) } }
    if (!on) return next
    const location = locationForCouncil(p, id)
    return location ? { ...next, location } : next
  })
}

/**
 * The approval route as one step: CDC, or a DA against a council's rules. Picking a council puts
 * the route on DA; going back to CDC keeps the council (its driveway crossing numbers still
 * apply), so DA comes back to the same council. `null` switches the council off, back to CDC.
 */
export function setRoute(pathway: Pathway, council?: CouncilId | null) {
  usePlan.getState().commit(p => {
    const s = checkSettingsOf(p.checks)
    const on = activeCouncil(s)
    if (council === null) return on ? { ...p, checks: { ...s, ...switchCouncil(s, on.id, false), pathway: 'cdc' } } : p
    if (!council || on?.id === council) return { ...p, checks: { ...s, pathway } }
    const next = { ...p, checks: { ...s, ...switchCouncil(s, council, true), pathway } }
    const location = locationForCouncil(p, council)
    return location ? { ...next, location } : next
  })
}

/** The council the planning maps name for the placed lot, when the app has its rules. */
export const mapCouncil = (f: Pick<PlanningFacts, 'lga' | 'lep'> | null | undefined): Council | null => (f ? (councilFor(f.lga) ?? councilFor(f.lep)) : null)

/**
 * Once the lot is placed on the map and its council is one the app knows, switch that council's
 * rules on, unless a council was already picked (or switched off) by hand. The route stays as it
 * was: this only fills in "DA with …", ready for when DA is picked.
 */
export function councilFromMap(f: Pick<PlanningFacts, 'lga' | 'lep'> | null | undefined) {
  const k = mapCouncil(f)
  const plan = usePlan.getState().plan
  if (!k || !plan) return
  const s = checkSettingsOf(plan.checks)
  if (activeCouncil(s) || Object.keys(s.councils ?? {}).length) return
  setCouncil(k.id, true)
}
