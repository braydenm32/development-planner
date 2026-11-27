// The section the strip under the plan shows, kept as a section line of the plan. The strip's cut
// is only a way of looking (./store.ts): the PDF plans and the DA pack draw the plan's own section
// lines (Design › Sections), so this is the one click that turns the cut on screen into one.

import type { Survey } from '../lib/survey'
import { fromSite, type Plan, type SectionLine } from '../plan/model'
import { usePlan } from '../plan/store'
import { addSection } from '../sections/lines'
import { defaultCut } from './geometry'
import { useStrip, type Cut } from './store'

/** Where the strip cuts this project: where its cut was last moved to, or through the middle of the house. */
export function stripCut(plan: Plan, survey: Pick<Survey, 'boundary' | 'origin'>, project: string | null): Cut {
  const moved = project ? useStrip.getState().cuts[project] : undefined
  return moved ?? defaultCut(plan, survey.boundary.map(p => fromSite(p, plan.placement, survey.origin)))
}

/** Add a section line along the strip's cut, as one undoable step. Returns the new line, or null with no plan open. */
export function keepStripSection(survey: Pick<Survey, 'boundary' | 'origin'>, project: string | null): SectionLine | null {
  const st = usePlan.getState()
  if (!st.plan) return null
  const cut = stripCut(st.plan, survey, project)
  let line: SectionLine | null = null
  st.commit(p => {
    const added = addSection(p, cut.a, cut.b)
    line = added.line
    return added.plan
  })
  return line
}
