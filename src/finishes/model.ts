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
  /** A different finish on the lower part of every outside wall (a brick base, say); missing is none. */
  lower?: WallFinish
  /** The lower part's colour; missing is that cladding's own. */
  lowerColour?: string
  /** How high the lower part goes, metres above each floor; missing is DEFAULT_SPLIT. */
  lowerTo?: number
}

/** One finish picked for a wall: a cladding and its colour (missing is the cladding's own). */
export interface FinishPick {
  walls: WallFinish
  colour?: string
}

/**
 * An outside wall's own finish, kept on the wall (`Wall.finish`); a wall without one follows the
 * house. With `lower` the wall has two finishes, changing `at` metres above its floor.
 */
export interface WallFinishes {
  /** The whole wall's finish, or the upper one's when it has two. */
  upper: FinishPick
  lower?: FinishPick
  /** Where the lower finish changes to the upper (m above the floor); missing is DEFAULT_SPLIT. */
  at?: number
}

/** Where two finishes change over unless told otherwise (m above the floor): about sill height. */
export const DEFAULT_SPLIT = 1
/** The least either finish keeps of a wall's height (m), so neither shrinks to a sliver. */
export const MIN_BAND = 0.1

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
  // Plain is a real choice for the lower part (missing means none), so it's kept.
  const lower = oneOf(WALL_FINISHES, r.lower)
  if (lower) {
    out.lower = lower
    const lowerColour = hexOf(r.lowerColour)
    if (lowerColour) out.lowerColour = lowerColour
    const lowerTo = heightOf(r.lowerTo)
    if (lowerTo !== undefined) out.lowerTo = lowerTo
  }
  return Object.keys(out).length ? out : undefined
}

/** A split height as kept: a positive number of metres, to the millimetre; undefined when it isn't one. */
function heightOf(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 100 ? Math.round(v * 1000) / 1000 : undefined
}

function pickOf(raw: unknown): FinishPick | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const walls = oneOf(WALL_FINISHES, r.walls)
  if (!walls) return undefined
  const colour = hexOf(r.colour)
  return colour ? { walls, colour } : { walls }
}

/** A saved wall's own finish, keeping only what this version knows; undefined when it has none. */
export function normalizeWallFinishes(raw: unknown): WallFinishes | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const upper = pickOf(r.upper)
  if (!upper) return undefined
  const lower = pickOf(r.lower)
  if (!lower) return { upper }
  const at = heightOf(r.at)
  return at !== undefined ? { upper, lower, at } : { upper, lower }
}

/** A plan's walls with their own finishes tidied; the same array when no wall has one, so older plans load as saved. */
export function normalizeWallFinishList<W extends { finish?: WallFinishes }>(walls: W[]): W[] {
  if (!walls.some(w => 'finish' in w)) return walls
  return walls.map(w => {
    if (!('finish' in w)) return w
    const finish = normalizeWallFinishes(w.finish)
    const out = { ...w, finish }
    if (!finish) delete out.finish
    return out
  })
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

/** A finish worked out: its cladding and colour, with the key that groups faces finished alike. */
export interface Band {
  walls: WallFinish
  colour: string
  key: string
}

export const ownColour = (walls: WallFinish) => WALL_FINISHES.find(x => x.id === walls)!.colour

export function band(p: FinishPick): Band {
  const colour = p.colour ?? ownColour(p.walls)
  return { walls: p.walls, colour, key: `${p.walls}|${colour}` }
}

/** The house's own outside wall finish, as a pick. */
export function houseUpper(f: Finishes | undefined): FinishPick {
  return f?.wallColour ? { walls: f.walls ?? 'plain', colour: f.wallColour } : { walls: f?.walls ?? 'plain' }
}

/** The house-wide lower part, as a pick; undefined when there's none. */
export function houseLower(f: Finishes | undefined): FinishPick | undefined {
  if (!f?.lower) return undefined
  return f.lowerColour ? { walls: f.lower, colour: f.lowerColour } : { walls: f.lower }
}

/** A split height kept inside a wall of `height` (m), leaving MIN_BAND of each finish. */
export const clampSplit = (at: number, height: number) => Math.min(Math.max(at, MIN_BAND), height - MIN_BAND)

/**
 * What an outside wall `height` metres high is finished in: its own setting, else the house's
 * (with the house-wide lower part, when there is one). `lower` is there only when the wall
 * really shows two different finishes; `at` is metres above its floor.
 */
export function wallBands(f: Finishes | undefined, own: WallFinishes | undefined, height: number): { upper: Band; lower?: Band; at?: number } {
  const upper = band(own ? own.upper : houseUpper(f))
  const lowerPick = own ? own.lower : houseLower(f)
  if (!lowerPick || height < 2 * MIN_BAND + 1e-6) return { upper }
  const lower = band(lowerPick)
  if (lower.key === upper.key) return { upper }
  const at = clampSplit((own ? own.at : f?.lowerTo) ?? DEFAULT_SPLIT, height)
  return { upper, lower, at }
}

/** A finish in words, lower case: "weatherboard, sage". */
export function bandWords(b: Pick<Band, 'walls' | 'colour'>): string {
  return `${WALL_FINISHES.find(x => x.id === b.walls)!.label}, ${colourName(b.colour, WALL_COLOURS)}`.toLowerCase()
}

/** The finishes in a line: "Brick, brick red · Metal sheeting, slate grey". */
export function finishesSummary(f: Finishes | undefined): string {
  const r = resolveFinishes(f)
  const wall = WALL_FINISHES.find(x => x.id === r.walls)!.label
  const roof = ROOF_FINISHES.find(x => x.id === r.roof)!.label
  return `Walls: ${wall}, ${colourName(r.wallColour, WALL_COLOURS).toLowerCase()} · Roof: ${roof}, ${colourName(r.roofColour, ROOF_COLOURS).toLowerCase()}`
}

/**
 * The plan with each of `ids`' own finish changed by `edit` (undefined puts a wall back on the
 * house's finish): several walls at once, as one change. The same plan when nothing changes.
 */
export function editWallFinishes(plan: Plan, ids: string[], edit: (own: WallFinishes | undefined) => WallFinishes | undefined): Plan {
  const set = new Set(ids)
  let changed = false
  const walls = plan.walls.map(w => {
    if (!set.has(w.id) || w.kind !== 'external') return w
    const next = normalizeWallFinishes(edit(w.finish))
    if (JSON.stringify(next) === JSON.stringify(w.finish)) return w
    changed = true
    const out = { ...w, finish: next }
    if (!next) delete out.finish
    return out
  })
  return changed ? { ...plan, walls } : plan
}

/** The outside walls with a finish of their own. */
export const wallsWithOwnFinish = (plan: Plan) => plan.walls.filter(w => w.kind === 'external' && w.finish)

/** Every wall back on the house's finish. */
export const clearWallFinishes = (plan: Plan) => editWallFinishes(plan, wallsWithOwnFinish(plan).map(w => w.id), () => undefined)

/** A new cladding for a pick, dropping a colour that was only the old cladding's own (as pickWallFinish does). */
export function repick(p: FinishPick, walls: WallFinish): FinishPick {
  return p.colour && p.colour !== ownColour(p.walls) ? { walls, colour: p.colour } : { walls }
}

/** The house-wide lower part changed: `undefined` takes it off. */
export function pickLowerFinish(plan: Plan, lower: WallFinish | undefined): Plan {
  if (!lower) return withFinishes(plan, { lower: undefined, lowerColour: undefined, lowerTo: undefined })
  const now = houseLower(plan.finishes)
  return withFinishes(plan, { lower, lowerColour: now ? repick(now, lower).colour : undefined })
}
