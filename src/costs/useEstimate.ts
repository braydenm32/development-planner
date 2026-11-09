import { useMemo, useSyncExternalStore } from 'react'
import { useRetainingWalls } from '../components/planNumbers'
import { impliedTotals, impliedWalls } from '../grading/implied'
import { designQuantities, type DesignQuantities } from '../plan/quantities'
import type { Loaded } from '../shell/useSite'
import { estimate, type Estimate } from './estimate'
import { feeContextOf, type FeeContext } from './govFees'
import { useCosts } from './store'

/** The design's quantities, from the same helpers as the panels that show them. */
export function useQuantities(d: Loaded): DesignQuantities {
  // Retaining walls against the finished ground, as Earthworks › Retaining walls measures them.
  const walls = useRetainingWalls(d.plan, d.survey, d.terrain, d.earth)
  // Cut and fill only once something is levelled, as the strip shows them.
  const earth = d.earth && d.earth.platforms.length > 0 ? d.earth.result : null
  // With them, the walls the cut and fill imply, while those are counted (src/grading/implied.ts).
  const implied = useMemo(() => impliedTotals(impliedWalls(d.survey, d.earth)), [d.survey, d.earth])
  return useMemo(() => designQuantities(d.plan, earth, walls, implied), [d.plan, earth, walls, implied])
}

/** The council and pathway the council and government fees go by (Design › Checks). */
export function useFeeContext(d: Loaded): FeeContext {
  const checks = d.plan.checks
  return useMemo(() => feeContextOf({ checks }), [checks])
}

/** The open project's estimate. */
export function useEstimate(d: Loaded): Estimate {
  const q = useQuantities(d)
  const fees = useFeeContext(d)
  const data = useCosts(s => s.data)
  return useMemo(() => estimate(q, data, fees), [q, data, fees])
}

/** Wide enough for the materials card beside the plan (px of window). */
export const ASIDE_MIN_WIDTH = 1300

const wideQuery = `(min-width: ${ASIDE_MIN_WIDTH}px)`

/** Whether the window is wide enough for the estimate's materials card beside the plan. */
export function useWideForAside(): boolean {
  return useSyncExternalStore(
    cb => {
      const m = typeof matchMedia === 'function' ? matchMedia(wideQuery) : null
      m?.addEventListener('change', cb)
      return () => m?.removeEventListener('change', cb)
    },
    () => (typeof matchMedia === 'function' ? matchMedia(wideQuery).matches : true),
    () => true,
  )
}
