import { useMemo } from 'react'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import type { Plan } from '../plan/model'
import type { Earth } from '../plan/useEarthworks'
import { useSunFacts } from '../sun/useSun'
import { measure, type Measures } from './measure'
import { countChecks, runChecks, type CheckCounts } from './rules'
import { useCheckTrees } from './siteTrees'
import { activeCouncil, type Council } from './councils'
import type { CheckResult, Pathway } from './types'
import { mapChecks } from '../map/checks'
import { useMap } from '../map/store'
import type { PlanningFacts } from '../map/planning'

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

/** Every check for the plan's chosen pathway, worked out again when the design changes. */
export function useChecks(plan: Plan, survey: Survey, terrain: Terrain, earth: Earth | null): Checks {
  const trees = useCheckTrees()
  const planning = useMap(s => s.place?.planning ?? null)
  // The sun waits for the design to settle (src/sun/useSun.ts), so it joins the rest afterwards.
  const sun = useSunFacts(plan, survey, terrain, earth)
  const base = useMemo(() => measure({ plan, survey, terrain, earth, trees }), [plan, survey, terrain, earth, trees])
  const measures = useMemo(() => ({ ...base, sun }), [base, sun])
  return useMemo(() => {
    const pathway = measures.settings.pathway
    const council = activeCouncil(measures.settings)
    // The land's own flags (zone, heritage, hazards) come first: they decide whether the rest apply.
    const results = [...(planning ? mapChecks(planning, pathway) : []), ...runChecks(measures, pathway, council?.id ?? null)]
    return { pathway, council, planning, measures, results, counts: countChecks(results) }
  }, [measures, planning])
}
