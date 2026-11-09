// How each floor is built. The lowest level is asked once (slab on ground, bearers and joists on
// piers, …) and its rooms follow that unless a room says otherwise; upper levels are framed floors.
// The list is one constant: a new floor type is one more entry, with what it does to the ground.

import type { Level, Plan, Room } from './model'

/**
 * What a floor type does to the ground under it:
 * `pad` levels it (cut and fill) to a pad under the floor, as a slab on ground does;
 * `natural` leaves it as it is, with the gap under floors on piers kept clear (Earthworks › More).
 */
export type GroundUnder = 'pad' | 'natural'

export interface FloorTypeInfo {
  id: string
  /** As a choice: "Slab on ground". */
  label: string
  /** In a sentence or a tooltip: "slab on ground". */
  short: string
  /** Under the room's name on the plan and the PDF, for floors that aren't a plain slab. */
  note?: string
  ground: GroundUnder
  /** The usual choices, shown first; the rest wait under "More floor types". */
  common: boolean
  /** What it means for the earthworks, in a line, for the card that asks. */
  earthworks: string
}

export const FLOOR_TYPES = [
  {
    id: 'slab',
    label: 'Slab on ground',
    short: 'slab on ground',
    ground: 'pad',
    common: true,
    earthworks: 'A levelled pad under the house: the ground is cut and filled flat under the slab.',
  },
  {
    id: 'piers',
    label: 'Bearers and joists on piers',
    short: 'bearers and joists on piers',
    note: 'on piers',
    ground: 'natural',
    common: true,
    earthworks: 'The ground stays natural under the floor, cut back only where it’s too close to the framing.',
  },
  {
    id: 'waffle',
    label: 'Waffle pod slab',
    short: 'waffle pod slab',
    note: 'waffle pod slab',
    ground: 'pad',
    common: false,
    earthworks: 'Like a slab on ground: a levelled pad, with cut and fill under the house.',
  },
  {
    id: 'suspended',
    label: 'Suspended slab',
    short: 'suspended slab',
    note: 'suspended slab',
    ground: 'natural',
    common: false,
    earthworks: 'Like a floor on piers: the ground stays natural under it, with the same gap kept clear.',
  },
] as const satisfies readonly FloorTypeInfo[]

export type FloorTypeId = (typeof FLOOR_TYPES)[number]['id']

/** Upper floors: framed, never asked. */
export const FRAMED_FLOOR = { id: 'framed', label: 'Framed floor', short: 'framed floor' } as const

/** A floor type with no answer yet builds as this. */
export const DEFAULT_FLOOR_TYPE: FloorTypeId = 'slab'

export const floorTypeInfo = (id: FloorTypeId): FloorTypeInfo => FLOOR_TYPES.find(t => t.id === id) ?? FLOOR_TYPES[0]

/** The floor types to choose from: the common ones, or all of them once "More floor types" is open (or `id` is a rarer one). */
export const floorTypeChoices = (more: boolean, id?: FloorTypeId) => FLOOR_TYPES.filter(t => more || t.common || t.id === id)

/** Is this a floor type the app knows? (Plans and files from elsewhere may say anything.) */
export const isFloorType = (id: unknown): id is FloorTypeId => FLOOR_TYPES.some(t => t.id === id)

/** The level that sits on the ground: the lowest one. */
const lowest = (plan: Pick<Plan, 'levels'>): Level | undefined => [...plan.levels].sort((a, b) => a.elevation - b.elevation)[0]

export const isLowestLevel = (plan: Pick<Plan, 'levels'>, levelId: string) => lowest(plan)?.id === levelId

/** A level's floor type: the lowest level's answer (undefined until asked), or a framed floor above it. */
export function levelFloorType(plan: Pick<Plan, 'levels'>, levelId: string): FloorTypeId | 'framed' | undefined {
  if (!isLowestLevel(plan, levelId)) return 'framed'
  const t = plan.levels.find(l => l.id === levelId)?.floorType
  return isFloorType(t) ? t : undefined
}

/** How a room's floor is built: its own type, else its level's, else a slab on ground; framed on upper levels. */
export function roomFloorType(plan: Pick<Plan, 'levels'>, room: Pick<Room, 'level' | 'foundation'>): FloorTypeId | 'framed' {
  const level = levelFloorType(plan, room.level)
  if (level === 'framed') return 'framed'
  return isFloorType(room.foundation) ? room.foundation : (level ?? DEFAULT_FLOOR_TYPE)
}

/** The room's floor in a few words: "slab on ground", "framed floor". */
export function roomFloorText(plan: Pick<Plan, 'levels'>, room: Pick<Room, 'level' | 'foundation'>): string {
  const t = roomFloorType(plan, room)
  return t === 'framed' ? FRAMED_FLOOR.short : floorTypeInfo(t).short
}

/** Does the ground stay natural under this room (piers, suspended slab)? Only ever on the lowest level. */
export function onNaturalGround(plan: Pick<Plan, 'levels'>, room: Pick<Room, 'level' | 'foundation'>): boolean {
  const t = roomFloorType(plan, room)
  return t !== 'framed' && floorTypeInfo(t).ground === 'natural'
}

/** Does this room sit on a levelled pad (slab on ground, waffle pod)? */
export function onPad(plan: Pick<Plan, 'levels'>, room: Pick<Room, 'level' | 'foundation'>): boolean {
  const t = roomFloorType(plan, room)
  return t !== 'framed' && floorTypeInfo(t).ground === 'pad'
}

/** The note under a room's name on the plan, for floors that aren't a plain slab: "on piers". */
export function roomFloorNote(plan: Pick<Plan, 'levels'>, room: Pick<Room, 'level' | 'foundation'>): string | undefined {
  const t = roomFloorType(plan, room)
  return t === 'framed' ? undefined : floorTypeInfo(t).note
}

/**
 * The ask-once rule: a new room (or newly enclosed space) on `levelId` asks how its floor is built
 * only on the lowest level, only while that level has no floor type, and only if it hasn't been
 * put off already (`dismissed`, by level id).
 */
export function shouldAskFloorType(plan: Pick<Plan, 'levels'>, levelId: string, dismissed: ReadonlySet<string> = new Set()): boolean {
  return isLowestLevel(plan, levelId) && levelFloorType(plan, levelId) === undefined && !dismissed.has(levelId)
}

/** Set the lowest level's floor type (one undoable step through commit). */
export function setLevelFloorType<P extends Pick<Plan, 'levels'>>(plan: P, levelId: string, floorType: FloorTypeId | undefined): P {
  return {
    ...plan,
    levels: plan.levels.map(l => {
      if (l.id !== levelId) return l
      const next = { ...l, floorType }
      if (floorType === undefined) delete next.floorType
      return next
    }),
  }
}

/**
 * Plans saved before floor types: a lowest level that already has rooms was built as slabs
 * (a missing foundation meant slab on ground), so it gets that, and every room keeps its own
 * foundation. Nothing builds differently, and nobody is asked about a floor already drawn.
 */
export function migrateFloorTypes<P extends Pick<Plan, 'levels' | 'rooms'>>(plan: P): P {
  const ground = lowest(plan)
  if (!ground || ground.floorType !== undefined || !(plan.rooms ?? []).some(r => r.level === ground.id)) return plan
  return setLevelFloorType(plan, ground.id, DEFAULT_FLOOR_TYPE)
}
