import type { LayerRole } from './survey'
import type { SketchBlock } from '../start/sketch'

/** A project's survey record: the DXF and its layer roles. Saved per project (src/projects). */
export interface SavedProject {
  fileName: string
  dxfText: string
  roles: Record<string, LayerRole>
  /** Set when there's no survey yet: the DXF is a sketch block made from these numbers (src/start/sketch.ts). */
  sketch?: SketchBlock
}

export interface ViewSettings {
  exaggeration: number
  showContours: boolean
  showLevels: boolean
  showReference: boolean
  showSolid: boolean
  showHouse: boolean
  showRoof: boolean
  showFurniture: boolean
  /** Show the finished ground after cut and fill instead of the natural ground. */
  showEarthworks: boolean
  /** The Plan / 3D / Print tab the old layout was left on. Nothing sets it now; a first visit with no address still lands there. */
  mode: 'plan' | '3d' | 'print'
  /** What sits at the top of the plan and the 3D view: square to the house, or a compass bearing (0 = north). */
  up: 'house' | number
  /** Tint the plan where the floor being drawn is above or below the natural ground. */
  planGround: boolean
  /** Draw the house's distance to each side of the block on the plan (always on in Earthworks › Place). */
  planSetbacks: boolean
  /** Panels and More headings that have been folded away. */
  collapsed: string[]
}

export const DEFAULT_VIEW: ViewSettings = {
  exaggeration: 1,
  showContours: true,
  showLevels: true,
  showReference: true,
  showSolid: true,
  showHouse: true,
  showRoof: true,
  showFurniture: true,
  showEarthworks: true,
  mode: 'plan',
  up: 'house',
  planGround: true,
  planSetbacks: false,
  collapsed: [],
}

export function loadView(): ViewSettings {
  try {
    const raw = localStorage.getItem('view-v1')
    return raw ? { ...DEFAULT_VIEW, ...JSON.parse(raw) } : DEFAULT_VIEW
  } catch {
    return DEFAULT_VIEW
  }
}

export function saveView(v: ViewSettings): void {
  try {
    localStorage.setItem('view-v1', JSON.stringify(v))
  } catch {
    // ignore
  }
}
