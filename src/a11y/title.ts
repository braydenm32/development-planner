// The browser tab's title, from where you are: "BASIX · Approvals · My house · Contour & Gable".
// Two projects in two tabs read apart, Back's history list says where each entry goes, and a
// screen reader says the place when the page loads (WCAG 2.4.2). The same words, said as
// "BASIX, Approvals", go to the live region when the place changes (./announce.ts).

import { useEffect } from 'react'
import { areaById, MORE, tabOf } from '../nav/menu'
import { useRouter } from '../nav/router'
import { NEW_PROJECT, PROJECTS, type Route } from '../nav/route'
import { usePlan } from '../plan/store'
import { useProjects } from '../projects/session'

export const APP_NAME = 'Contour & Gable'

/** The tab and the area a route shows, as the menu names them; null for a page with no project. */
export function placeParts(route: Route): { tab: string; area: string } | null {
  if (route.kind !== 'app') return null
  const area = areaById(route.area)
  if (!area) return null
  const tab = route.tab === MORE ? area.more.label : (tabOf(area, route.tab)?.label ?? '')
  return { tab, area: area.label }
}

/** "Checks, Approvals": the place in a few words, for the live region. */
export function placeWords(route: Route): string {
  if (route.kind === 'projects') return route.show === 'archived' ? 'Archived projects' : route.show === 'new' ? 'New project' : 'All projects'
  const p = placeParts(route)
  return p ? [p.tab, p.area].filter(Boolean).join(', ') : ''
}

/** The tab's title for a route. Null for the pages about the app, which set their own (src/legal). */
export function titleFor(route: Route, project?: string | null): string | null {
  if (route.kind === 'page') return null
  if (route.kind === 'projects') return `${placeWords(route)} · ${APP_NAME}`
  const p = placeParts(route)
  return [p?.tab, p?.area, project?.trim(), APP_NAME].filter(Boolean).join(' · ')
}

/** Keeps document.title in step with the route and the open project's name. */
export function usePageTitle() {
  const route = useRouter(s => s.route)
  const planName = usePlan(s => s.plan?.name)
  const p = useProjects()
  // With no project open, or one with no block yet, the address still names a tab but the screen is
  // All projects or the start screen: the title says what shows.
  const shown: Route = route.kind !== 'app' || !p.ready ? route : !p.opened ? (p.list.length ? PROJECTS : NEW_PROJECT) : !p.opened.survey ? NEW_PROJECT : route
  const title = titleFor(shown, planName?.trim() || p.current?.name)
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
