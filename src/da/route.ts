// Which approval route the DA pack is for, in the words Approvals › DA pack shows above its details.

import { activeCouncil, checkSettingsOf } from '../checks/councils'
import type { Plan } from '../plan/model'

/**
 * Which route the pack is for, said above the details: a DA with the council whose rules are on,
 * or, with none on, that its controls sheet holds the Housing Code (CDC) checks instead.
 */
export function packRoute(plan: Plan): { text: string; pick: boolean } {
  const s = checkSettingsOf(plan.checks)
  const council = activeCouncil(s)
  if (!council)
    return {
      text: 'No council is switched on. A DA is checked against your council’s rules, so for now the pack’s planning controls sheet has the Housing Code (CDC) checks instead.',
      pick: true,
    }
  if (s.pathway === 'cdc') return { text: `This pack is for a DA with ${council.lga}. Your checks are on the CDC route; the pack’s planning controls sheet uses ${council.rules}.`, pick: false }
  return { text: `This pack is for a DA with ${council.lga}: its planning controls sheet checks ${council.rules}.`, pick: false }
}
