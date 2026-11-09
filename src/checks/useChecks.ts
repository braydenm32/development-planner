import { useMemo } from 'react'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import type { Plan } from '../plan/model'
import type { Earth } from '../plan/useEarthworks'
import { useSunFacts } from '../sun/useSun'
import { measure, type MeasureInput, type Measures } from './measure'
import { countChecks, runChecks, type CheckCounts } from './rules'
import { useCheckTrees } from './siteTrees'
import { activeCouncil, type Council } from './councils'
import type { CheckResult, Pathway } from './types'
import { mapChecks } from '../map/checks'
import { useMap } from '../map/store'
import type { PlanningFacts } from '../map/planning'
import { useProjects } from '../projects/session'

export interface Checks {
  pathway: Pathway
  /** What the NSW planning maps say about the placed lot (Site › Map), if it's placed and read. */
  planning: PlanningFacts | null
  /** The council whose rules are on (for the DA checks), if any. */
  council: Council | null
  measures: Measures
  results: CheckResult[]
  counts: CheckCounts
}

/**
 * The checks for measures already taken, on the plan's own pathway unless another is asked for.
 * Design › Checks and Options › Compare both come through here, so they count the same rows.
 */
export function checksOf(measures: Measures, planning: PlanningFacts | null, pathway: Pathway = measures.settings.pathway): Checks {
  const council = activeCouncil(measures.settings)
  // The land's own flags (zone, heritage, hazards) come first: they decide whether the rest apply.
  const results = [...(planning ? mapChecks(planning, pathway) : []), ...runChecks(measures, pathway, council?.id ?? null)]
  return { pathway, council, planning, measures, results, counts: countChecks(results) }
}

/** Every check for a plan, outside React: give it the sun facts, planning maps and DEM flag the panel has. */
export function checksFor(input: MeasureInput & { planning?: PlanningFacts | null }): Checks {
  return checksOf(measure(input), input.planning ?? null)
}

/** Every check for the plan's chosen pathway, worked out again when the design changes. */
export function useChecks(plan: Plan, survey: Survey, terrain: Terrain, earth: Earth | null): Checks {
  const trees = useCheckTrees()
  const planning = useMap(s => s.place?.planning ?? null)
  // The sun waits for the design to settle (src/sun/useSun.ts), so it joins the rest afterwards.
  const sun = useSunFacts(plan, survey, terrain, earth)
  // Ground from the state's elevation data gives no survey level at the street boundary.
  const dem = !!useProjects().opened?.survey?.dem
  const base = useMemo(() => measure({ plan, survey, terrain, earth, trees, dem }), [plan, survey, terrain, earth, trees, dem])
  const measures = useMemo(() => ({ ...base, sun }), [base, sun])
  return useMemo(() => checksOf(measures, planning), [measures, planning])
}
