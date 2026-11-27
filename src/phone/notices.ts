// The plan's messages ("Click on a wall to place it", "Removed. Undo brings it back") show in the
// status line at the plan's foot, which a phone has no room for. There they go to the shell's
// toast instead, reworded for a finger (PH-11).

import { useEffect } from 'react'
import { usePlan } from '../plan/store'
import { useSiteStore } from '../site/store'
import { touchWords } from './words'

/** How long a notice stays before the same one can be said again (ms): the toast's own life. */
export const NOTICE_MS = 5000

/**
 * Sends each new plan or site notice to `say`. A notice is dropped from its store once it has
 * been shown, so the same slip (another tap on empty ground) says it again.
 */
export function watchNotices(say: (text: string) => void, ms = NOTICE_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const show = (text: string, drop: () => void) => {
    say(touchWords(text))
    clearTimeout(timer)
    timer = setTimeout(drop, ms)
  }
  const offPlan = usePlan.subscribe((s, prev) => {
    const text = s.notice
    if (!text || text === prev.notice) return
    show(text, () => usePlan.getState().notice === text && usePlan.getState().notify(null))
  })
  const offSite = useSiteStore.subscribe((s, prev) => {
    const text = s.notice
    // Site's notices show only while its tab or one of its tools has the plan, as on a computer.
    if (!text || text === prev.notice || !(s.tool || s.focus)) return
    show(text, () => useSiteStore.getState().notice === text && useSiteStore.getState().notify(null))
  })
  return () => {
    offPlan()
    offSite()
    clearTimeout(timer)
  }
}

export function usePlanNotices(on: boolean, say: (text: string) => void) {
  useEffect(() => (on ? watchNotices(say) : undefined), [on, say])
}
