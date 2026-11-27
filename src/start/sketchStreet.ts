// A sketch block's street side is part of the sketch: its width runs along the street and its
// fall goes back from it. So every place that sets the street side on a sketch (Site › Block,
// Approvals › Checks, Change size) changes this one setting, through Replace survey's review.

import { replaceSurvey } from '../safety/flows'
import { showToast } from '../safety/store'
import { sketchSurvey, type SketchBlock, type StreetSide } from './sketch'

/** Turn the sketch block so its street is on `street`, after the review; the plan's street side follows (src/safety/flows.ts). */
export function setSketchStreet(sketch: SketchBlock, street: StreetSide): void {
  if (street === sketch.street) return
  replaceSurvey(sketchSurvey({ ...sketch, street })).catch((e: unknown) => showToast({ text: (e as Error)?.message || 'The sketch block couldn’t be changed.' }))
}
