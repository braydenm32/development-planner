// Finding a project on the Projects home once there are more than a handful: a name filter and
// an order (last edited, or by name). Pure, so the tests read them without drawing.

import type { ProjectMeta } from './types'

export type ProjectSort = 'recent' | 'name'

/** The search box and the order show from this many projects: more than about a screenful of cards. */
export const FIND_FROM = 7

/**
 * The projects whose name (or survey file) has every word of `query`, in the order asked for.
 * `list` comes most recently edited first, which `recent` keeps.
 */
export function findProjects(list: ProjectMeta[], query: string, sort: ProjectSort): ProjectMeta[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const text = (m: ProjectMeta) => `${m.name} ${m.surveyFileName ?? ''}`.toLowerCase()
  const found = words.length ? list.filter(m => words.every(w => text(m).includes(w))) : [...list]
  if (sort === 'name') found.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) || b.updated - a.updated)
  return found
}

const SORT_KEY = 'projects-sort-v1'

/** The order last chosen on this device. */
export function readSort(): ProjectSort {
  try {
    return localStorage.getItem(SORT_KEY) === 'name' ? 'name' : 'recent'
  } catch {
    return 'recent'
  }
}

export function writeSort(sort: ProjectSort) {
  try {
    localStorage.setItem(SORT_KEY, sort)
  } catch {
    // a per-device convenience only
  }
}
