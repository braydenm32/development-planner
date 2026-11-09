import { useMemo } from 'react'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import type { Plan } from '../plan/model'
import type { Earth } from '../plan/useEarthworks'
import { measure, type Measures } from './measure'
import { countChecks, runChecks, type CheckCounts } from './rules'
import { useCheckTrees } from './siteTrees'
import { activeCouncil, type Council } from './councils'
import type { CheckResult, Pathway } from './types'

export interface Checks {
  pathway: Pathway
  /** The council whose rules are on (for the DA checks), if any. */
  council: Council | null
  measures: Measures
  results: CheckResult[]
  counts: CheckCounts
}

/** Every check for the plan's chosen pathway, worked out again when the design changes. */
export function useChecks(plan: Plan, survey: Survey, terrain: Terrain, earth: Earth | null): Checks {
  const trees = useCheckTrees()
  const measures = useMemo(() => measure({ plan, survey, terrain, earth, trees }), [plan, survey, terrain, earth, trees])
  return useMemo(() => {
    const pathway = measures.settings.pathway
    const council = activeCouncil(measures.settings)
    const results = runChecks(measures, pathway, council?.id ?? null)
    return { pathway, council, measures, results, counts: countChecks(results) }
  }, [measures])
}
