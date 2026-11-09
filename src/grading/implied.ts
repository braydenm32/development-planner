// Implied retaining walls: with the cut or fill slopes set to Retaining wall the earthworks stop in
// a vertical face at the edge of the levelled ground, and that face is a wall someone has to build,
// drawn or not. They're traced as the suggestions are (./suggest.ts, the 'implied' rule), shown
// dashed with their heights, and counted with the drawn walls in Tallest wall, the engineer count
// and Costs, each labelled "implied".

import type { Survey } from '../lib/survey'
import type { Earth } from '../plan/useEarthworks'
import { needsEngineer } from '../checks/engineer'
import { pathLength, type WallSuggestion } from './suggest'
import { planImpliedWalls } from './walls'

/**
 * Whether implied walls count in Tallest wall, the engineer count and Costs. The one switch: the
 * owner is still to confirm the counting. Off, they still show on the plan and in Cut & fill.
 */
export const COUNT_IMPLIED_WALLS = true

/** The plan's implied walls: the vertical edges its earthworks leave. */
export function impliedWalls(survey: Pick<Survey, 'boundary'>, earth: Earth | null): WallSuggestion[] {
  if (!earth || !earth.platforms.length) return []
  const { cutBatter, fillBatter } = earth.prep.opts
  if (cutBatter > 0 && fillBatter > 0) return []
  return planImpliedWalls(survey, earth).filter(s => s.rule === 'implied')
}

export interface ImpliedTotals {
  count: number
  length: number
  /** The most any holds back (m). */
  maxHeight: number
  /** Their face, ground to ground (m²). */
  face: number
  engineer: number
}

/** The implied walls together, or null when there are none (or they aren't counted). */
export function impliedTotals(walls: WallSuggestion[], counted = COUNT_IMPLIED_WALLS): ImpliedTotals | null {
  if (!counted || !walls.length) return null
  return {
    count: walls.length,
    length: walls.reduce((t, w) => t + pathLength(w.path), 0),
    maxHeight: Math.max(...walls.map(w => w.height)),
    face: walls.reduce((t, w) => t + w.face, 0),
    engineer: walls.filter(w => needsEngineer(w.height)).length,
  }
}
