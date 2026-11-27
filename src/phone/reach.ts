// Every key number within two taps on a phone. The numbers are all in the Overview, which
// the peek sheet at the bottom of the canvas opens with one tap, and so does the Key numbers
// button in the head of a tab's panel. When a sheet covers the peek, one tap closes it; and from
// anywhere, Site in the bottom bar opens Site's panel on the 3D view, whose Key numbers button is
// one tap more. The shell decides what shows with these same rules.

import { areaById, type AreaId } from '../nav/menu'
import { areaRoute, canvasOf } from '../nav/route'

/** The numbers people look for on site (the usage audit's phone task), and the row of the Overview that shows each. */
export const PHONE_NUMBERS = [
  { id: 'floor-area', label: 'Floor area', overview: 'Floor area (outside of walls)', peek: 'Floor' },
  { id: 'ffl', label: 'FFL', overview: 'Floor level (FFL)', peek: 'Floor level (FFL)' },
  { id: 'cut-fill', label: 'Cut and fill', overview: 'Fill', peek: null },
  { id: 'retaining', label: 'Tallest retaining wall', overview: 'Holds back up to', peek: null },
  { id: 'setbacks', label: 'Setbacks', overview: 'Distance to boundary', peek: null },
  { id: 'roof-height', label: 'Building height', overview: 'Building height', peek: 'Building height' },
  { id: 'site-area', label: 'Site area', overview: 'Area', peek: null },
] as const

export type Canvas = 'plan' | '3d' | 'print'

export interface Screen {
  phone: boolean
  /** The survey and plan have loaded. */
  loaded: boolean
  canvas: Canvas
  /** The selection's sheet is open. */
  inspector: boolean
  /** The tab's panel is open as a sheet. */
  panel: boolean
  /** A tool's card is open as a sheet. */
  toolCard: boolean
  /** The Overview is open. */
  overview: boolean
}

/**
 * Whether View on a phone locks a tab's panel: the ones that change the plan (Design and
 * Earthworks) and the site's features. The rest of Site only sets what the views show. Design ›
 * Sections is for looking at drawings, so it stays open; it keeps its own line tools for Edit.
 */
export const panelLocked = (phone: boolean, editing: boolean, tabKey: string) =>
  phone && !editing && tabKey !== 'design/sections' && tabKey !== 'approvals/da-pack' && (tabKey.startsWith('design/') || tabKey.startsWith('earthworks/') || tabKey.startsWith('approvals/') || tabKey === 'site/features')

/**
 * Approvals is read: its locked panels keep what opens and lists live (a check's passes, a group,
 * the CDC / DA route to compare), and lock only the answers typed into them (PH-07).
 */
export const panelReads = (tabKey: string) => tabKey.startsWith('approvals/')

/**
 * A phone's 3D view needs the whole screen, so there a tab's panel starts folded away as a pill:
 * after Back, a link or search. A tap on the tab itself opens it (PH-25, `tabTapped`).
 */
export const panelStartsHidden = (phone: boolean, canvas: Canvas) => phone && canvas === '3d'

let tapped: string | null = null
/** A tab (area/tab) was tapped in the tab bar or the bottom bar: its panel opens, even where it would start folded. */
export function tabTapped(tabKey: string) {
  tapped = tabKey
  // Read by the effect the tap's navigation runs (twice over in React's strict mode); gone after that.
  setTimeout(() => {
    if (tapped === tabKey) tapped = null
  }, 0)
}
/** Whether the tab now showing was opened by a tap on it. */
export const wasTapped = (tabKey: string) => tapped === tabKey

/** The selection's sheet shows on the plan only (a retaining wall in its own tab shows there instead). */
export const inspectorShows = (canvas: Canvas, loaded: boolean, selected: boolean, inTab: boolean) => canvas === 'plan' && loaded && selected && !inTab

/** Whether the peek sheet shows: on a phone, on every canvas, whenever no other sheet covers it. */
export function peekShows(s: Screen): boolean {
  return s.phone && s.loaded && !s.inspector && !s.panel && !s.toolCard && !s.overview
}

/** What a phone shows after a tap on an area in the bottom bar, with something selected or not: the tab's panel open, since it was tapped. */
export function arriveAt(area: AreaId, selected: boolean): Screen {
  const route = areaRoute(area)
  const canvas = canvasOf(route)
  const tab = areaById(area)!.tabs.find(t => t.id === route.tab)!
  return {
    phone: true,
    loaded: true,
    canvas,
    inspector: inspectorShows(canvas, true, selected, false),
    panel: !tab.noPanel,
    toolCard: false,
    overview: false,
  }
}

/** Taps from a screen to the Overview, where every number is. */
export function tapsToNumbers(s: Screen, selected = s.inspector): number {
  if (s.overview) return 0
  if (peekShows(s)) return 1
  // A tab's panel on its own: its header's Key numbers button opens the Overview (PH-25).
  if (s.panel && !s.inspector && !s.toolCard) return 1
  const covers = [s.inspector, s.panel, s.toolCard].filter(Boolean).length
  // Close the one sheet, then the peek; or Site in the bottom bar, then what it shows.
  const there = arriveAt('site', selected)
  const viaSite = there.overview ? 1 : peekShows(there) || (there.panel && !there.inspector && !there.toolCard) ? 2 : Infinity
  return Math.min(covers === 1 ? 2 : Infinity, viaSite)
}
