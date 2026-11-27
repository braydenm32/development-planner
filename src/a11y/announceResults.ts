// The results that changed after an edit, said to screen readers once they hold still. The shell
// has the numbers (src/shell/AppShell.tsx) and calls this with them.

import { useEffect, useRef } from 'react'
import { announce, resultsWords, type ResultFacts } from './announce'

/** How long the results must hold still before they are said, so a drag isn't a running commentary (ms). */
const SETTLE_MS = 800

/**
 * Says the results that changed after an edit: the checks' verdict, the cut and fill going out of
 * balance or back, earth slopes crossing a boundary, the site's own checks. `scope` is the
 * project: another one opening starts afresh and says nothing.
 */
export function useAnnounceResults(facts: ResultFacts | null, scope: string) {
  const said = useRef<{ scope: string; facts: ResultFacts } | null>(null)
  const key = facts ? JSON.stringify(facts) : ''
  useEffect(() => {
    if (!key) return
    const now = JSON.parse(key) as ResultFacts
    if (!said.current || said.current.scope !== scope) {
      said.current = { scope, facts: now }
      return
    }
    const t = setTimeout(() => {
      const words = resultsWords(said.current!.facts, now)
      said.current = { scope, facts: now }
      if (words) announce(words)
    }, SETTLE_MS)
    return () => clearTimeout(t)
  }, [key, scope])
}
