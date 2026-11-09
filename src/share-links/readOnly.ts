// A shared project in the plan and site stores, held as it is: the view shows no tools, and
// should anything still try to change the plan or the site features (a key, a stray tap), the
// change is put back at once. Nothing here saves anywhere: no project is open in the session,
// so the session's autosave has nowhere to write, and this browser's projects are never touched.

import { normalizePlan, type Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import { emptySiteData, emptySiteFiles, normalizeSiteData, openSite, useSiteStore } from '../site/store'
import type { SharedProject } from './load'

let release: (() => void) | null = null

/** The plan a shared project shows, under the project's name (as opening one does). */
export function sharedPlan(p: Pick<SharedProject, 'plan' | 'meta'>): Plan | null {
  const raw = p.plan as Plan | null
  return raw && raw.version === 1 && Array.isArray(raw.walls) ? { ...normalizePlan(raw), name: p.meta.name } : null
}

/** Show a shared project, read-only. Showing a newer revision keeps the floor being looked at. */
export function showReadOnly(p: SharedProject): void {
  release?.()
  const level = usePlan.getState().activeLevel
  const plan = sharedPlan(p)
  usePlan.getState().load(plan)
  if (plan?.levels.some(l => l.id === level)) usePlan.setState({ activeLevel: level })
  openSite(p.site?.data ? normalizeSiteData(p.site.data) : emptySiteData(), emptySiteFiles())
  const data = useSiteStore.getState().data
  const offPlan = usePlan.subscribe(s => {
    if (s.plan !== plan || s.past.length || s.future.length) usePlan.setState({ plan, past: [], future: [] })
  })
  const offSite = useSiteStore.subscribe(s => {
    if (s.data !== data || s.past.length || s.future.length || s.tool) useSiteStore.setState({ data, past: [], future: [], tool: null })
  })
  release = () => {
    offPlan()
    offSite()
  }
}

/** Let go (the view closed). */
export function stopReadOnly() {
  release?.()
  release = null
}
