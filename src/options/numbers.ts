// One option's numbers for the Compare table. Each comes from the same helper the summary strip,
// the earthworks panels, Costs and Checks use, so the table can't disagree with the rest of
// the app (CALM 8): the only new thing here is that it runs them for a plan that isn't open.

import type { CheckCounts } from '../checks/rules'
import type { CheckTree, Pathway } from '../checks/types'
import { checksFor } from '../checks/useChecks'
import { estimate } from '../costs/estimate'
import type { CostsData } from '../costs/model'
import type { PlanningFacts } from '../map/planning'
import { retainingProfiles } from '../plan/retaining'
import { levelSummaries } from '../plan/keyNumbers'
import { floorRL, type Plan } from '../plan/model'
import { designQuantities } from '../plan/quantities'
import { earthFrom, earthInputs, type Earth } from '../plan/useEarthworks'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { keptSunFacts, winterDay, type SunFacts } from '../sun/facts'
import { groundFor } from '../sun/useSun'

export interface OptionNumbers {
  /** m², every floor to the outside of its walls; null before any walls enclose one. */
  floorArea: number | null
  /** RL of the ground floor. */
  ffl: number
  /** Null until something is levelled (no cut and fill to show). */
  earth: { cut: number; fill: number; net: number; deepestCut: number; deepestFill: number } | null
  /** Metres of retaining wall; null with none. */
  retainingLength: number | null
  cost: { total: number; low: number; high: number; /** Some of what it needs isn't drawn yet. */ incomplete: boolean }
  /** The counts Design › Checks shows, and what they were checked against: the pathway, and the council on a DA. */
  checks: { counts: CheckCounts; pathway: Pathway; council: string | null }
}

/** What Design › Checks knows besides the plan: the planning maps' facts, and whether the ground is the state's elevation data. */
export interface CheckContext {
  planning?: PlanningFacts | null
  dem?: boolean
  /** The sun facts, when they're already worked out; otherwise they're worked out here as the Checks panel does. */
  sun?: SunFacts | null
}

/** What the estimate says it still lacks: any line with a `missing` note. */
export const isIncomplete = (lines: { missing: string | null }[]) => lines.some(l => l.missing)

/** Cut and fill for a plan on this survey, as the open plan's are worked out. */
export function earthOfPlan(plan: Plan, survey: Survey, terrain: Terrain): Earth {
  return earthFrom(terrain.grid, survey.boundary, earthInputs(plan, survey))
}

export function optionNumbers(
  plan: Plan,
  survey: Survey,
  terrain: Terrain,
  costs: CostsData,
  trees: CheckTree[],
  earth: Earth = earthOfPlan(plan, survey, terrain),
  ctx: CheckContext = {},
): OptionNumbers {
  const total = levelSummaries(plan).reduce((t, l) => t + l.gross.area, 0)
  const r = earth.platforms.length > 0 ? earth.result : null
  const walls = retainingProfiles(plan, survey.origin, earth.result.grid ?? terrain.grid)
  const est = estimate(designQuantities(plan, r, walls), costs)
  // The inputs the Checks panel gives its checks, so the sun and the planning maps' rows are counted here too.
  const sun = ctx.sun ?? keptSunFacts({ plan, boundary: survey.boundary, origin: survey.origin, ground: groundFor(terrain, earth), date: winterDay() })
  const c = checksFor({ plan, survey, terrain, earth, trees, sun, dem: ctx.dem ?? false, planning: ctx.planning ?? null })
  return {
    floorArea: total > 0 ? total : null,
    ffl: floorRL(plan),
    earth: r ? { cut: r.cut, fill: r.fill, net: r.cut - r.fill, deepestCut: r.maxCut, deepestFill: r.maxFill } : null,
    retainingLength: walls.length ? walls.reduce((t, w) => t + w.length, 0) : null,
    cost: { total: est.total, low: est.low, high: est.high, incomplete: isIncomplete(est.lines) },
    checks: { counts: c.counts, pathway: c.pathway, council: c.pathway === 'da' ? (c.council?.name ?? null) : null },
  }
}
