import type { LayerRole } from './survey'
import type { SketchBlock } from '../start/sketch'

/** A project's survey record: the DXF and its layer roles. Saved per project (src/projects). */
export interface SavedProject {
  fileName: string
  dxfText: string
  roles: Record<string, LayerRole>
  /** Set when there's no survey yet: the DXF is a sketch block made from these numbers (src/start/sketch.ts). */
  sketch?: SketchBlock
  /**
   * Set when there's no survey yet and the ground came from the state's elevation model instead
   * (src/map/demSite.ts), so the app can say how rough it is. A real survey never has it.
   */
  dem?: DemSource
}

/** Where a survey made from the state's elevation model came from. Never where the block is. */
export interface DemSource {
  /** The service's id and name, as the app shows it. */
  service: string
  name: string
  /** What the model was made from ("LiDAR and aerial photos"). */
  from: string
  /** When the levels were read (ISO). */
  at: string
  /** How far apart the levels were sampled (m), and the model's own pixel size (m). */
  spacing: number
  resolution: number
  /** The service's stated vertical accuracy (m, about ±). */
  accuracy: number
  /** The licence attribution the app shows with the levels. */
  credit: string
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
  /** Levels hidden in 3D (by id), from its Show menu; a level hides with its roofs. */
  hiddenLevels: string[]
  /** Trees in 3D, from its Show menu. */
  showTrees: boolean
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
  hiddenLevels: [],
  showTrees: true,
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

/** A survey record's `dem` from a file or another device: whole, or left off (a survey of unknown source is a real one). */
export function normalizeDemSource(raw: unknown): DemSource | undefined {
  const r = raw as Partial<DemSource> | null
  if (!r || typeof r !== 'object') return undefined
  const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d)
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d)
  return {
    service: str(r.service, 'unknown'),
    name: str(r.name, 'State elevation model'),
    from: str(r.from, 'LiDAR and aerial photos'),
    at: str(r.at, new Date(0).toISOString()),
    spacing: num(r.spacing, 5),
    resolution: num(r.resolution, 5),
    // Unknown accuracy reads as the worst the app has used, not as precise.
    accuracy: num(r.accuracy, 1),
    credit: str(r.credit, 'Ground levels © State of New South Wales (Spatial Services)'),
  }
}
