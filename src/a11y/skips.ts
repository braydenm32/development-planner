// Which skip links a place has (see ./SkipLinks.tsx), worked out from the route so they are right
// the moment Tab reaches them.

import { areaById, MORE, tabOf } from '../nav/menu'
import { canvasOf, type Route } from '../nav/route'

export interface Skip {
  id: 'panel' | 'tools' | 'canvas' | 'selection'
  label: string
  /** The first of these on the page takes the focus. */
  to: string[]
}

/** The skips a place has, in the order Tab meets them. `loaded`: its plan is open; `picked`: something is selected. */
export function skipsFor(route: Route, loaded: boolean, picked: boolean): Skip[] {
  if (route.kind === 'projects') return [{ id: 'panel', label: 'Skip to the projects', to: ['.shell-main.projects'] }]
  if (route.kind !== 'app') return []
  const area = areaById(route.area)
  if (!area) return []
  const tab = tabOf(area, route.tab)
  const canvas = canvasOf(route)
  const name = route.tab === MORE ? area.more.label : tab?.label
  const out: Skip[] = []
  // A panel that has been put away leaves its pill, which brings it back.
  if (!tab?.noPanel && name) out.push({ id: 'panel', label: `Skip to the ${name} panel`, to: ['.float-col .tab-panel', '.float-col .panel-pill'] })
  if (!loaded) return out
  if (area.rail && canvas === 'plan') out.push({ id: 'tools', label: 'Skip to the plan tools', to: ['.tool-rail button[tabindex="0"]', '.tool-rail button'] })
  if (canvas === 'plan') out.push({ id: 'canvas', label: 'Skip to the plan', to: ['.plan-editor .plan-svg'] })
  if (canvas === '3d') out.push({ id: 'canvas', label: 'Skip to the 3D view', to: ['.scene-keys'] })
  if (picked && !area.report && canvas === 'plan') out.push({ id: 'selection', label: 'Skip to the selection', to: ['.inspector'] })
  return out
}
