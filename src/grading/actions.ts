// Add and Dismiss for a suggested retaining wall, from the plan or the panel.

import type { Survey } from '../lib/survey'
import type { Heightfield } from '../lib/terrain'
import type { Vec2 } from '../lib/geom'
import { wallLength, type Plan, type Wall } from '../plan/model'
import { retainingProfile } from '../plan/retaining'
import { usePlan } from '../plan/store'
import { earthFrom, earthInputs } from '../plan/useEarthworks'
import { showToast } from '../safety/store'
import type { WallSuggestion } from './suggest'
import { addSuggestedWall, dismissSuggestion } from './walls'

/**
 * What the toast says once a suggestion's walls are in: their height measured on the finished ground
 * worked out again with them in place (just as their panel and the strip measure it), not the
 * suggestion's estimate, and any return wall that came with it.
 */
export function addedText(plan: Plan, walls: Wall[], survey: Pick<Survey, 'origin' | 'boundary'>, natural: Heightfield | null): string {
  const main = walls.reduce((a, b) => (wallLength(b) > wallLength(a) ? b : a), walls[0])
  const returns = walls.filter(w => w !== main)
  const lengths = returns.map(w => `${wallLength(w).toFixed(1)} m`)
  const also = !returns.length ? '' : returns.length === 1 ? `, plus a ${lengths[0]} return` : `, plus returns of ${lengths.slice(0, -1).join(', ')} and ${lengths.at(-1)}`
  if (!natural) return `Retaining wall added there${also}. Select it to change it.`
  const ground = earthFrom(natural, survey.boundary, earthInputs(plan, survey)).result.grid
  const held = Math.max(...walls.map(w => retainingProfile(w, plan, survey.origin, ground).maxHeight))
  return `Retaining wall added there${also}, holding back up to ${held.toFixed(2)} m. Select it to change it.`
}

/** Add a suggested wall to the plan (one undo step), and say so. */
export function addSuggestion(s: WallSuggestion, survey: Pick<Survey, 'origin' | 'boundary'>, natural: Heightfield | null) {
  const st = usePlan.getState()
  if (!st.plan) return
  const { plan, walls } = addSuggestedWall(st.plan, s, survey.origin)
  st.commit(() => plan)
  const after = usePlan.getState().plan
  showToast({
    text: walls.length ? addedText(plan, walls, survey, natural) : 'Retaining wall added there. Select it to change it.',
    // Only while the wall is the last change, so Undo never takes back something else.
    undo: () => {
      if (usePlan.getState().plan === after) usePlan.getState().undo()
    },
  })
}

/** Turn a suggestion down (one undo step). */
export function dismissWall(s: WallSuggestion, origin: Vec2) {
  usePlan.getState().commit(p => dismissSuggestion(p, s, origin))
}
