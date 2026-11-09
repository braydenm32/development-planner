// The levels as a list to pick from: each one's name, floor RL, how its floor is built, whether it
// sits on the ground, and whether its ghost shows under the level being drawn on. The plan's level
// menu reads it now; the section workspace's level bands can read the same rows later.

import { create } from 'zustand'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Heightfield } from '../lib/terrain'
import { levelFloorAnswer, levelFloorText, levelFloorType, onGroundLevels, type LevelFloor } from './floorTypes'
import { groundAtPlan } from './groundOverlay'
import { floorRL, sortedLevels, type Plan } from './model'

export interface LevelRow {
  id: string
  name: string
  /** RL of the finished floor. */
  rl: number
  /** Its floor type; undefined while the lowest level's isn't chosen. */
  floor: LevelFloor | undefined
  /** "slab on ground", "framed floor". */
  floorText: string
  /** Sits on the ground (see onGroundLevels), so it's asked how its floor is built. */
  onGround: boolean
  /** The level being drawn on. */
  active: boolean
  /** Levels from the active one: 1 the next up, −1 the next down, 0 itself. */
  steps: number
  /** Its walls show faintly under the active level, and snap. */
  ghost: boolean
}

/** The levels on the ground, reading the natural ground under their walls; the lowest alone without a survey. */
export function groundedLevels(plan: Plan, survey?: Pick<Survey, 'origin' | 'boundary'> | null, grid?: Heightfield | null): Set<string> {
  return onGroundLevels(plan, survey && grid ? (p: Vec2) => groundAtPlan(p, plan.placement, survey, grid) : undefined)
}

/** A level's floor in a few words, as lists show it: "not chosen yet" for one on the ground still to be asked. */
export function levelFloorWords(plan: Plan, levelId: string, onGround: boolean): string {
  return onGround && levelFloorAnswer(plan, levelId) === undefined ? 'floor not chosen yet' : levelFloorText(plan, levelId)
}

/** Every level, highest first, as the level menu lists them. */
export function levelRows(plan: Plan, active: string, hidden: ReadonlySet<string>, grounded: ReadonlySet<string>): LevelRow[] {
  const levels = sortedLevels(plan)
  const at = Math.max(
    0,
    levels.findIndex(l => l.id === active),
  )
  return levels
    .map((l, i) => ({
      id: l.id,
      name: l.name,
      rl: floorRL(plan, l.id),
      floor: levelFloorType(plan, l.id),
      floorText: levelFloorWords(plan, l.id, grounded.has(l.id)),
      onGround: grounded.has(l.id),
      active: l.id === active,
      steps: i - at,
      ghost: l.id !== active && !hidden.has(l.id),
    }))
    .reverse()
}

/** How strongly another level's ghost draws: the next level clearly, fainter each level further away. */
export function ghostOpacity(steps: number): number {
  const n = Math.abs(steps)
  if (n === 0) return 1
  return Math.max(0.25, 1 - 0.3 * (n - 1))
}

/** The level one up (1) or down (−1) from `active`, or null at the top or bottom. */
export function stepLevel(plan: Plan, active: string, dir: 1 | -1): string | null {
  const levels = sortedLevels(plan)
  const i = levels.findIndex(l => l.id === active)
  return levels[i + dir]?.id ?? null
}

// ---------------------------------------------------------------------------
// Which levels' ghosts are switched off: a viewer's own preference, kept in this browser.

const KEY = 'plan-ghosts-off-v1'

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-200) : []
  } catch {
    return []
  }
}

interface GhostState {
  /** Level ids whose ghost is off. Every other level's shows. */
  off: string[]
}

export const useGhosts = create<GhostState>(() => ({ off: load() }))

/** Show or hide a level's ghost. */
export function setGhost(levelId: string, on: boolean) {
  const off = useGhosts.getState().off.filter(id => id !== levelId)
  if (!on) off.push(levelId)
  useGhosts.setState({ off })
  try {
    localStorage.setItem(KEY, JSON.stringify(off.slice(-200)))
  } catch {
    // Kept for this visit only.
  }
}
