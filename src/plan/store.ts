import { create } from 'zustand'
import type { Vec2 } from '../lib/geom'
import {
  clampOpenings,
  DOOR_DEFAULT,
  GARAGE_DOOR_DEFAULT,
  normalizePlan,
  OPENING_DEFAULT,
  WINDOW_DEFAULT,
  type AreaKind,
  type OpeningKind,
  type Plan,
  type RoofType,
  type StairShape,
  type WallKind,
} from './model'

export type Tool = 'select' | 'wall' | 'retaining' | 'door' | 'window' | 'opening' | 'garage' | 'room' | 'area' | 'roof' | 'stair' | 'furniture' | 'move'

/** Tools that put an opening in a wall, each of its own kind. */
export const OPENING_TOOLS = ['door', 'window', 'opening', 'garage'] as const
export const isOpeningTool = (t: Tool): t is OpeningKind => (OPENING_TOOLS as readonly string[]).includes(t)

export type Selection =
  | { type: 'wall'; id: string }
  | { type: 'opening'; id: string }
  | { type: 'room'; id: string }
  | { type: 'area'; id: string }
  | { type: 'roof'; id: string }
  | { type: 'stair'; id: string }
  | { type: 'furniture'; id: string }

export interface OpeningDefaults {
  width: number
  height: number
  sill: number
}

export interface RoofDefaults {
  type: RoofType
  pitch: number
  overhang: number
}

/** What a click with the Roof tool does: roof the building it lands in, or put down a corner of an outline. */
export type RoofMode = 'building' | 'outline'

export interface StairDefaults {
  shape: StairShape
  width: number
  turn: 'left' | 'right'
}

export interface FurnitureDefaults {
  /** Catalog key of the item the Furniture tool places. */
  kind: string
  /** Turn of the next item, unless a wall turns it. */
  rotation: number
}

interface PlanStore {
  plan: Plan | null
  past: Plan[]
  future: Plan[]
  gestureStart: Plan | null
  activeLevel: string
  tool: Tool
  selection: Selection | null
  wallStyle: { kind: WallKind; thickness: number }
  openingDefaults: Record<OpeningKind, OpeningDefaults>
  roofDefaults: RoofDefaults
  roofMode: RoofMode
  stairDefaults: StairDefaults
  areaDefault: AreaKind
  furnitureDefaults: FurnitureDefaults
  notice: string | null
  /** Bumped to ask the plan view to fit the drawing. */
  fitToken: number
  /** What the next fit frames: the house, or the whole block. */
  fitTarget: 'house' | 'block'

  load: (plan: Plan | null) => void
  /** Apply a change as one undoable step. */
  commit: (fn: (p: Plan) => Plan) => void
  /** Start a drag: changes until endGesture() become one undoable step. */
  beginGesture: () => void
  preview: (fn: (p: Plan) => Plan) => void
  endGesture: () => void
  undo: () => void
  redo: () => void
  setTool: (t: Tool) => void
  select: (s: Selection | null) => void
  setActiveLevel: (id: string) => void
  setWallStyle: (s: { kind: WallKind; thickness: number }) => void
  setOpeningDefaults: (kind: OpeningKind, d: OpeningDefaults) => void
  setRoofDefaults: (d: RoofDefaults) => void
  setRoofMode: (m: RoofMode) => void
  setStairDefaults: (d: StairDefaults) => void
  setAreaDefault: (k: AreaKind) => void
  setFurnitureDefaults: (d: FurnitureDefaults) => void
  notify: (msg: string | null) => void
  requestFit: (target?: 'house' | 'block') => void
}

const HISTORY = 200

function tidy(p: Plan): Plan {
  return clampOpenings(p)
}

export const usePlan = create<PlanStore>((setState, getState) => ({
  plan: null,
  past: [],
  future: [],
  gestureStart: null,
  activeLevel: 'level_ground',
  tool: 'select',
  selection: null,
  wallStyle: { kind: 'external', thickness: 0.27 },
  openingDefaults: { door: DOOR_DEFAULT, window: WINDOW_DEFAULT, opening: OPENING_DEFAULT, garage: GARAGE_DOOR_DEFAULT },
  roofDefaults: { type: 'hip', pitch: 22.5, overhang: 0.45 },
  roofMode: 'building',
  stairDefaults: { shape: 'straight', width: 0.9, turn: 'left' },
  areaDefault: 'slab',
  furnitureDefaults: { kind: 'bed-queen', rotation: 0 },
  notice: null,
  fitToken: 0,
  fitTarget: 'house',

  load: plan =>
    setState({
      fitToken: getState().fitToken + 1,
      fitTarget: 'house',
      plan,
      past: [],
      future: [],
      selection: null,
      activeLevel: plan?.levels[0]?.id ?? 'level_ground',
    }),

  commit: fn => {
    const { plan, past } = getState()
    if (!plan) return
    const next = tidy(fn(plan))
    if (next === plan) return
    setState({ plan: next, past: [...past, plan].slice(-HISTORY), future: [] })
  },

  beginGesture: () => setState({ gestureStart: getState().plan }),

  preview: fn => {
    const { plan } = getState()
    if (!plan) return
    setState({ plan: tidy(fn(plan)) })
  },

  endGesture: () => {
    const { plan, gestureStart, past } = getState()
    if (gestureStart && plan && gestureStart !== plan) {
      setState({ past: [...past, gestureStart].slice(-HISTORY), future: [], gestureStart: null })
    } else setState({ gestureStart: null })
  },

  undo: () => {
    const { plan, past, future } = getState()
    if (!plan || past.length === 0) return
    const prev = past[past.length - 1]
    setState({ plan: prev, past: past.slice(0, -1), future: [plan, ...future], selection: null })
  },

  redo: () => {
    const { plan, past, future } = getState()
    if (!plan || future.length === 0) return
    setState({ plan: future[0], past: [...past, plan], future: future.slice(1), selection: null })
  },

  setTool: tool => setState({ tool, notice: null }),
  select: selection => setState({ selection }),
  setActiveLevel: activeLevel => setState({ activeLevel, selection: null }),
  setWallStyle: wallStyle => setState({ wallStyle }),
  setOpeningDefaults: (kind, d) => setState({ openingDefaults: { ...getState().openingDefaults, [kind]: d } }),
  setRoofDefaults: roofDefaults => setState({ roofDefaults }),
  setRoofMode: roofMode => setState({ roofMode, notice: null }),
  setStairDefaults: stairDefaults => setState({ stairDefaults }),
  setAreaDefault: areaDefault => setState({ areaDefault }),
  setFurnitureDefaults: furnitureDefaults => setState({ furnitureDefaults }),
  notify: notice => setState({ notice }),
  requestFit: (fitTarget = 'house') => setState({ fitToken: getState().fitToken + 1, fitTarget }),
}))

// Saving lives in src/projects: each project's plan autosaves to that project (session.ts).

/** Points of all wall ends on a level, used for snapping and joining. */
export function levelEndpoints(plan: Plan, level: string): Vec2[] {
  return plan.walls.filter(w => w.level === level).flatMap(w => [w.a, w.b])
}

export function parsePlanFile(text: string): Plan {
  const p = JSON.parse(text) as Plan
  if (!p || p.version !== 1 || !Array.isArray(p.walls) || !Array.isArray(p.levels) || !p.placement) {
    throw new Error('This file is not a Block & House Planner plan.')
  }
  return normalizePlan(p)
}
