// The house's finishes in 3D (CB-21): what the outside walls and the roof are clad in and their
// colours, the inside wall colour, and the floor finish by kind of room. They change only the
// picture: no number, drawing, check, cost or 3D print reads them. Every field is optional and
// missing means "Plain", the look the 3D view has always had, so older plans open unchanged.

import type { Plan, Room } from '../plan/model'
import { roomIsGarage, roomTypeInfo, roomWet } from '../plan/roomTypes'

export type WallFinish = 'plain' | 'brick' | 'render' | 'weatherboard'
export type RoofFinish = 'plain' | 'metal' | 'tiles'
export type FloorFinish = 'plain' | 'timber' | 'tile' | 'carpet' | 'concrete'
/** The kinds of room a floor finish is picked for. */
export type FloorZone = 'living' | 'bedrooms' | 'wet' | 'garage'

export interface Finishes {
  /** The outside walls' cladding; missing is plain. */
  walls?: WallFinish
  /** The outside walls' colour (#rrggbb); missing is the cladding's own. */
  wallColour?: string
  roof?: RoofFinish
  roofColour?: string
  /** Inside walls and the inside face of the outside walls; missing keeps today's two pale greys. */
  insideColour?: string
  /** The floor seen from inside, by kind of room; missing is plain (no floor surface drawn). */
  floors?: Partial<Record<FloorZone, FloorFinish>>
}

export interface Swatch {
  name: string
  hex: string
}

/** The look the 3D view had before finishes: kept exactly as the plain defaults. */
export const PLAIN = { wall: '#f1ede6', insideOfOutside: '#f1ede6', inside: '#ddd5c8', roof: '#5d646d' }

export const WALL_FINISHES: { id: WallFinish; label: string; colour: string }[] = [
  { id: 'plain', label: 'Plain', colour: PLAIN.wall },
  { id: 'brick', label: 'Brick', colour: '#a0583f' },
  { id: 'render', label: 'Rendered', colour: PLAIN.wall },
  { id: 'weatherboard', label: 'Weatherboard', colour: PLAIN.wall },
]

export const ROOF_FINISHES: { id: RoofFinish; label: string; colour: string }[] = [
  { id: 'plain', label: 'Plain', colour: PLAIN.roof },
  { id: 'metal', label: 'Metal sheeting', colour: PLAIN.roof },
  { id: 'tiles', label: 'Tiles', colour: '#a65a3c' },
]

export const FLOOR_FINISHES: { id: FloorFinish; label: string; colour: string }[] = [
  { id: 'plain', label: 'Plain', colour: '#bdb6aa' },
  { id: 'timber', label: 'Timber', colour: '#b48a5e' },
  { id: 'tile', label: 'Tiles', colour: '#e2ddd3' },
  { id: 'carpet', label: 'Carpet', colour: '#a69c90' },
  { id: 'concrete', label: 'Polished concrete', colour: '#bebbb4' },
]

export const FLOOR_ZONES: { id: FloorZone; label: string; hint: string }[] = [
  { id: 'living', label: 'Living areas', hint: 'Living, kitchen, dining, hall' },
  { id: 'bedrooms', label: 'Bedrooms', hint: 'Bedrooms and study' },
  { id: 'wet', label: 'Bathrooms and laundry', hint: 'Bathroom, ensuite, toilet, laundry' },
  { id: 'garage', label: 'Garage', hint: 'Garage or carport' },
]

export const WALL_COLOURS: Swatch[] = [
  { name: 'White', hex: PLAIN.wall },
  { name: 'Cream', hex: '#e6dcc3' },
  { name: 'Sandstone', hex: '#cdb48c' },
  { name: 'Warm grey', hex: '#a89d90' },
  { name: 'Sage', hex: '#9fab8f' },
  { name: 'Pale blue', hex: '#a8bccb' },
  { name: 'Brick red', hex: '#a0583f' },
  { name: 'Brown', hex: '#6f4c3a' },
  { name: 'Charcoal', hex: '#4a4d52' },
]

export const ROOF_COLOURS: Swatch[] = [
  { name: 'Slate grey', hex: PLAIN.roof },
  { name: 'Charcoal', hex: '#3b3e42' },
  { name: 'Light grey', hex: '#b4b7b5' },
  { name: 'Off-white', hex: '#e3e1d9' },
  { name: 'Deep green', hex: '#3f5244' },
  { name: 'Blue grey', hex: '#5f7180' },
  { name: 'Sand', hex: '#bfae8e' },
  { name: 'Terracotta', hex: '#a65a3c' },
]

export const INSIDE_COLOURS: Swatch[] = [
  { name: 'Warm white', hex: PLAIN.insideOfOutside },
  { name: 'Greige', hex: PLAIN.inside },
  { name: 'Light grey', hex: '#d6d6d2' },
  { name: 'Pale sage', hex: '#d3dbc8' },
  { name: 'Pale blue', hex: '#cfdbe3' },
  { name: 'Soft yellow', hex: '#efe3bf' },
]

const HEX = /^#[0-9a-f]{6}$/

/** A colour as the finishes keep it: lower-case #rrggbb, or undefined when it isn't one. */
export function hexOf(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim().toLowerCase()
  return HEX.test(s) ? s : undefined
}

const oneOf = <T extends string>(list: { id: T }[], v: unknown): T | undefined => list.find(x => x.id === v)?.id

/** A saved plan's finishes, keeping only what this version knows; undefined when nothing is set. */
export function normalizeFinishes(raw: unknown): Finishes | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const out: Finishes = {}
  const walls = oneOf(WALL_FINISHES, r.walls)
  if (walls && walls !== 'plain') out.walls = walls
  const wallColour = hexOf(r.wallColour)
  if (wallColour) out.wallColour = wallColour
  const roof = oneOf(ROOF_FINISHES, r.roof)
  if (roof && roof !== 'plain') out.roof = roof
  const roofColour = hexOf(r.roofColour)
  if (roofColour) out.roofColour = roofColour
  const insideColour = hexOf(r.insideColour)
  if (insideColour) out.insideColour = insideColour
  if (r.floors && typeof r.floors === 'object') {
    const floors: Partial<Record<FloorZone, FloorFinish>> = {}
    for (const z of FLOOR_ZONES) {
      const f = oneOf(FLOOR_FINISHES, (r.floors as Record<string, unknown>)[z.id])
      if (f && f !== 'plain') floors[z.id] = f
    }
    if (Object.keys(floors).length) out.floors = floors
  }
  return Object.keys(out).length ? out : undefined
}

/** Every finish worked out, defaults filled in: what the 3D view paints. */
export interface ResolvedFinishes {
  walls: WallFinish
  wallColour: string
  roof: RoofFinish
  roofColour: string
  /** Inside walls. */
  inside: string
  /** The inside face of the outside walls. */
  insideOfOutside: string
  floors: Record<FloorZone, FloorFinish>
}

export function resolveFinishes(f: Finishes | undefined): ResolvedFinishes {
  const walls = f?.walls ?? 'plain'
  const roof = f?.roof ?? 'plain'
  return {
    walls,
    wallColour: f?.wallColour ?? WALL_FINISHES.find(x => x.id === walls)!.colour,
    roof,
    roofColour: f?.roofColour ?? ROOF_FINISHES.find(x => x.id === roof)!.colour,
    inside: f?.insideColour ?? PLAIN.inside,
    insideOfOutside: f?.insideColour ?? PLAIN.insideOfOutside,
    floors: {
      living: f?.floors?.living ?? 'plain',
      bedrooms: f?.floors?.bedrooms ?? 'plain',
      wet: f?.floors?.wet ?? 'plain',
      garage: f?.floors?.garage ?? 'plain',
    },
  }
}

/** The plan with its finishes changed, keeping the field off the plan when nothing is set. */
export function withFinishes(plan: Plan, patch: Partial<Finishes>): Plan {
  const next = normalizeFinishes({ ...plan.finishes, ...patch })
  if (JSON.stringify(next) === JSON.stringify(plan.finishes)) return plan
  const out = { ...plan, finishes: next }
  if (!next) delete out.finishes
  return out
}

/**
 * Picking a new cladding or roof drops a colour that was only the old one's own, so brick comes
 * up brick red and tiles terracotta; a colour picked on purpose stays.
 */
export function pickWallFinish(plan: Plan, walls: WallFinish): Plan {
  const r = resolveFinishes(plan.finishes)
  const own = WALL_FINISHES.find(x => x.id === r.walls)!.colour
  return withFinishes(plan, { walls, wallColour: r.wallColour === own ? undefined : r.wallColour })
}

export function pickRoofFinish(plan: Plan, roof: RoofFinish): Plan {
  const r = resolveFinishes(plan.finishes)
  const own = ROOF_FINISHES.find(x => x.id === r.roof)!.colour
  return withFinishes(plan, { roof, roofColour: r.roofColour === own ? undefined : r.roofColour })
}

export function pickFloorFinish(plan: Plan, zone: FloorZone, finish: FloorFinish): Plan {
  return withFinishes(plan, { floors: { ...plan.finishes?.floors, [zone]: finish } })
}

/** Which kind of room a room's floor finish follows: its type, else what its name reads as. */
export function floorZoneOf(room: Pick<Room, 'name' | 'type'>): FloorZone {
  if (roomIsGarage(room)) return 'garage'
  const wet = roomWet(room)
  if (wet && wet !== 'kitchen') return 'wet'
  const t = roomTypeInfo(room)
  if (t ? t.id === 'bedroom' || t.id === 'study' : /bed|study/i.test(room.name)) return 'bedrooms'
  return 'living'
}

/** A colour's name from its palette, or "Custom colour". */
export const colourName = (hex: string, palette: Swatch[]) => palette.find(s => s.hex === hex)?.name ?? 'Custom colour'

/** The finishes in a line: "Brick, brick red · Metal sheeting, slate grey". */
export function finishesSummary(f: Finishes | undefined): string {
  const r = resolveFinishes(f)
  const wall = WALL_FINISHES.find(x => x.id === r.walls)!.label
  const roof = ROOF_FINISHES.find(x => x.id === r.roof)!.label
  return `Walls: ${wall}, ${colourName(r.wallColour, WALL_COLOURS).toLowerCase()} · Roof: ${roof}, ${colourName(r.roofColour, ROOF_COLOURS).toLowerCase()}`
}
