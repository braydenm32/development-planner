import { navigate, useRouter } from '../nav/router'
import { areaById, tabOf, type CanvasView } from '../nav/menu'
import { canvasOf } from '../nav/route'
import { usePlan, type Selection, type Tool } from '../plan/store'
import { useShell, type ShellData } from './context'
import type { Plan } from '../plan/model'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'

export type Loaded = ShellData & { plan: Plan; survey: Survey; terrain: Terrain }

/** The shell's data once the survey reads and the plan has loaded; null until then. */
export function useLoaded(): Loaded | null {
  const shell = useShell()
  const plan = usePlan(s => s.plan)
  return shell.survey && shell.terrain && plan ? { ...shell, plan, survey: shell.survey, terrain: shell.terrain } : null
}

/** Pick a plan tool, and show the plan with its tool rail if it isn't showing. */
export function pickTool(tool: Tool) {
  usePlan.getState().setTool(tool)
  showPlan()
}

/** The plan is the canvas showing now (Site › Features shows it too, with no tool rail). */
export function planShowing(): boolean {
  const r = useRouter.getState().route
  return r.kind === 'app' && canvasOf(r) === 'plan'
}

/** Make sure the plan canvas shows: switch this area to the plan, or go to Design › Plan where there is no plan here. */
export function showPlan() {
  const r = useRouter.getState().route
  if (r.kind !== 'app') return navigate({ kind: 'app', area: 'design', tab: 'plan', view: 'plan' })
  const area = areaById(r.area)!
  const tab = area.tabs.find(t => t.id === r.tab)
  if (!area.rail || tab?.canvas) navigate({ kind: 'app', area: 'design', tab: 'plan', view: 'plan', level: r.level, sel: r.sel })
  else if (r.view !== 'plan') navigate({ ...r, view: 'plan' }, { replace: true })
}

/** Select an item on its own level and show it on the plan. */
export function selectOnPlan(level: string, sel: Selection) {
  const st = usePlan.getState()
  if (st.activeLevel !== level) st.setActiveLevel(level)
  st.select(sel)
  showPlan()
}

/** Show the plan or the 3D view. A tab with a canvas of its own (3D print) gives way to its area's first tab. */
export function switchView(view: CanvasView) {
  const r = useRouter.getState().route
  if (r.kind !== 'app') return navigate({ kind: 'app', area: view === 'plan' ? 'design' : 'site', tab: view === 'plan' ? 'plan' : '3d', view })
  const area = areaById(r.area)!
  if (tabOf(area, r.tab)?.canvas) navigate({ ...r, tab: area.defaultTab, view })
  else if (r.view !== view) navigate({ ...r, view }, { replace: true })
}
