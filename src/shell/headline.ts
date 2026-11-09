// The headline numbers the phone's peek sheet, the Overview and the summary strip share beyond
// the drawing's own: the checks' verdict in Approvals › Checks' words (Fix, Confirm, OK, from
// src/checks/topics.ts), the estimate's total, and every floor level of a split-level house.
// Pure, so each place words them the same and the tests read them without drawing.

import { verdictOf, type Verdict, type Word } from '../checks/topics'
import type { CheckResult, Pathway } from '../checks/types'
import type { Estimate } from '../costs/estimate'

export interface ChecksHeadline {
  /** "DA" or "CDC": the approval route the checks are for. */
  name: 'DA' | 'CDC'
  /** The glossary's id for it. */
  term: 'da' | 'cdc'
  verdict: Verdict
  /** The worst word in the head: what colour it reads in. */
  word: Word
  /** "4 to fix · 5 to confirm", or "Nothing to fix". */
  head: string
  /** "12 OK · 2 facts to add". */
  rest: string
}

export function checksHeadline(pathway: Pathway, results: CheckResult[]): ChecksHeadline {
  const verdict = verdictOf(results)
  const name = pathway === 'cdc' ? 'CDC' : 'DA'
  return {
    name,
    term: pathway === 'cdc' ? 'cdc' : 'da',
    verdict,
    word: verdict.head[0]?.word ?? 'ok',
    head: verdict.head.map(h => h.text).join(' · '),
    rest: verdict.rest.join(' · '),
  }
}

export interface CostHeadline {
  /** False before there are walls to price. */
  ready: boolean
  total: number
  low: number
  high: number
  /** What the estimate has nothing for yet ("roof"); empty when complete. */
  missing: string[]
}

export const costHeadline = (e: Estimate): CostHeadline => ({ ready: e.ready, total: e.total, low: e.low, high: e.high, missing: e.missing })

/**
 * Every level's floor RL, lowest first: "RL 81.60" for one level, "81.60 / 84.60 / 86.10" for a
 * split-level house, so its other floors aren't hidden behind the lowest.
 */
export function floorsText(floors: { rl: number }[], ffl: number): string {
  if (floors.length < 2) return `RL ${(floors[0]?.rl ?? ffl).toFixed(2)}`
  return floors.map(f => f.rl.toFixed(2)).join(' / ')
}

/** "Floor level" or "Floor levels", as the plain label with the term after it. */
export const floorsLabel = (floors: unknown[]) => (floors.length > 1 ? 'Floor levels' : 'Floor level')

/** What Balance does, in words: which way the floor goes and how far. */
export function balanceWords(ffl: number, balanced: number | null): string {
  if (balanced === null) return 'Balance'
  const d = balanced - ffl
  // In metres, as every other length in the strip and the Overview is.
  return `Balance: ${d > 0 ? 'raise' : 'lower'} the floor ${Math.abs(d).toFixed(2)} m`
}
