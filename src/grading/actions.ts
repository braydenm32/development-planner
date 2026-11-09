// Add and Dismiss for a suggested retaining wall, from the plan or the panel.

import type { Vec2 } from '../lib/geom'
import { usePlan } from '../plan/store'
import { showToast } from '../safety/store'
import { wallText, type WallSuggestion } from './suggest'
import { addSuggestedWall, dismissSuggestion } from './walls'

/** Add a suggested wall to the plan (one undo step), and say so. */
export function addSuggestion(s: WallSuggestion, origin: Vec2) {
  const st = usePlan.getState()
  if (!st.plan) return
  const { plan } = addSuggestedWall(st.plan, s, origin)
  st.commit(() => plan)
  const after = usePlan.getState().plan
  showToast({
    text: `Retaining wall added there, holding up to about ${wallText(s.height)}. Select it to change it.`,
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

