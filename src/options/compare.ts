// The rows of the Compare table: the words, the format, and which value is best. Pure, so the
// table's logic is tested without drawing it.

import { m2, netText } from '../shell/format'
import { money } from '../costs/format'
import type { OptionNumbers } from './numbers'

export interface Row {
  id: string
  label: string
  /** The cell's text for an option. */
  text: (n: OptionNumbers) => string
  /** A smaller second line (a range, or what the number means). */
  note?: (n: OptionNumbers) => string | null
  /** The number that is compared; null when the option has none, which never wins. */
  value: (n: OptionNumbers) => number | null
  /** Which end is better. 'none': a different number, not a better one (FFL, say). */
  best: 'low' | 'high' | 'none'
  /** An option this can't be fairly compared for (an estimate with gaps). */
  skip?: (n: OptionNumbers) => boolean
}

const m3 = (v: number) => `${v.toFixed(1)} m³`
const dash = '—'

export const ROWS: Row[] = [
  { id: 'floor-area', label: 'Floor area', text: n => (n.floorArea === null ? dash : m2(n.floorArea)), value: n => n.floorArea, best: 'none' },
  { id: 'ffl', label: 'Floor level (FFL)', text: n => `RL ${n.ffl.toFixed(2)}`, value: n => n.ffl, best: 'none' },
  { id: 'cut', label: 'Cut', text: n => (n.earth ? m3(n.earth.cut) : dash), value: n => n.earth?.cut ?? null, best: 'low' },
  { id: 'fill', label: 'Fill', text: n => (n.earth ? m3(n.earth.fill) : dash), value: n => n.earth?.fill ?? null, best: 'low' },
  {
    id: 'net',
    label: 'Left over',
    text: n => (n.earth ? netText(n.earth.net) : dash),
    // Closest to nothing left over, either way.
    value: n => (n.earth ? Math.abs(n.earth.net) : null),
    best: 'low',
  },
  { id: 'deepest-cut', label: 'Deepest cut', text: n => (n.earth ? `${n.earth.deepestCut.toFixed(2)} m` : dash), value: n => n.earth?.deepestCut ?? null, best: 'low' },
  { id: 'deepest-fill', label: 'Highest fill', text: n => (n.earth ? `${n.earth.deepestFill.toFixed(2)} m` : dash), value: n => n.earth?.deepestFill ?? null, best: 'low' },
  { id: 'retaining', label: 'Retaining walls', text: n => (n.retainingLength === null ? 'None' : `${n.retainingLength.toFixed(1)} m`), value: n => n.retainingLength ?? 0, best: 'low' },
  {
    id: 'cost',
    label: 'Estimated cost',
    text: n => money(n.cost.total),
    note: n => (n.cost.incomplete ? 'Incomplete: some of it isn’t drawn yet' : `${money(n.cost.low)} to ${money(n.cost.high)}`),
    value: n => n.cost.total,
    best: 'low',
    // An estimate with gaps is cheap only because it leaves things out.
    skip: n => n.cost.incomplete,
  },
  {
    id: 'checks',
    label: 'Checks',
    text: n => checksText(n),
    value: n => n.checks.counts.fail * 1000 + n.checks.counts.warn * 100 + n.checks.counts.unknown,
    best: 'low',
  },
]

/** "9 pass · 1 fail · 2 to check · 1 can’t tell yet" (the summary strip's words for each). */
export function checksText(n: OptionNumbers): string {
  const c = n.checks.counts
  const cant = c.unknown + c.pending
  return [`${c.pass} pass`, c.fail ? `${c.fail} fail${c.fail > 1 ? 's' : ''}` : null, c.warn ? `${c.warn} to check` : null, cant ? `${cant} can’t tell yet` : null].filter(Boolean).join(' · ')
}

/**
 * Which options hold the best value in a row. Nothing is marked when the row has no better
 * end, when fewer than two options have a number, or when they all tie.
 */
export function bestIn(row: Row, nums: OptionNumbers[]): boolean[] {
  const none = nums.map(() => false)
  if (row.best === 'none') return none
  const vals = nums.map(n => (row.skip?.(n) ? null : row.value(n)))
  const have = vals.filter((v): v is number => v !== null)
  if (have.length < 2) return none
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a))
  const top = row.best === 'low' ? Math.min(...have) : Math.max(...have)
  if (have.every(v => eq(v, top))) return none
  return vals.map(v => v !== null && eq(v, top))
}
