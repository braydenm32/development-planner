// Implied retaining walls: with the cut or fill slopes set to Retaining wall the earthworks stop in
// a vertical face at the edge of the levelled ground, and that face is a wall someone has to build,
// drawn or not. They're traced as the suggestions are (./suggest.ts, the 'implied' rule), shown
// dashed with their heights, and counted with the drawn walls in Retained (the strip), the engineer count
// and Costs, each labelled "implied" (the owner confirmed the counting).
//
// The step between two of the house's own pads (a split level's slab beside a lower one) is an
// implied wall too, whatever the slopes are set to: the earthworks stop each pad at the line
// between them (stepWalls in ./walls.ts).

import type { Survey } from '../lib/survey'
import type { Earth } from '../plan/useEarthworks'
import { needsEngineer } from '../checks/engineer'
import { pathLength, type WallSuggestion } from './suggest'
import { planImpliedWalls, stepWalls } from './walls'

/** The plan's implied walls: the steps between the house's pads, and the vertical edges its earthworks leave. */
export function impliedWalls(survey: Pick<Survey, 'boundary'>, earth: Earth | null): WallSuggestion[] {
  if (!earth || !earth.platforms.length) return []
  const steps = stepWalls(earth)
  const { cutBatter, fillBatter } = earth.prep.opts
  if (cutBatter > 0 && fillBatter > 0) return steps
  return [...steps, ...planImpliedWalls(survey, earth).filter(s => s.rule === 'implied')]
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

/** The implied walls together, or null when there are none. */
export function impliedTotals(walls: WallSuggestion[]): ImpliedTotals | null {
  if (!walls.length) return null
  return {
    count: walls.length,
    length: walls.reduce((t, w) => t + pathLength(w.path), 0),
    maxHeight: Math.max(...walls.map(w => w.height)),
    face: walls.reduce((t, w) => t + w.face, 0),
    engineer: walls.filter(w => needsEngineer(w.height)).length,
  }
}
