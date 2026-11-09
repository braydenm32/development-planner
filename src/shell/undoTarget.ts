// Whose history the top bar's Undo and Redo (and ⌘Z) work on. The plan, the site features and the
// costs each keep their own. While Costs or Site › Features is open, it's theirs. Elsewhere it's
// whichever history changed last, so a change made from another screen (marking a tree for
// removal from Approvals › Checks writes to the site features) is undone where it was made, not
// skipped over for the plan's. A file change just made (Replace survey, src/safety/fileUndo.ts)
// comes before them all, until anything else changes.

import { useCosts } from '../costs/store'
import { usePlan } from '../plan/store'
import { useSiteStore } from '../site/store'
import { fileStepNow, undoFileStep } from '../safety/fileUndo'

type Kind = 'plan' | 'site'

interface History {
  past: unknown[]
  future: unknown[]
  undo: () => void
  redo: () => void
}

let last: Kind = 'plan'

// Any step, done or undone, on either history makes it the last one changed.
usePlan.subscribe((s, prev) => {
  if (s.past !== prev.past || s.future !== prev.future) last = 'plan'
})
useSiteStore.subscribe((s, prev) => {
  if (s.past !== prev.past || s.future !== prev.future) last = 'site'
})

const store = (k: Kind): History => (k === 'site' ? useSiteStore.getState() : usePlan.getState())

/** The history Undo (or Redo) works on now. A history with nothing to take back gives way to the plan's. */
export function undoTarget(which: 'undo' | 'redo' = 'undo'): History {
  const file = which === 'undo' ? fileStepNow() : null
  if (file) return { past: [file], future: [], undo: () => void undoFileStep(), redo: () => {} }
  const costs = useCosts.getState()
  if (costs.focus) return costs
  const site = useSiteStore.getState()
  if (site.focus) return site
  const h = store(last)
  return (which === 'undo' ? h.past : h.future).length ? h : usePlan.getState()
}
