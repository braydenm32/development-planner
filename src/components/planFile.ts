// The plan file actions (Export, Import, New), shared by the old Plan file panel, the new
// layout's project menu and Design › More. Import and New each show a review before anything
// changes, and offer Undo after (src/safety).

import type { Plan } from '../plan/model'
import { importPlanFrom, newPlan } from '../safety/flows'
import { showToast } from '../safety/store'

/** Save the plan as house-plan.json. */
export function downloadPlan(plan: Plan) {
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'house-plan.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Start an empty plan in the same place, in this project, after a review. Undo puts the plan back. */
export function startNewPlan() {
  void newPlan()
}

/** Replace the plan with one read from a file, after a review that shows where it lands. */
export async function importPlanFile(f: File) {
  try {
    await importPlanFrom(f)
  } catch (err) {
    showToast({ text: (err as Error)?.message || 'That plan couldn’t be read.' })
  }
}
