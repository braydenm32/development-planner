// The plan file actions (Export, Import, New), shared by the old Plan file panel, the new
// layout's project menu and Design › More. Import and New each show a review before anything
// changes, and offer Undo after (src/safety).

import { saveFile } from '../lib/download'
import type { Plan } from '../plan/model'
import { importPlanFrom, newPlan } from '../safety/flows'
import { showToast } from '../safety/store'

/** Save the plan as house-plan.json. */
export function downloadPlan(plan: Plan) {
  saveFile('house-plan.json', JSON.stringify(plan, null, 2), 'application/json')
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
