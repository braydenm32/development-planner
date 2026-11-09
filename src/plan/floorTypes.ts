// How each floor is built. Every level whose floor sits on the ground (the lowest, and on a split
// level any other within about a metre of the natural ground under its walls) is asked once (slab on
// ground, bearers and joists on piers, …), and its rooms follow that unless a room says otherwise.
// Levels well above the ground are framed floors, or a suspended slab. An answer belongs to its
// level: adding a level below, or changing a level's RL, never moves it.
// The list is one constant: a new floor type is one more entry, with what it does to the ground.

import type { Vec2 } from '../lib/geom'
import type { Level, Plan, Room, Wall } from './model'

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

/** Floors well above the ground: framed, unless the level says it's a suspended slab. */
export const FRAMED_FLOOR = {
  id: 'framed',
  label: 'Framed floor',
  short: 'framed floor',
  earthworks: 'Framed over the ground, which isn’t touched: no pad and no cut under it.',
} as const

/** What a level's floor can be: one of FLOOR_TYPES, or framed (a level well above the ground). */
export type LevelFloor = FloorTypeId | 'framed'

/** A level whose floor is no more than this above the natural ground somewhere under its walls sits on the ground (m). */
export const ON_GROUND_GAP = 1

/** The natural ground's RL at a point in the house's frame, or null off the block. */
export type GroundAt = (p: Vec2) => number | null

/** How far apart the ground is read along a wall (m). */
const GROUND_STEP = 0.5

/** A floor type with no answer yet builds as this. */
export const DEFAULT_FLOOR_TYPE: FloorTypeId = 'slab'

export const floorTypeInfo = (id: FloorTypeId): FloorTypeInfo => FLOOR_TYPES.find(t => t.id === id) ?? FLOOR_TYPES[0]

/** The floor types to choose from: the common ones, or all of them once "More floor types" is open (or `id` is a rarer one). */
export const floorTypeChoices = (more: boolean, id?: FloorTypeId) => FLOOR_TYPES.filter(t => more || t.common || t.id === id)

/** Is this a floor type the app knows? (Plans and files from elsewhere may say anything.) */
export const isFloorType = (id: unknown): id is FloorTypeId => FLOOR_TYPES.some(t => t.id === id)

/** Is this something a level's floor can be? */
export const isLevelFloor = (id: unknown): id is LevelFloor => id === FRAMED_FLOOR.id || isFloorType(id)

/** The lowest level: the one that always sits on the ground. */
const lowest = (plan: Pick<Plan, 'levels'>): Level | undefined => [...plan.levels].sort((a, b) => a.elevation - b.elevation)[0]

export const isLowestLevel = (plan: Pick<Plan, 'levels'>, levelId: string) => lowest(plan)?.id === levelId

/** The answer stored for a level, if it has been given (undefined until then). */
export function levelFloorAnswer(plan: Pick<Plan, 'levels'>, levelId: string): LevelFloor | undefined {
  const t = plan.levels.find(l => l.id === levelId)?.floorType
  return isLevelFloor(t) ? t : undefined
}

/**
 * A level's floor type: its own answer, wherever the level sits. With none, the lowest level is
 * undefined (not asked yet, built as a slab on ground) and any other level is framed, as every
 * level above the lowest was before floor types were asked level by level.
 */
export function levelFloorType(plan: Pick<Plan, 'levels'>, levelId: string): LevelFloor | undefined {
  const t = levelFloorAnswer(plan, levelId)
  if (t !== undefined) return t
  return isLowestLevel(plan, levelId) ? undefined : 'framed'
}

/** What a level's floor builds as: its type, or a slab on ground while the lowest level's isn't chosen. */
export const levelBuildsAs = (plan: Pick<Plan, 'levels'>, levelId: string): LevelFloor => levelFloorType(plan, levelId) ?? DEFAULT_FLOOR_TYPE

/** How a room's floor is built: its own type, else its level's; framed on a framed level. */
export function roomFloorType(plan: Pick<Plan, 'levels'>, room: Pick<Room, 'level' | 'foundation'>): LevelFloor {
  const level = levelBuildsAs(plan, room.level)
  if (level === 'framed') return 'framed'
  return isFloorType(room.foundation) ? room.foundation : level
}

/** A level's floor in a few words: "slab on ground", "framed floor", or "floor not chosen yet". */
export function levelFloorText(plan: Pick<Plan, 'levels'>, levelId: string): string {
  const t = levelFloorType(plan, levelId)
  return t === undefined ? 'floor not chosen yet' : t === 'framed' ? FRAMED_FLOOR.short : floorTypeInfo(t).short
}

/** Points along a wall, about every half metre, ends included. */
function alongWall(w: Pick<Wall, 'a' | 'b'>): Vec2[] {
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])
  const n = Math.max(1, Math.ceil(len / GROUND_STEP))
  return Array.from({ length: n + 1 }, (_, i): Vec2 => [w.a[0] + ((w.b[0] - w.a[0]) * i) / n, w.a[1] + ((w.b[1] - w.a[1]) * i) / n])
}

/**
 * The levels whose floor sits on the ground, and so are asked how it's built: the lowest always,
 * and, with the natural ground known, any level whose floor is no more than ON_GROUND_GAP above it
 * somewhere under its walls (a floor below the ground there is on it too).
 */
export function onGroundLevels(plan: Pick<Plan, 'levels' | 'walls' | 'placement'>, groundAt?: GroundAt): Set<string> {
  const out = new Set<string>()
  const low = lowest(plan)
  if (low) out.add(low.id)
  if (!groundAt) return out
  for (const l of plan.levels) {
    if (out.has(l.id)) continue
    const rl = plan.placement.ffl + l.elevation
    const near = plan.walls.some(
      w =>
        w.level === l.id &&
        w.kind !== 'retaining' &&
        alongWall(w).some(p => {
          const g = groundAt(p)
          return g !== null && rl - g <= ON_GROUND_GAP
        }),
    )
    if (near) out.add(l.id)
  }
  return out
}

/**
 * The choices for a level's floor. On the ground: the floor types (the usual two, the rest behind
 * More), and framed for a level that isn't the lowest. Well above it: framed or a suspended slab.
 * The level's own answer always shows, so it can be seen and kept.
 */
export function levelFloorChoices(onGround: boolean, isLowest: boolean, more: boolean, current?: LevelFloor): { id: LevelFloor; label: string }[] {
  const framed = { id: FRAMED_FLOOR.id, label: FRAMED_FLOOR.label }
  if (!onGround) return [framed, ...FLOOR_TYPES.filter(t => t.id === 'suspended' || t.id === current).map(t => ({ id: t.id, label: t.label }))]
  const ground = floorTypeChoices(more, current === 'framed' ? undefined : current).map(t => ({ id: t.id as LevelFloor, label: t.label }))
  return isLowest && current !== 'framed' ? ground : [...ground, framed]
}

/** Does the ground stay natural under this room (piers, suspended slab)? Never on a framed level. */
export function onNaturalGround(plan: Pick<Plan, 'levels'>, room: Pick<Room, 'level' | 'foundation'>): boolean {
  const t = roomFloorType(plan, room)
  return t !== 'framed' && floorTypeInfo(t).ground === 'natural'
}

/** Does this room sit on a levelled pad (slab on ground, waffle pod)? */
export function onPad(plan: Pick<Plan, 'levels'>, room: Pick<Room, 'level' | 'foundation'>): boolean {
  const t = roomFloorType(plan, room)
  return t !== 'framed' && floorTypeInfo(t).ground === 'pad'
}

/** Does this level's own floor (rooms without one of their own) sit on a levelled pad? */
export function levelOnPad(plan: Pick<Plan, 'levels'>, levelId: string): boolean {
  const t = levelBuildsAs(plan, levelId)
  return t !== 'framed' && floorTypeInfo(t).ground === 'pad'
}

/** The room's floor in a few words: "slab on ground", "framed floor". */
export function roomFloorText(plan: Pick<Plan, 'levels'>, room: Pick<Room, 'level' | 'foundation'>): string {
  const t = roomFloorType(plan, room)
  return t === 'framed' ? FRAMED_FLOOR.short : floorTypeInfo(t).short
}

/** The note under a room's name on the plan, for floors that aren't a plain slab: "on piers". */
export function roomFloorNote(plan: Pick<Plan, 'levels'>, room: Pick<Room, 'level' | 'foundation'>): string | undefined {
  const t = roomFloorType(plan, room)
  return t === 'framed' ? undefined : floorTypeInfo(t).note
}

/**
 * The ask-once rule: a new room (or newly enclosed space) on `levelId` asks how its floor is built
 * only on a level that sits on the ground (`onGround`; the lowest one when that isn't given), only
 * while that level has no answer, and only if it hasn't been put off already (`dismissed`, by level id).
 */
export function shouldAskFloorType(plan: Pick<Plan, 'levels'>, levelId: string, dismissed: ReadonlySet<string> = new Set(), onGround?: ReadonlySet<string>): boolean {
  const grounded = onGround ? onGround.has(levelId) || isLowestLevel(plan, levelId) : isLowestLevel(plan, levelId)
  return grounded && levelFloorAnswer(plan, levelId) === undefined && !dismissed.has(levelId)
}

/** Set a level's floor type (one undoable step through commit). */
export function setLevelFloorType<P extends Pick<Plan, 'levels'>>(plan: P, levelId: string, floorType: LevelFloor | undefined): P {
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
 *
 * Plans saved before floor types were asked level by level (no `floorsByLevel`) built every level
 * above the lowest as framed, whatever it held: a level that had been the lowest until one was
 * added below it kept its old answer but was framed. That answer is let go, so the plan opens
 * meaning what it did; from then on every level keeps its own.
 */
export function migrateFloorTypes<P extends Pick<Plan, 'levels' | 'rooms' | 'floorsByLevel'>>(plan: P): P {
  let p = plan
  if (!p.floorsByLevel) {
    const low = lowest(p)
    p = {
      ...p,
      floorsByLevel: true,
      levels: p.levels.map(l => {
        if (l.id === low?.id || l.floorType === undefined) return l
        const next = { ...l }
        delete next.floorType
        return next
      }),
    }
  }
  const ground = lowest(p)
  if (!ground || ground.floorType !== undefined || !(p.rooms ?? []).some(r => r.level === ground.id)) return p
  return setLevelFloorType(p, ground.id, DEFAULT_FLOOR_TYPE)
}

/**
 * Level order changed (a level added below, a floor's RL changed, a level deleted): the floor
 * that was the lowest, with no answer yet, was being built as a slab on ground. It keeps that as
 * its answer rather than turning framed because another level now sits lower. Answers given never
 * move; this only writes down the one that was being taken for granted.
 */
export function keepFloorTypes<P extends Pick<Plan, 'levels' | 'walls'>>(before: P | null | undefined, after: P): P {
  if (!before || before.levels === after.levels) return after
  const was = lowest(before)
  if (!was || levelFloorAnswer(before, was.id) !== undefined) return after
  if (!after.levels.some(l => l.id === was.id) || isLowestLevel(after, was.id)) return after
  if (!after.walls.some(w => w.level === was.id)) return after
  return setLevelFloorType(after, was.id, DEFAULT_FLOOR_TYPE)
}
