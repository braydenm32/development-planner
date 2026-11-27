// The plan's name and description for screen readers, beside the drawing (src/components/PlanEditor.tsx).
// The drawing is one picture to them, and one Tab stop: with it in focus the arrow keys move the
// view or what is picked, and its content is in the lists the description names.

import { memo } from 'react'
import type { Plan } from '../plan/model'
import { PLAN_HELP_ID, PLAN_NAME_ID } from './planCanvas'
import { planHelp, planSummary } from './summary'
import './a11y.css'

/** Hidden even from screen readers' reading down the page: they hear it once, as the plan's name and description. Worked out only when the plan or the level changes, not as the pointer moves over the drawing. */
export const PlanWords = memo(function PlanWords({ plan, level, changes }: { plan: Plan; level: string; changes: boolean }) {
  return (
    <>
      <p id={PLAN_NAME_ID} hidden>
        {planSummary(plan, level)}
      </p>
      <p id={PLAN_HELP_ID} hidden>
        {planHelp(changes)}
      </p>
    </>
  )
})
