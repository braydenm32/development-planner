// Where you are in the app, as a hash route, so Back and reload land in the same place:
//   #/<area>/<tab>?view=plan|3d&level=<level id>&sel=<item id>
//   #/projects            the projects home
//   #/projects/archived   …showing the archived projects
//   #/projects/new        the start screen, for a new project
//   #/about  #/privacy  #/terms  #/accuracy   the pages about the app (no project needed)
// Hash routes, because GitHub Pages serves one page.

import { areaById, AREAS, MORE, tabIds, tabOf, type AreaId, type CanvasView } from './menu'

export interface AppRoute {
  kind: 'app'
  area: AreaId
  tab: string
  view: CanvasView
  /** The level being drawn on. */
  level?: string
  /** The selected item's id. */
  sel?: string
}

export interface ProjectsRoute {
  kind: 'projects'
  /** The archived projects, or the start screen for a new project, instead of the active projects. */
  show?: 'archived' | 'new'
}

/** About, Privacy, Terms and How accurate is this?: pages that need no project, and work from anywhere. */
export const PAGE_IDS = ['about', 'privacy', 'terms', 'accuracy'] as const
export type PageId = (typeof PAGE_IDS)[number]

export interface PageRoute {
  kind: 'page'
  page: PageId
}

export type Route = AppRoute | ProjectsRoute | PageRoute

export const PROJECTS: Route = { kind: 'projects' }
export const ARCHIVED_PROJECTS: Route = { kind: 'projects', show: 'archived' }
export const NEW_PROJECT: Route = { kind: 'projects', show: 'new' }
export const pageRoute = (page: PageId): PageRoute => ({ kind: 'page', page })

const VIEWS: CanvasView[] = ['plan', '3d']

/** The hash for a route. */
export function formatHash(r: Route): string {
  if (r.kind === 'page') return `#/${r.page}`
  if (r.kind === 'projects') return r.show ? `#/projects/${r.show}` : '#/projects'
  const q = new URLSearchParams()
  q.set('view', r.view)
  if (r.level) q.set('level', r.level)
  if (r.sel) q.set('sel', r.sel)
  return `#/${r.area}/${r.tab}?${q.toString()}`
}

/** Read a hash. Null when it isn't one of ours (no hash, or an old link). */
export function parseHash(hash: string): Route | null {
  const m = /^#\/([^?]*)(?:\?(.*))?$/.exec(hash)
  if (!m) return null
  const parts = m[1].split('/').filter(Boolean).map(decodeURIComponent)
  const page = PAGE_IDS.find(p => p === parts[0])
  if (page && parts.length === 1) return { kind: 'page', page }
  if (parts[0] === 'projects') return parts[1] === 'archived' ? ARCHIVED_PROJECTS : parts[1] === 'new' ? NEW_PROJECT : PROJECTS
  const area = areaById(parts[0] ?? '')
  if (!area) return null
  const tab = parts[1] && tabIds(area).includes(parts[1]) ? parts[1] : area.defaultTab
  const q = new URLSearchParams(m[2] ?? '')
  const v = q.get('view') as CanvasView | null
  const view = v && VIEWS.includes(v) ? v : (tabOf(area, tab)?.view ?? area.view)
  const route: AppRoute = { kind: 'app', area: area.id, tab, view }
  const level = q.get('level')
  const sel = q.get('sel')
  if (level) route.level = level
  if (sel) route.sel = sel
  return route
}

/** An area's own tab, on its own canvas. */
export function areaRoute(id: AreaId, tab?: string): AppRoute {
  const area = areaById(id)!
  const t = tab ?? area.defaultTab
  return { kind: 'app', area: area.id, tab: t, view: tabOf(area, t)?.view ?? area.view }
}

/**
 * Where a first visit lands. Before routes, the old layout kept its mode in view-v1:
 * the floor plan opens Design › Plan, the 3D site opens Site › 3D, and Print and share
 * opens Share › Plans (PDF). With nothing saved, Design › Plan.
 */
export function defaultRoute(legacyMode?: string | null): AppRoute {
  if (legacyMode === '3d') return areaRoute('site', '3d')
  if (legacyMode === 'print') return areaRoute('share', 'plans')
  return areaRoute('design', 'plan')
}

/**
 * Where a project opens: the place it was last left (a hash this file wrote, kept with the
 * project), or Design › Plan for a new one, or when that place is no longer in the menu.
 */
export function resumeRoute(place?: string | null): AppRoute {
  const r = place ? parseHash(place) : null
  return r?.kind === 'app' ? r : areaRoute('design', 'plan')
}

/** Going to a tab: the same canvas within an area, the tab's own canvas from another area; the level and selection stay. */
export function tabRoute(from: Route, area: AreaId, tab: string): AppRoute {
  const target = areaRoute(area, tab)
  if (from.kind !== 'app') return target
  const t = tabOf(areaById(area)!, tab)
  const view = from.area === area && !t?.view ? from.view : target.view
  return { ...target, view, level: from.level, sel: from.sel }
}

/** The canvas a route shows: the plan, the 3D view, or the print preview. */
export function canvasOf(r: AppRoute): CanvasView | 'print' {
  const area = areaById(r.area)
  const tab = area && tabOf(area, r.tab)
  return tab?.canvas ?? r.view
}

/** Every route the menu can make, for tests: each area's tabs and More, in both views. */
export function everyRoute(): Route[] {
  const out: Route[] = [PROJECTS, ARCHIVED_PROJECTS, NEW_PROJECT]
  for (const a of AREAS) for (const t of tabIds(a)) for (const view of VIEWS) out.push({ kind: 'app', area: a.id, tab: t, view })
  return out
}

export { MORE }
