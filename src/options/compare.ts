// The rows of the Compare table: the words, the format, and which value is best. Pure, so the
// table's logic is tested without drawing it.

import { m2, netText } from '../shell/format'
import { money } from '../costs/format'
import { countsWords } from '../checks/rules'
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
  /** A list under the cell's text: the checks to fix, say. */
  list?: (n: OptionNumbers) => string[]
}

const m3 = (v: number) => `${v.toFixed(1)} m³`
const dash = '—'

export const ROWS: Row[] = [
  { id: 'floor-area', label: 'Floor area', text: n => (n.floorArea === null ? dash : m2(n.floorArea)), value: n => n.floorArea, best: 'none' },
  { id: 'ffl', label: 'Floor level (FFL)', text: n => `RL ${n.ffl.toFixed(2)}`, value: n => n.ffl, best: 'none' },
  {
    id: 'height',
    label: 'Building height',
    text: n => (n.height === null ? dash : `${n.height.toFixed(2)} m`),
    note: n => (n.height === null ? null : 'Above natural ground, as the checks measure it'),
    value: n => n.height,
    best: 'none',
  },
  {
    id: 'levels',
    label: 'Levels',
    text: n => (n.levels ? `${n.levels} level${n.levels === 1 ? '' : 's'}` : dash),
    note: n => (n.levels ? `${n.storeys} storey${n.storeys === 1 ? '' : 's'} as the rules count them` : null),
    value: n => n.levels,
    best: 'none',
  },
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
    note: n => pathwayText(n),
    // Fewest fails, then warnings, then what can't be told yet (a fact missing, or not drawn yet).
    value: n => n.checks.counts.fail * 1000 + n.checks.counts.warn * 100 + n.checks.counts.unknown + n.checks.counts.incomplete,
    best: 'low',
  },
  {
    id: 'to-fix',
    label: 'To fix',
    text: n => (n.checks.fix.length ? '' : 'Nothing'),
    list: n => n.checks.fix,
    value: n => n.checks.fix.length,
    best: 'none',
  },
  {
    id: 'to-confirm',
    label: 'To confirm',
    text: n => (n.checks.confirm.length ? '' : 'Nothing'),
    list: n => n.checks.confirm,
    value: n => n.checks.confirm.length,
    best: 'none',
  },
]

/** Whether a row says something different for any of the options: what "Differences only" keeps. */
export function differs(row: Row, nums: OptionNumbers[]): boolean {
  const say = (n: OptionNumbers) => JSON.stringify([row.text(n), row.note?.(n) ?? null, row.list?.(n) ?? null])
  return nums.some(n => say(n) !== say(nums[0]))
}

/** "1 to fix · 2 to confirm · 1 fact to add · 2 to remove · 9 OK": Design › Checks' own words. */
export const checksText = (n: OptionNumbers): string => countsWords(n.checks.counts).join(' · ')

/** What the checks were run against: "DA (Wollongong)", or "CDC (Housing Code)". */
export const pathwayText = (n: OptionNumbers): string => (n.checks.pathway === 'cdc' ? 'CDC (Housing Code)' : `DA (${n.checks.council ?? 'no council’s rules on'})`)

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
