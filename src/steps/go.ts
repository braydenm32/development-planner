// Going to where a step's item is fixed (./model.ts says where): its tab, on its level, with the
// thing picked and framed on the plan or the tool out; a check's own fix (Approvals › Checks' "Go to
// fix"), or its row; a question opened in the plan's list to answer. The same helpers the panels'
// own links use: the router, the plan's selection, src/plan/planFocus.ts and the checks' pins.

import { revealCheck } from '../checks/pointStore'
import { askQuestion } from '../flow/questions'
import { canvasOf, tabRoute, type AppRoute } from '../nav/route'
import { navigate, useRouter } from '../nav/router'
import { focusPlan } from '../plan/planFocus'
import { usePlan } from '../plan/store'
import type { Go } from './model'

/** How long to wait for a field to show in its panel (ms). */
const FIELD_WAIT_MS = 1500

/** Put the cursor in a field once its panel shows it. */
function focusField(id: string) {
  const until = Date.now() + FIELD_WAIT_MS
  const look = () => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.focus({ preventScroll: true })
      return
    }
    if (Date.now() < until) requestAnimationFrame(look)
  }
  requestAnimationFrame(look)
}

/** Take the app to where an item is fixed. */
export function goTo(g: Go) {
  const r = useRouter.getState().route
  if (g.to === 'question') {
    // The question list sits at the foot of the plan in Design and Earthworks.
    const here = r.kind === 'app' && (r.area === 'design' || r.area === 'earthworks') && canvasOf(r) === 'plan'
    if (!here) navigate({ ...tabRoute(r, 'design', 'plan'), view: 'plan' })
    askQuestion(g.id)
    return
  }
  if (g.to === 'check') {
    if (g.fix) navigate({ ...tabRoute(r, g.fix.area, g.fix.tab), view: 'plan' })
    else {
      navigate({ ...tabRoute(r, 'approvals', 'checks'), view: 'plan' })
      // Its row opens in the list and its pin, where it has one, lights on the plan.
      revealCheck(g.id)
    }
    return
  }
  const st = usePlan.getState()
  // Something to pick is picked with Select; otherwise the tool asked for, or the one out.
  if (g.tool) st.setTool(g.tool)
  else if (g.sel && st.tool !== 'select') st.setTool('select')
  const base = tabRoute(r, g.area, g.tab)
  const route: AppRoute = { ...base, view: g.view ?? base.view, level: g.level ?? base.level, sel: g.sel?.id }
  navigate(route, g.focus ? { focus: g.focus } : {})
  if (g.frame?.length) focusPlan(g.frame)
  if (g.field) focusField(g.field)
}
