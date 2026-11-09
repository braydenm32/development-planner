// The pages of the PDF plan set, as Share › Plans lists them to tick: each one by a key that
// stays put when a floor is renamed, what it's called, and whether the design has anything for
// it yet ("Sections (not drawn yet)"). Worked out from the plan alone, so the list is cheap to
// show; the plan set itself (./plans.ts) leaves out the pages left unticked.

import { houseWalls, sortedLevels, type Plan } from '../plan/model'
import { sectionsOf } from '../sections/lines'
import type { SheetKind } from './plans'

export interface PlanPage {
  /** 'site', 'floor:<level id>', 'roof', 'section', 'elevation' or 'shadow'. */
  key: string
  label: string
  /** The design has something for it: false shows "(not drawn yet)" and can't be ticked. */
  drawn: boolean
}

/** A sheet's page key: each floor its own, everything else by its kind. */
export const pageKey = (kind: SheetKind, level?: string) => (kind === 'floor' && level ? `floor:${level}` : kind)

export function planPages(plan: Plan): PlanPage[] {
  const walls = houseWalls(plan.walls)
  const pages: PlanPage[] = [{ key: 'site', label: 'Site plan', drawn: true }]
  for (const l of sortedLevels(plan)) {
    const drawn = [...plan.walls, ...plan.areas, ...plan.stairs].some(x => x.level === l.id)
    pages.push({ key: pageKey('floor', l.id), label: `${l.name} plan`, drawn })
  }
  pages.push({ key: 'roof', label: 'Roof plan', drawn: plan.roofs.length > 0 })
  pages.push({ key: 'section', label: 'Sections', drawn: sectionsOf(plan).length > 0 })
  pages.push({ key: 'elevation', label: 'Elevations', drawn: walls.length > 0 })
  pages.push({ key: 'shadow', label: 'Shadow diagram, 21 June', drawn: walls.length > 0 })
  return pages
}

/** "Site plan, Ground floor plan and Roof plan": the pages that will print, in words. */
export function pagesInWords(pages: PlanPage[], leaveOut: readonly string[]): string {
  const names = pages.filter(p => p.drawn && !leaveOut.includes(p.key)).map(p => p.label)
  if (names.length < 3) return names.join(' and ')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
