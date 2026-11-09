// How Design › Checks lays the results out: three words for what to do (Fix, Confirm, OK, with
// facts to add and parts not drawn yet beside them), the rows grouped by topic with each group's
// worst first, passes folded to a count, and a number for every row to fix or confirm that has a
// place on the plan. Pure, so the layout is tested without drawing it.

import { isDriveCheck } from './crossing'
import type { CheckResult, CheckStatus } from './types'

/** What a result asks of you, in the panel's words. */
export type Word = 'fix' | 'confirm' | 'fact' | 'draw' | 'remove' | 'ok' | 'info'

export const WORD_OF: Record<CheckStatus, Word> = { fail: 'fix', warn: 'confirm', unknown: 'fact', incomplete: 'draw', pending: 'remove', pass: 'ok', info: 'info' }

/** The badge on a row. */
export const WORD_TEXT: Record<Word, string> = { fix: 'Fix', confirm: 'Confirm', fact: 'Add a fact', draw: 'Not drawn yet', remove: 'To remove', ok: 'OK', info: 'For info' }

/** Worst first. */
const RANK: Word[] = ['fix', 'confirm', 'fact', 'draw', 'remove', 'ok', 'info']
export const rankOf = (w: Word) => RANK.indexOf(w)

/** Rows a group shows open; the rest fold into its count line. */
const LOUD: Word[] = ['fix', 'confirm', 'fact']
export const isLoud = (r: CheckResult) => LOUD.includes(WORD_OF[r.status])

export type TopicId = 'land' | 'size' | 'setbacks' | 'earth' | 'trees' | 'sun' | 'driveway'

/** The topics, in the order they list when nothing in them needs doing. */
export const TOPICS: { id: TopicId; title: string }[] = [
  { id: 'land', title: 'Zone & land' },
  { id: 'size', title: 'Building size & height' },
  { id: 'setbacks', title: 'Setbacks' },
  { id: 'earth', title: 'Earthworks & walls' },
  { id: 'trees', title: 'Trees' },
  { id: 'sun', title: 'Sun & neighbours' },
  { id: 'driveway', title: 'Driveway' },
]

const SETBACKS = ['lot-inside', 'hc-front', 'hc-side', 'hc-rear', 'da-front', 'da-side-rear', 'da-side', 'da-rear', 'da-rear-upper']
const EARTH = ['hc-cut', 'hc-fill', 'hc-works-boundary', 'hc-retaining', 'hc-retaining-gap', 'da-batters', 'da-cut-fill', 'da-geotech', 'da-erosion', 'da-retaining']
const SUN = ['sun-living', 'da-sun-neighbours', 'da-shadow-diagrams']

/** The topic a result is listed under. Anything new lands under Building size & height until it's given one. */
export function topicOf(id: string): TopicId {
  if (id.startsWith('map:') || id === 'hc-lot-shape') return 'land'
  if (id.startsWith('tree:')) return 'trees'
  if (isDriveCheck(id)) return 'driveway'
  if (SUN.includes(id)) return 'sun'
  if (SETBACKS.includes(id)) return 'setbacks'
  if (EARTH.includes(id)) return 'earth'
  return 'size'
}

export interface Group {
  id: TopicId
  title: string
  /** Worst first; rows of the same word keep the rules' own order. */
  rows: CheckResult[]
  /** The group's worst word. */
  worst: Word
  /** How many rows of each word. */
  counts: Partial<Record<Word, number>>
  /** Every row waits for a driveway: the group shows as one line with a Draw a driveway button. */
  undrawn: boolean
}

/** The results grouped by topic, the groups with something to fix first. */
export function groupChecks(results: CheckResult[]): Group[] {
  const groups = TOPICS.map(t => {
    const rows = results
      .filter(r => topicOf(r.id) === t.id)
      .map((r, i) => ({ r, i }))
      .sort((a, b) => rankOf(WORD_OF[a.r.status]) - rankOf(WORD_OF[b.r.status]) || a.i - b.i)
      .map(x => x.r)
    const counts: Partial<Record<Word, number>> = {}
    for (const r of rows) counts[WORD_OF[r.status]] = (counts[WORD_OF[r.status]] ?? 0) + 1
    const worst = rows.length ? WORD_OF[rows[0].status] : 'ok'
    return { id: t.id, title: t.title, rows, worst, counts, undrawn: t.id === 'driveway' && rows.length > 0 && rows.every(r => r.status === 'incomplete') }
  }).filter(g => g.rows.length > 0)
  return groups.map((g, i) => ({ g, i })).sort((a, b) => rankOf(a.g.worst) - rankOf(b.g.worst) || a.i - b.i).map(x => x.g)
}

/**
 * The number each row to fix or confirm gets, in the order the panel lists them, for its pin on
 * the plan. Only rows with a place on the plan (`placed`) are numbered, so the numbers run 1, 2, 3
 * on the plan with no gaps.
 */
export function pinNumbers(groups: Group[], placed: (r: CheckResult) => boolean): Map<string, number> {
  const out = new Map<string, number>()
  for (const g of groups) for (const r of g.rows) if ((r.status === 'fail' || r.status === 'warn') && placed(r)) out.set(r.id, out.size + 1)
  return out
}

/** A group's badges, worst first: "Fix 2", "Confirm 1", "1 fact", "5 OK". */
export function groupBadges(g: Group): { word: Word; text: string }[] {
  const n = g.counts
  const out: { word: Word; text: string }[] = []
  if (g.undrawn) return [{ word: 'draw', text: 'Not drawn yet' }]
  if (n.fix) out.push({ word: 'fix', text: `Fix ${n.fix}` })
  if (n.confirm) out.push({ word: 'confirm', text: `Confirm ${n.confirm}` })
  if (n.fact) out.push({ word: 'fact', text: `${n.fact} fact${n.fact > 1 ? 's' : ''}` })
  if (n.draw) out.push({ word: 'draw', text: `${n.draw} not drawn` })
  if (n.remove) out.push({ word: 'remove', text: `${n.remove} to remove` })
  // The OKs count in the header only when there is nothing louder; otherwise the fold line under the rows says them.
  if (n.ok && !n.fix && !n.confirm) out.push({ word: 'ok', text: `${n.ok} OK` })
  if (!out.length && n.info) out.push({ word: 'info', text: 'For info' })
  return out
}

/** The folded rows' count line: "+ 3 OK · 2 to remove · 1 for info". */
export function foldedText(rows: CheckResult[]): string {
  const n: Partial<Record<Word, number>> = {}
  for (const r of rows) n[WORD_OF[r.status]] = (n[WORD_OF[r.status]] ?? 0) + 1
  const parts = [n.ok && `${n.ok} OK`, n.draw && `${n.draw} not drawn yet`, n.remove && `${n.remove} to remove`, n.info && `${n.info} for info`].filter(Boolean)
  return `+ ${parts.join(' · ')}`
}

export interface Verdict {
  /** The big line's parts: "4 to fix", "5 to confirm"; or one part when there's nothing to do. */
  head: { word: Word; text: string }[]
  /** The rest: "12 OK · 2 facts to add · 5 wait for a driveway". */
  rest: string[]
}

/** The card at the top of Checks: what to do, then everything else counted. */
export function verdictOf(results: CheckResult[]): Verdict {
  const count = (s: CheckStatus, f: (r: CheckResult) => boolean = () => true) => results.filter(r => r.status === s && f(r)).length
  const fix = count('fail')
  const confirm = count('warn')
  const facts = count('unknown')
  const waitDrive = count('incomplete', r => isDriveCheck(r.id))
  const waitOther = count('incomplete', r => !isDriveCheck(r.id))
  const head: Verdict['head'] = []
  if (fix) head.push({ word: 'fix', text: `${fix} to fix` })
  if (confirm) head.push({ word: 'confirm', text: `${confirm} to confirm` })
  if (!head.length) head.push(results.length === 0 ? { word: 'info', text: 'No checks yet' } : facts || waitOther ? { word: 'ok', text: 'Nothing to fix so far' } : { word: 'ok', text: 'Nothing to fix' })
  const rest = [
    `${count('pass')} OK`,
    facts ? `${facts} fact${facts > 1 ? 's' : ''} to add` : '',
    waitOther ? `${waitOther} not drawn yet` : '',
    waitDrive ? `${waitDrive} wait for a driveway` : '',
    count('pending') ? `${count('pending')} to remove` : '',
    count('info') ? `${count('info')} for info` : '',
  ].filter(Boolean)
  return { head, rest }
}
