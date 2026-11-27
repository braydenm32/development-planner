// What kind of room a room is: Bedroom, Kitchen, Bathroom, Garage… picked in the Room card (or on
// the Room tool before placing), with its name suggested from it. The type is what Costs price
// (a kitchen, a bathroom, a laundry), what Site › Sun and BASIX count as a living area, and what
// tells a garage from a room with a floor finish.
//
// Rooms drawn before there were types have none: for them each of those goes by the room's name,
// exactly as it did, so an older plan's numbers don't move. The name tests live here too.

import type { Plan, Room } from './model'

/** Rooms that need their own fit-out and plumbing. */
export type WetRoom = 'kitchen' | 'bathroom' | 'laundry' | 'toilet'

export type RoomTypeId = 'bedroom' | 'living' | 'kitchen' | 'open' | 'dining' | 'bathroom' | 'ensuite' | 'toilet' | 'laundry' | 'study' | 'hall' | 'garage' | 'other'

export interface RoomTypeInfo {
  id: RoomTypeId
  /** As the Type list names it. */
  label: string
  /** The name a room of this type starts with. */
  name: string
  /** Costs price it as this wet room, fit-out and plumbing. */
  wet?: WetRoom
  /** A garage or carport: a bare concrete floor, and outside BASIX's conditioned area. */
  garage?: true
  /** A living area for the hours of winter sun (Site › Sun), unless its tick says otherwise. */
  sun?: true
  /** A living area whose windows BASIX's orientation line reads. */
  basix?: true
}

export const ROOM_TYPES: RoomTypeInfo[] = [
  { id: 'bedroom', label: 'Bedroom', name: 'Bedroom' },
  { id: 'living', label: 'Living or family', name: 'Living', sun: true, basix: true },
  { id: 'kitchen', label: 'Kitchen', name: 'Kitchen', wet: 'kitchen', basix: true },
  { id: 'open', label: 'Kitchen and living, open plan', name: 'Kitchen and living', wet: 'kitchen', sun: true, basix: true },
  { id: 'dining', label: 'Dining', name: 'Dining', sun: true, basix: true },
  { id: 'bathroom', label: 'Bathroom', name: 'Bathroom', wet: 'bathroom' },
  { id: 'ensuite', label: 'Ensuite', name: 'Ensuite', wet: 'bathroom' },
  { id: 'toilet', label: 'Toilet or powder room', name: 'Toilet', wet: 'toilet' },
  { id: 'laundry', label: 'Laundry', name: 'Laundry', wet: 'laundry' },
  { id: 'study', label: 'Study', name: 'Study' },
  { id: 'hall', label: 'Hall or entry', name: 'Hall' },
  { id: 'garage', label: 'Garage or carport', name: 'Garage', garage: true },
  { id: 'other', label: 'Other', name: 'Room' },
]

export const isRoomType = (v: unknown): v is RoomTypeId => ROOM_TYPES.some(t => t.id === v)

/** The type a room was given; null for a room with none (or one this version doesn't know), which goes by its name. */
export const roomTypeInfo = (room: Pick<Room, 'type'>): RoomTypeInfo | null => ROOM_TYPES.find(t => t.id === room.type) ?? null

// ---------------------------------------------------------------------------
// By name, for rooms with no type

export const WET_ROOMS: { id: WetRoom; label: string; plural: string; test: RegExp }[] = [
  { id: 'kitchen', label: 'kitchen', plural: 'kitchens', test: /kitchen/i },
  { id: 'bathroom', label: 'bathroom', plural: 'bathrooms', test: /bath|ensuite|en-suite|shower/i },
  { id: 'laundry', label: 'laundry', plural: 'laundries', test: /laundry/i },
  { id: 'toilet', label: 'toilet', plural: 'toilets', test: /\b(wc|toilet|powder)\b/i },
]

/** Which wet room a name reads as (the first that fits: "Laundry and WC" is a laundry); null for a dry room. */
export const wetRoomOf = (name: string): WetRoom | null => WET_ROOMS.find(w => w.test.test(name))?.id ?? null

/** Whether a name reads as a garage or carport. */
export const isGarageRoom = (name: string) => /garage|carport/i.test(name)

// ---------------------------------------------------------------------------
// By type, else by name

type Typed = Pick<Room, 'name' | 'type'>

/** Which wet room Costs price a room as: its type's, or (no type) what its name reads as. */
export function roomWet(room: Typed): WetRoom | null {
  const t = roomTypeInfo(room)
  return t ? (t.wet ?? null) : wetRoomOf(room.name)
}

/** A garage or carport: no floor finish, and outside BASIX's conditioned area. */
export function roomIsGarage(room: Typed): boolean {
  const t = roomTypeInfo(room)
  return t ? !!t.garage : isGarageRoom(room.name)
}

// ---------------------------------------------------------------------------
// Names from types

/** "Room 3" or nothing: a name nobody has chosen yet. */
const placeholder = (name: string) => !name.trim() || /^Room \d+$/.test(name.trim())

/** A name a type suggested: "Bedroom", "Bedroom 2". */
const suggestedBy = (name: string, t: RoomTypeInfo) => {
  const n = name.trim()
  return n === t.name || (n.startsWith(`${t.name} `) && /^\d+$/.test(n.slice(t.name.length + 1)))
}

/** A name for a new room of a type: the type's own, numbered from 2 where the plan has it already ("Bedroom 2"). */
export function suggestedRoomName(plan: Pick<Plan, 'rooms'>, type: RoomTypeId, except?: string): string {
  const base = ROOM_TYPES.find(t => t.id === type)!.name
  const taken = new Set(plan.rooms.filter(r => r.id !== except).map(r => r.name.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  let n = 2
  while (taken.has(`${base} ${n}`.toLowerCase())) n++
  return `${base} ${n}`
}

/**
 * Give a room a type. Its name follows where nobody has chosen one ("Room 3", or the name its last
 * type suggested); a name someone typed stays. The winter sun tick goes back to following the type.
 */
export function setRoomType(plan: Plan, id: string, type: RoomTypeId): Plan {
  const room = plan.rooms.find(r => r.id === id)
  if (!room || room.type === type) return plan
  const was = roomTypeInfo(room)
  const rename = placeholder(room.name) || (was !== null && suggestedBy(room.name, was))
  return {
    ...plan,
    rooms: plan.rooms.map(r => {
      if (r !== room) return r
      const next: Room = { ...r, type, name: rename ? suggestedRoomName(plan, type, id) : r.name }
      delete next.living
      return next
    }),
  }
}

/** What a room's type (or, with none, its name) makes it elsewhere in the app, in a line for the Room card. */
export function roomCountsAs(room: Typed): string {
  const typed = roomTypeInfo(room) !== null
  const wet = roomWet(room)
  const says = wet
    ? `the estimate prices it as a ${wet}, with its plumbing.`
    : roomIsGarage(room)
      ? 'a garage has no floor finish in the estimate, and BASIX leaves it out of the area to heat and cool.'
      : null
  if (says) return typed ? says[0].toUpperCase() + says.slice(1) : `Going by its name, ${says}`
  return typed ? 'The estimate prices its floor finish, and nothing more for the room itself.' : 'No type yet: pick one so the estimate knows a kitchen, bathroom or laundry when it sees one.'
}
