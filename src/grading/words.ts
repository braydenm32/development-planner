// Words and small helpers the Cut & fill panel shares: a slope as a ratio with its angle, which
// side a wall runs along, and the suggested walls as the panel lists them.

import { useCheckTrees } from '../checks/siteTrees'
import type { Survey } from '../lib/survey'
import { bearingName } from '../lib/terrain'
import type { Plan } from '../plan/model'
import type { Earth } from '../plan/useEarthworks'
import type { WallSuggestion } from './suggest'
import { planWallSuggestions } from './walls'

/** A batter's slope in words, with its angle: "1 in 2 (27°)". 0 is no batter: a retaining wall. */
export function batterLabel(b: number): string {
  if (b <= 0) return 'Retaining wall (vertical)'
  const deg = Math.round((Math.atan(1 / b) * 180) / Math.PI)
  return `1 in ${b} (${deg}°)`
}

/** The slopes offered, steepest first, then a wall. */
export const BATTER_CHOICES = [1, 1.5, 2, 3, 4, 0]

/** Which side of the levelled ground a wall runs along, by compass: outward, to the right of a→b (site frame). */
export function sideOf(s: Pick<WallSuggestion, 'a' | 'b'>): string {
  const dx = s.b[0] - s.a[0]
  const dy = s.b[1] - s.a[1]
  // Outward is (dy, -dx); its bearing from north is atan2(east, north).
  return bearingName(((Math.atan2(dy, -dx) * 180) / Math.PI + 360) % 360)
}

/** The suggested walls, less the implied ones (those show with the warnings). */
export function useSuggestions(plan: Plan, survey: Survey, earth: Earth | null): WallSuggestion[] {
  const trees = useCheckTrees()
  return planWallSuggestions(plan, survey, earth, trees).filter(s => s.rule !== 'implied')
}
