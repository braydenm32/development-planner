// The tools' settings for what they draw next (the "New walls" type, door, window and garage door
// sizes, the roof's type, pitch and how it's drawn, the stair's shape, and so on), kept with each
// project so they survive a reload. They're choices, not content: saving them doesn't count as an
// edit, and a project that hasn't saved any keeps the ones in use, as the view settings do.

import { registerRecordKind } from '../projects/session'
import { AREA_KINDS, WALL_KINDS, type AreaKind, type OpeningKind, type RoofType, type StairShape, type WallKind } from './model'
import { usePlan, type FurnitureDefaults, type OpeningDefaults, type RoofDefaults, type RoofMode, type StairDefaults } from './store'

/** The record kind they're saved under in each project. */
export const TOOLS_KIND = 'tools'

export interface ToolDefaults {
  wallStyle: { kind: WallKind; thickness: number }
  openingDefaults: Record<OpeningKind, OpeningDefaults>
  roofDefaults: RoofDefaults
  roofMode: RoofMode
  stairDefaults: StairDefaults
  areaDefault: AreaKind
  furnitureDefaults: FurnitureDefaults
}

export interface ToolDefaultsRecord extends Partial<ToolDefaults> {
  version: 1
}

const KEYS = ['wallStyle', 'openingDefaults', 'roofDefaults', 'roofMode', 'stairDefaults', 'areaDefault', 'furnitureDefaults'] as const

/** The tools' settings as the store has them now. */
export function currentToolDefaults(): ToolDefaults {
  const s = usePlan.getState()
  return {
    wallStyle: s.wallStyle,
    openingDefaults: s.openingDefaults,
    roofDefaults: s.roofDefaults,
    roofMode: s.roofMode,
    stairDefaults: s.stairDefaults,
    areaDefault: s.areaDefault,
    furnitureDefaults: s.furnitureDefaults,
  }
}

const num = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined)
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const oneOf = <T extends string>(v: unknown, ids: readonly T[]): T | undefined => (ids.includes(v as T) ? (v as T) : undefined)

const ROOF_TYPES: RoofType[] = ['hip', 'gable', 'skillion', 'flat']
const STAIR_SHAPES: StairShape[] = ['straight', 'l', 'u']

/**
 * A saved record laid over the settings in use: each setting that reads back sensibly replaces
 * the current one, and anything missing, from a newer version or out of range is left as it is.
 */
export function applyToolDefaults(cur: ToolDefaults, saved: unknown): ToolDefaults {
  const r = obj(saved)
  if (!r || r.version !== 1) return cur
  const out: ToolDefaults = { ...cur, openingDefaults: { ...cur.openingDefaults } }

  const w = obj(r.wallStyle)
  const kind = oneOf(w?.kind, WALL_KINDS.map(k => k.id))
  const thickness = num(w?.thickness, 0.05, 2)
  if (kind && thickness !== undefined) out.wallStyle = { kind, thickness }

  const o = obj(r.openingDefaults)
  for (const k of Object.keys(cur.openingDefaults) as OpeningKind[]) {
    const d = obj(o?.[k])
    const width = num(d?.width, 0.3, 20)
    const height = num(d?.height, 0.3, 10)
    const sill = num(d?.sill, 0, 10)
    if (width !== undefined && height !== undefined && sill !== undefined) out.openingDefaults[k] = { width, height, sill }
  }

  const rf = obj(r.roofDefaults)
  const type = oneOf(rf?.type, ROOF_TYPES)
  const pitch = num(rf?.pitch, 1, 75)
  const overhang = num(rf?.overhang, 0, 5)
  if (type && pitch !== undefined && overhang !== undefined) out.roofDefaults = { type, pitch, overhang }
  out.roofMode = oneOf(r.roofMode, ['building', 'outline'] as const) ?? cur.roofMode

  const st = obj(r.stairDefaults)
  const shape = oneOf(st?.shape, STAIR_SHAPES)
  const width = num(st?.width, 0.5, 5)
  const turn = oneOf(st?.turn, ['left', 'right'] as const)
  if (shape && width !== undefined && turn) out.stairDefaults = { shape, width, turn }

  out.areaDefault = oneOf(r.areaDefault, AREA_KINDS.map(a => a.id)) ?? cur.areaDefault

  const f = obj(r.furnitureDefaults)
  const rotation = num(f?.rotation, -360, 360)
  if (typeof f?.kind === 'string' && f.kind && rotation !== undefined) out.furnitureDefaults = { kind: f.kind, rotation }
  return out
}

/** The record to save: every setting, versioned. */
export const toolDefaultsRecord = (d: ToolDefaults): ToolDefaultsRecord => ({ version: 1, ...d })

let started = false
let applying = false
let save: ((value: ToolDefaultsRecord) => Promise<void>) | null = null

/**
 * Keep the tools' settings with each project. Call once the app starts; later calls do nothing.
 * Opening a project puts its settings back; changing one saves them to the project open now.
 */
export function startToolDefaults() {
  if (started) return
  started = true
  save = registerRecordKind<ToolDefaultsRecord>(
    TOOLS_KIND,
    value => {
      if (value === undefined) return
      applying = true
      try {
        usePlan.setState(applyToolDefaults(currentToolDefaults(), value))
      } finally {
        applying = false
      }
    },
    { touch: false },
  )
  usePlan.subscribe((state, prev) => {
    if (applying || !KEYS.some(k => state[k] !== prev[k])) return
    void save?.(toolDefaultsRecord(currentToolDefaults()))
  })
}
