// The tab an area opens on from the rail. Earthworks opens on Place, its first step (HO-40);
// once you've been to another of its tabs in this project, this visit, it opens there again,
// so going back and forth to Cut & fill doesn't mean a detour through Place each time.

import type { Area } from '../nav/menu'

const last = new Map<string, string>()

const key = (project: string | null | undefined, area: string) => `${project ?? ''}|${area}`

/** Note the tab an area is on (only areas that remember do anything with it). */
export function rememberTab(project: string | null | undefined, area: Area, tab: string) {
  if (area.remembersTab) last.set(key(project, area.id), tab)
}

/** The tab the rail opens an area on: where it was left this visit, else its first step. */
export function openingTab(project: string | null | undefined, area: Area): string {
  const tab = area.remembersTab ? last.get(key(project, area.id)) : undefined
  return tab && [...area.tabs.map(t => t.id), 'more'].includes(tab) ? tab : area.defaultTab
}

/** For tests: forget every tab. */
export const forgetTabs = () => last.clear()
