import { pointInPolygon, type Vec2 } from '../lib/geom'
import { levelById, MAX_RISER, type Level, type Plan, type Stair } from './model'

/** A tread or landing: a solid block from the bottom of the stair up to `top`. */
export interface StairStep {
  pts: Vec2[]
  /** Height of the step's top above the bottom of the stair. */
  top: number
}

export interface StairLayout {
  risers: number
  /** Height of each riser (m). */
  riser: number
  /** Number of treads, not counting a landing. */
  treads: number
  /** L and U stairs have a landing between the flights. */
  landing: boolean
  steps: StairStep[]
  /** Footprint of the whole stair. */
  outline: Vec2[]
  /** Front edges of the treads, for the plan symbol. */
  treadLines: [Vec2, Vec2][]
  /** Walking line from the bottom step to the top. */
  walk: Vec2[]
}

export function riserCount(rise: number): number {
  return Math.max(2, Math.ceil(rise / MAX_RISER - 1e-9))
}

export function stairLayout(s: Stair): StairLayout {
  const n = riserCount(s.rise)
  const r = s.rise / n
  const g = s.going
  const W = s.width
  const t = (s.angle * Math.PI) / 180
  const u: Vec2 = [Math.cos(t), Math.sin(t)]
  const side = s.turn === 'right' ? -1 : 1
  const v: Vec2 = [-u[1] * side, u[0] * side]
  // Local (along, across) -> plan
  const P = (a: number, b: number): Vec2 => [s.at[0] + u[0] * a + v[0] * b, s.at[1] + u[1] * a + v[1] * b]
  const rect = (a0: number, a1: number, b0: number, b1: number): Vec2[] => [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)]

  const steps: StairStep[] = []
  const treadLines: [Vec2, Vec2][] = []
  let outline: Vec2[]
  let walk: Vec2[]

  if (s.shape === 'straight') {
    for (let k = 1; k < n; k++) steps.push({ pts: rect((k - 1) * g, k * g, -W / 2, W / 2), top: k * r })
    for (let k = 0; k < n; k++) treadLines.push([P(k * g, -W / 2), P(k * g, W / 2)])
    const L = (n - 1) * g
    outline = rect(0, L, -W / 2, W / 2)
    walk = [P(0, 0), P(L, 0)]
  } else {
    const n1 = Math.ceil(n / 2)
    const n2 = n - n1
    const L1 = (n1 - 1) * g
    for (let k = 1; k < n1; k++) steps.push({ pts: rect((k - 1) * g, k * g, -W / 2, W / 2), top: k * r })
    for (let k = 0; k < n1; k++) treadLines.push([P(k * g, -W / 2), P(k * g, W / 2)])
    if (s.shape === 'l') {
      steps.push({ pts: rect(L1, L1 + W, -W / 2, W / 2), top: n1 * r })
      for (let j = 1; j < n2; j++) {
        steps.push({ pts: rect(L1, L1 + W, W / 2 + (j - 1) * g, W / 2 + j * g), top: (n1 + j) * r })
      }
      for (let j = 0; j < n2; j++) treadLines.push([P(L1, W / 2 + j * g), P(L1 + W, W / 2 + j * g)])
      const end = W / 2 + (n2 - 1) * g
      outline = [P(0, -W / 2), P(L1 + W, -W / 2), P(L1 + W, end), P(L1, end), P(L1, W / 2), P(0, W / 2)]
      walk = [P(0, 0), P(L1 + W / 2, 0), P(L1 + W / 2, end)]
    } else {
      steps.push({ pts: rect(L1, L1 + W, -W / 2, (3 * W) / 2), top: n1 * r })
      for (let j = 1; j < n2; j++) {
        steps.push({ pts: rect(L1 - j * g, L1 - (j - 1) * g, W / 2, (3 * W) / 2), top: (n1 + j) * r })
      }
      for (let j = 0; j < n2; j++) treadLines.push([P(L1 - j * g, W / 2), P(L1 - j * g, (3 * W) / 2)])
      const end = L1 - (n2 - 1) * g
      outline = [P(0, -W / 2), P(L1 + W, -W / 2), P(L1 + W, (3 * W) / 2), P(end, (3 * W) / 2), P(end, W / 2), P(0, W / 2)]
      walk = [P(0, 0), P(L1 + W / 2, 0), P(L1 + W / 2, W), P(end, W)]
    }
  }
  // drop repeated corners (e.g. a U stair with equal flights)
  outline = outline.filter((p, i) => {
    const q = outline[(i + 1) % outline.length]
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6
  })
  // Counter-clockwise, whichever way the stair turns.
  if (side < 0) outline.reverse()
  // One step fewer than risers; on an L or U stair one of those steps is the landing.
  const landing = s.shape !== 'straight'
  return { risers: n, riser: r, treads: n - 1 - (landing ? 1 : 0), landing, steps, outline, treadLines, walk }
}

/** Millimetres to 0.1 mm, without a trailing ".0": 187.5, 190. */
const mm1 = (m: number) => String(Math.round(m * 10000) / 10)

/**
 * What the stair panel shows: risers as "16 × 187.5 mm" (to 0.1 mm, so they add up to the rise
 * and to 2R + G), treads as "14 × 250 mm + landing" (the going in whole mm, as its box shows it).
 */
export function stairCounts(s: Stair): { risers: string; treads: string } {
  const L = stairLayout(s)
  return {
    risers: `${L.risers} × ${mm1(L.riser)} mm`,
    treads: `${L.treads} × ${Math.round(s.going * 1000)} mm${L.landing ? ' + landing' : ''}`,
  }
}

export function stairContains(s: Stair, p: Vec2): boolean {
  return pointInPolygon(p[0], p[1], stairLayout(s).outline)
}

/** The 2R + G rule of thumb for a comfortable stair, in metres. */
export function stairComfort(s: Stair): { value: number; ok: boolean } {
  const r = s.rise / riserCount(s.rise)
  const value = 2 * r + s.going
  return { value, ok: value >= 0.55 && value <= 0.7 }
}

// ---------------------------------------------------------------------------
// The levels a stair joins

/** How close a stair's top has to come to a floor to arrive there (m). */
export const STAIR_REACH = 0.05

/** The least a stair joined to a level may climb (m), as the panel's Top and Bottom allow. */
const MIN_RISE = 0.1

const elevationOf = (plan: Plan, id: string) => levelById(plan, id)?.elevation ?? 0

/** Height of a stair's top above the "Above ground floor" zero (m). */
const topElevation = (plan: Plan, s: Stair) => elevationOf(plan, s.level) + s.base + s.rise

/** The floors a stair's top meets, other than the one it starts from. */
function floorsAtTop(plan: Plan, s: Stair): Level[] {
  const top = topElevation(plan, s)
  return plan.levels.filter(l => l.id !== s.level && Math.abs(l.elevation - top) < STAIR_REACH)
}

/** The level a stair goes up to: the one it's joined to, or else the one floor its top meets. */
export function stairTopLevel(plan: Plan, s: Stair): Level | undefined {
  if (typeof s.toLevel === 'string') return levelById(plan, s.toLevel)
  const at = floorsAtTop(plan, s)
  return at.length === 1 ? at[0] : undefined
}

/** The stair comes up through `levelId`'s floor, which gets a hole and the stair drawn arriving. */
export function stairArrivesAt(plan: Plan, s: Stair, levelId: string): boolean {
  const from = levelById(plan, s.level)
  const to = levelById(plan, levelId)
  return !!from && !!to && from.elevation < to.elevation && Math.abs(topElevation(plan, s) - to.elevation) < STAIR_REACH
}

/** The stair's top meets no floor: climbing it, you'd step out into the air or into a ceiling. */
export function stairMeetsNoFloor(plan: Plan, s: Stair): boolean {
  // A stair that starts below its own floor (steps up out of a sunken room) arrives on its own level.
  if (s.base < 0 && Math.abs(s.base + s.rise) < STAIR_REACH) return false
  return floorsAtTop(plan, s).length === 0
}

/** The rise that takes a stair from its bottom to `to`'s floor (m), to the micrometre. */
const riseTo = (plan: Plan, s: Stair, to: Level) => Math.round((to.elevation - elevationOf(plan, s.level) - s.base) * 1e6) / 1e6

/**
 * Joined stairs follow their levels: each one's rise becomes the gap up to the floor it's joined
 * to. A stair whose level is gone, or now isn't above its bottom, is let go: its top stays where it
 * was and stairMeetsNoFloor flags it. Returns the same plan when nothing changes.
 */
export function followLevels(plan: Plan): Plan {
  let changed = false
  const stairs = plan.stairs.map(s => {
    if (typeof s.toLevel !== 'string') return s
    const to = levelById(plan, s.toLevel)
    const rise = to && to.id !== s.level ? riseTo(plan, s, to) : NaN
    if (!(rise >= MIN_RISE)) {
      changed = true
      return { ...s, toLevel: null }
    }
    if (Math.abs(rise - s.rise) < 1e-9) return s
    changed = true
    return { ...s, rise }
  })
  return changed ? { ...plan, stairs } : plan
}

/**
 * Join each stair that isn't joined yet (an older plan's, or one drawn on the top level before a
 * level went above it) to the one floor above that its top meets within STAIR_REACH, landing it
 * exactly on that floor. A stair whose top meets two floors, or none, is left as it is, and so is
 * one with a typed top (toLevel null). Returns the same plan when nothing changes.
 */
export function linkStairs(plan: Plan): Plan {
  let changed = false
  const stairs = plan.stairs.map(s => {
    if (s.toLevel !== undefined) return s
    const at = floorsAtTop(plan, s)
    if (at.length !== 1 || at[0].elevation <= elevationOf(plan, s.level)) return s
    changed = true
    return { ...s, toLevel: at[0].id }
  })
  return changed ? followLevels({ ...plan, stairs }) : plan
}

// ---------------------------------------------------------------------------
// What the panel and the plan say about a stair

/**
 * The NCC's limits for a house stair (Housing Provisions 11.2.2, Table 11.2.2a): risers 115 to
 * 190 mm, goings 240 to 355 mm, and 2 risers + going 550 to 700 mm. Metres.
 */
export const NCC_STAIR = {
  riser: [0.115, 0.19],
  going: [0.24, 0.355],
  twoRG: [0.55, 0.7],
} as const

export interface StairRule {
  id: 'riser' | 'going' | 'twoRG'
  label: string
  /** The stair's own value (m). */
  value: number
  range: readonly [number, number]
  ok: boolean
}

/** Each of the NCC's limits, checked against the stair: risers, going, and 2R + G. */
export function stairRules(s: Stair): StairRule[] {
  const r = s.rise / riserCount(s.rise)
  const rule = (id: StairRule['id'], label: string, value: number): StairRule => {
    const range = NCC_STAIR[id]
    // To the 0.1 mm the panel shows, so a 190 mm riser passes.
    const v = Math.round(value * 10000) / 10000
    return { id, label, value, range, ok: v >= range[0] - 1e-9 && v <= range[1] + 1e-9 }
  }
  return [rule('riser', 'Risers', r), rule('going', 'Going', s.going), rule('twoRG', '2R + G', 2 * r + s.going)]
}

/** An RL as the panel writes it, to the centimetre. */
const rlText = (z: number) => z.toFixed(2)

/**
 * Which levels a stair joins and how, in words: "Joins Living 81.60 → Entry 84.60" and
 * "17 risers of 176 mm". An end that isn't on a floor reads as its RL.
 */
export function stairJoins(plan: Plan, s: Stair): { from: string; to: string; risers: string; joined: boolean } {
  const fromLevel = levelById(plan, s.level)
  const floor = plan.placement.ffl + (fromLevel?.elevation ?? 0)
  const bottom = floor + s.base
  const top = bottom + s.rise
  const to = stairTopLevel(plan, s)
  const onFloor = Math.abs(s.base) < 0.0005
  const L = stairLayout(s)
  return {
    from: onFloor && fromLevel ? `${fromLevel.name} ${rlText(bottom)}` : `RL ${rlText(bottom)}${fromLevel ? ` (${fromLevel.name})` : ''}`,
    to: to ? `${to.name} ${rlText(top)}` : `RL ${rlText(top)}`,
    risers: `${L.risers} risers of ${mm1(L.riser)} mm`,
    joined: !!to,
  }
}

/** The short tag on the plan: "17R to Entry" on its own level, "17R to Living" going down on the level it arrives at. */
export function stairPlanTag(plan: Plan, s: Stair, arriving: boolean): string {
  const n = stairLayout(s).risers
  const to = arriving ? levelById(plan, s.level) : stairTopLevel(plan, s)
  return to ? `${n}R to ${to.name}` : `${n}R`
}
