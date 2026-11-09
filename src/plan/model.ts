import type { BasixAnswers } from '../basix/model'
import type { CheckSettings } from '../checks/types'
import type { DaSettings } from '../da/model'
import type { Stormwater } from '../drainage/model'
import type { Vec2 } from '../lib/geom'
import type { SiteLocation } from '../sun/location'
import { migrateFloorTypes, type FloorTypeId } from './floorTypes'

/**
 * A house plan. All plan geometry is in metres in the house's own frame
 * (x along the house's main axis, y at right angles to it); `placement`
 * puts that frame on the site.
 */
export interface Plan {
  version: 1
  /** What the project is called on drawings and file names. */
  name?: string
  levels: Level[]
  walls: Wall[]
  openings: Opening[]
  rooms: Room[]
  areas: Area[]
  roofs: Roof[]
  stairs: Stair[]
  /** Missing in plans saved before furniture; filled in as [] when loaded. */
  furniture: Furniture[]
  /** Short text labels dropped on the plan. Missing in plans saved before notes; filled in as [] when loaded. */
  notes?: PlanNote[]
  placement: Placement
  /** Cut and fill settings; defaults apply when missing. */
  earthworks?: Earthworks
  /** Facts about the block the checks need and the approval pathway to check; defaults apply when missing. */
  checks?: CheckSettings
  /** The stormwater concept's tank settings (src/drainage); defaults apply when missing. */
  stormwater?: Stormwater
  /** The DA pack's revision letter (src/da); revision A when missing. */
  da?: DaSettings
  /** What the person has told the BASIX checklist (src/basix); defaults apply when missing. */
  basix?: BasixAnswers
  /** Section lines drawn across the plan (Design › Sections). Missing in plans saved before them, which have none. */
  sections?: SectionLine[]
  /** Where the block is, for the sun and shadows; missing means Sydney (see locationOf). */
  location?: SiteLocation
}

/**
 * A cut through the house and the ground, drawn as a line across the plan (in the house frame) and
 * named like a cut A–A. Its drawing runs from `a` on the left to `b` on the right, looking to the
 * line's left.
 */
export interface SectionLine {
  id: string
  /** The letter at both ends: A, B, … */
  label: string
  a: Vec2
  b: Vec2
}

export interface Level {
  id: string
  name: string
  /** Height of this floor's finished level above the ground floor's (m). */
  elevation: number
  /** Floor-to-ceiling height (m). */
  height: number
  /**
   * Lowest level only: how its floor is built (see FLOOR_TYPES in ./floorTypes). Rooms follow it
   * unless they set their own. Missing means not asked yet, which builds as a slab on ground.
   * Upper levels are framed floors and never set it.
   */
  floorType?: FloorTypeId
}

/** Retaining walls hold back earth on the site; they aren't part of the house. */
export type WallKind = 'external' | 'internal' | 'retaining'

export interface Wall {
  id: string
  level: string
  a: Vec2
  b: Vec2
  thickness: number
  kind: WallKind
  /** Retaining walls: what it holds back. Missing (as in older plans) means its height follows the ground. */
  retain?: Retain
}

/** Finished ground on one side of a retaining wall: an RL, or the house pad (which follows the floor). */
export type SideLevel = number | 'pad'

/**
 * What a retaining wall holds back. A side with a level becomes level ground beside the wall,
 * `…Bench` metres wide, which then batters back to the natural ground.
 */
export interface Retain {
  /** The side holding back the higher ground, looking from the wall's start to its end. */
  high: 'left' | 'right'
  /** RL of the top of the wall; missing follows the higher ground plus the freeboard. */
  top?: number
  /** Finished ground on the high side; missing keeps the natural ground. */
  highLevel?: SideLevel
  /** Finished ground on the low side; missing keeps the natural ground. */
  lowLevel?: SideLevel
  /** How far the level ground runs out from each face before it batters back (m). */
  highBench?: number
  lowBench?: number
}

/** Level ground beside a retaining wall when its width isn't set (m). */
export const DEFAULT_BENCH = 2

/**
 * 'opening' is a plain gap with a head over it, such as a cased opening or an archway.
 * 'garage' is a garage door: a wide opening with an overhead door and no swing.
 */
export type OpeningKind = 'door' | 'window' | 'opening' | 'garage'

/** What each kind of opening is called, in panels and on the plan. */
export const OPENING_NAMES: Record<OpeningKind, string> = { door: 'Door', window: 'Window', opening: 'Opening', garage: 'Garage door' }

export interface Opening {
  id: string
  wall: string
  kind: OpeningKind
  /** Distance from the wall's start point to the opening's centre (m). */
  offset: number
  width: number
  height: number
  /** Height of the opening's bottom above the floor (0 for doors). */
  sill: number
  /** Doors: hinge at the far end instead of the near end. */
  flipHinge: boolean
  /** Doors: swing to the wall's right side instead of its left. */
  flipSwing: boolean
}

/** How the lowest floor is held up: one of FLOOR_TYPES (slab on ground, bearers and joists on piers, …). */
export type Foundation = FloorTypeId

/** A room is a named point; its shape is the enclosed area of walls around that point. */
export interface Room {
  id: string
  level: string
  name: string
  at: Vec2
  /** Lowest level only: this room's own floor type. Missing follows its level's (see roomFloorType). */
  foundation?: Foundation
  /** A living area, for the hours of winter sun on its windows. Missing goes by the room's name (see isLiving). */
  living?: boolean
}

/**
 * slab: flat concrete at a set level, with the ground levelled under it.
 * driveway: concrete that follows the finished ground.
 * deck: a framed deck on posts.
 * garden: an outline on the ground (lawn, garden bed), with no structure.
 */
export type AreaKind = 'slab' | 'driveway' | 'deck' | 'garden'

/** A drawn outline with no walls, such as a deck, patio, porch or driveway. */
export interface Area {
  id: string
  level: string
  name: string
  pts: Vec2[]
  /** Missing means a concrete slab (older plans). */
  kind?: AreaKind
  /** Top of a slab or deck above the level's floor (m); missing means 0. */
  top?: number
  /** Driveways: the levels it is built to at each end. Missing follows the ground. */
  drive?: DriveLevels
}

/** Where a driveway's street-end level comes from: the kerb, a surveyed spot level, or a typed RL. */
export type DriveLevelSource = 'kerb' | 'spot' | 'typed'

/**
 * A driveway's own levels, at its street end and its garage end. An end without one follows the
 * ground there, as a driveway without levels does.
 */
export interface DriveLevels {
  /** The street end: an RL, and where it was read from. */
  street?: { rl: number; from: DriveLevelSource }
  /** The garage end: the garage's slab (which follows the floor), or a typed RL. */
  garage?: 'slab' | number
}

export type RoofType = 'hip' | 'gable' | 'skillion' | 'flat'

/** A roof sitting on top of a level's walls. */
export interface Roof {
  id: string
  level: string
  /** Eaves line before the overhang (usually the outside face of the walls), counter-clockwise. */
  pts: Vec2[]
  type: RoofType
  /** Degrees from horizontal. */
  pitch: number
  /** How far the roof reaches past `pts` (m). */
  overhang: number
  /** Gable roofs: which edges of `pts` are gable ends. */
  gables: boolean[]
  /** Skillion roofs: the edge of `pts` at the low side. */
  lowEdge: number
}

export type StairShape = 'straight' | 'l' | 'u'

export interface Stair {
  id: string
  level: string
  /** Middle of the front edge of the bottom step. */
  at: Vec2
  /** Direction of travel going up, degrees anticlockwise from the plan's x axis. */
  angle: number
  width: number
  /** Height of the bottom of the stair above the level's floor (m); negative is below it. */
  base: number
  /** Total height climbed (m). */
  rise: number
  /** Tread depth (m). */
  going: number
  shape: StairShape
  /** L and U stairs: which way the second flight turns. */
  turn: 'left' | 'right'
}

/**
 * A piece of furniture or a fixture, drawn from the catalog in ./furniture.
 * Its own frame has x across its width and y from its front (-depth/2) to its back (+depth/2).
 */
export interface Furniture {
  id: string
  level: string
  /** Catalog key, e.g. 'bed-queen'. */
  kind: string
  /** Centre of its footprint (m). */
  at: Vec2
  /** Degrees anticlockwise. At 0 its back faces +y. */
  rotation: number
  /** Across the front, front to back, and overall height (m). */
  width: number
  depth: number
  height: number
  /** Shown instead of the catalog name. */
  label?: string
}

/** A short text label on the plan, on one level, at a point in the house's frame (m). */
export interface PlanNote {
  id: string
  level: string
  at: Vec2
  text: string
}

export interface Earthworks {
  /** Level ground this far past the edge of slabs (m). */
  margin: number
  /** Batter slopes as horizontal run per 1 m of height; 0 means a retaining wall. */
  cutBatter: number
  fillBatter: number
  /** Gap kept between the ground and the underside of floors on piers (m). */
  subfloor: number
}

export interface Placement {
  /** Site coordinates (easting, northing) of the plan's origin. */
  e: number
  n: number
  /** Anticlockwise rotation of the plan's x axis from east, degrees. */
  rotation: number
  /**
   * RL that each level's "Above ground floor" height is measured from. A level's floor
   * is at ffl + its elevation (see floorRL); the ground floor normally has elevation 0.
   */
  ffl: number
}

export const WALL_PRESETS: { label: string; kind: WallKind; thickness: number }[] = [
  { label: 'External (masonry, 300 mm)', kind: 'external', thickness: 0.3 },
  { label: 'External (brick veneer, 270 mm)', kind: 'external', thickness: 0.27 },
  { label: 'External (lightweight clad, 200 mm)', kind: 'external', thickness: 0.2 },
  { label: 'Internal (stud, 110 mm)', kind: 'internal', thickness: 0.11 },
  { label: 'Retaining (concrete block, 200 mm)', kind: 'retaining', thickness: 0.2 },
  { label: 'Retaining (sleepers, 150 mm)', kind: 'retaining', thickness: 0.15 },
]

export const WALL_KINDS: { id: WallKind; label: string }[] = [
  { id: 'external', label: 'External' },
  { id: 'internal', label: 'Internal' },
  { id: 'retaining', label: 'Retaining' },
]

export const isRetaining = (w: Pick<Wall, 'kind'>) => w.kind === 'retaining'

/** The walls that make up the house, leaving out retaining walls. */
export const houseWalls = (walls: Wall[]) => walls.filter(w => !isRetaining(w))

export const DOOR_DEFAULT = { width: 0.82, height: 2.04, sill: 0 }
export const WINDOW_DEFAULT = { width: 1.2, height: 1.2, sill: 0.9 }
export const OPENING_DEFAULT = { width: 2.4, height: 2.1, sill: 0 }
/** A double garage door. */
export const GARAGE_DOOR_DEFAULT = { width: 4.8, height: 2.1, sill: 0 }

export const FLOOR_STRUCTURE = 0.3 // allowance between ceiling and the floor above (m)
export const SLAB_THICKNESS = 0.1 // outdoor concrete slabs and driveways (m)
export const DECK_DEPTH = 0.2 // deck boards and joists (m)
export const MAX_RISER = 0.19 // m

export const DEFAULT_EARTHWORKS: Earthworks = { margin: 0.5, cutBatter: 2, fillBatter: 2, subfloor: 0.4 }

export const AREA_KINDS: { id: AreaKind; label: string }[] = [
  { id: 'slab', label: 'Concrete slab' },
  { id: 'driveway', label: 'Driveway (follows the ground)' },
  { id: 'deck', label: 'Deck on posts' },
  { id: 'garden', label: 'Garden or lawn' },
]

export const areaKind = (a: Area): AreaKind => a.kind ?? 'slab'

let counter = 0
export function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function emptyPlan(placement: Placement): Plan {
  return {
    version: 1,
    levels: [{ id: 'level_ground', name: 'Ground floor', elevation: 0, height: 2.7 }],
    walls: [],
    openings: [],
    rooms: [],
    areas: [],
    roofs: [],
    stairs: [],
    furniture: [],
    placement,
  }
}

/** Fill in anything an older saved plan is missing. */
export function normalizePlan(p: Plan): Plan {
  return migrateFloorTypes({
    ...p,
    rooms: p.rooms ?? [],
    openings: p.openings ?? [],
    areas: p.areas ?? [],
    roofs: p.roofs ?? [],
    stairs: p.stairs ?? [],
    furniture: p.furniture ?? [],
    notes: p.notes ?? [],
    // Kept only when there are some, so older plans load exactly as they were saved.
    ...(Array.isArray(p.sections) ? { sections: p.sections.filter(isSectionLine) } : {}),
  })
}

const isPoint = (v: unknown): v is Vec2 => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n))

/** A section line that can be drawn: an id, a label and two ends. */
export const isSectionLine = (s: unknown): s is SectionLine => {
  const x = s as SectionLine | null
  return !!x && typeof x.id === 'string' && typeof x.label === 'string' && isPoint(x.a) && isPoint(x.b)
}

export function earthworksOf(plan: Plan): Earthworks {
  return { ...DEFAULT_EARTHWORKS, ...plan.earthworks }
}

export function wallLength(w: Pick<Wall, 'a' | 'b'>): number {
  return Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])
}

export function wallDir(w: Pick<Wall, 'a' | 'b'>): Vec2 {
  const len = wallLength(w) || 1
  return [(w.b[0] - w.a[0]) / len, (w.b[1] - w.a[1]) / len]
}

export function pointOnWall(w: Pick<Wall, 'a' | 'b'>, offset: number): Vec2 {
  const d = wallDir(w)
  return [w.a[0] + d[0] * offset, w.a[1] + d[1] * offset]
}

/** House frame -> site local frame (x = E - origin E, y = N - origin N). */
export function toSite(p: Vec2, pl: Placement, origin: Vec2): Vec2 {
  const t = (pl.rotation * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  return [p[0] * c - p[1] * s + pl.e - origin[0], p[0] * s + p[1] * c + pl.n - origin[1]]
}

/** Site local frame -> house frame. */
export function fromSite(p: Vec2, pl: Placement, origin: Vec2): Vec2 {
  const t = (pl.rotation * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const x = p[0] + origin[0] - pl.e
  const y = p[1] + origin[1] - pl.n
  return [x * c + y * s, -x * s + y * c]
}

/** Keep openings inside their wall after the wall changes length. */
export function clampOpenings(plan: Plan): Plan {
  const walls = new Map(plan.walls.map(w => [w.id, w]))
  const openings = plan.openings.flatMap(o => {
    const w = walls.get(o.wall)
    if (!w) return []
    const len = wallLength(w)
    if (o.width >= len) return []
    const offset = Math.min(Math.max(o.offset, o.width / 2), len - o.width / 2)
    return offset === o.offset ? [o] : [{ ...o, offset }]
  })
  return { ...plan, openings }
}

export function levelById(plan: Plan, id: string): Level | undefined {
  return plan.levels.find(l => l.id === id)
}

export function sortedLevels(plan: Plan): Level[] {
  return [...plan.levels].sort((a, b) => a.elevation - b.elevation)
}

/**
 * RL of a level's finished floor: the placement's FFL plus the level's height above the
 * ground floor. With no level given, the lowest level's: the floor that sits on the ground.
 * Every floor level the app shows, draws, prints or levels the ground for comes from here.
 */
export function floorRL(plan: Plan, levelId?: string): number {
  const level = levelId === undefined ? sortedLevels(plan)[0] : levelById(plan, levelId)
  return plan.placement.ffl + (level?.elevation ?? 0)
}

/** The placement FFL that puts the lowest level's floor at `rl`. */
export function fflForGroundRL(plan: Plan, rl: number): number {
  return rl - (sortedLevels(plan)[0]?.elevation ?? 0)
}
