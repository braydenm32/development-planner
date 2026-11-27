// How costs read: quantities as the panel they come from shows them, and the estimate as a CSV
// file for a spreadsheet.
//
// Money is written one of two ways, by this rule (LD-27, AX-35):
// - In the estimate's own working (Costs: its headline, lines, totals, quotes and rates, and the
//   CSV) amounts are whole dollars with thousands commas, `money`, so the lines add up by hand.
// - Wherever a total is quoted at a glance (the strip in every area, Costs' own included, the
//   Overview, the phone's sheet, Check everything, and the cross-check's range) it is rounded to
//   three figures, `shortMoney`: "$561k", "$1.06M". A hover on the Costs strip gives the dollars.

import { CAVEAT_LINE } from '../legal/caveat'
import { areaById } from '../nav/menu'
import type { CostLine, Estimate } from './estimate'
import { CHOICES, FINISH_GUIDE_SOURCE, finishGuide, NOT_COUNTED, type Unit } from './rates'

const commas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** "$205,934"; a negative amount with a true minus sign. */
export function money(n: number): string {
  const r = Math.round(n)
  return `${r < 0 ? '−' : ''}$${commas(Math.abs(r))}`
}

/** A total in a few figures, to set two side by side: "$660k", "$1.07M", "$8,450" under $10,000. */
export function shortMoney(n: number): string {
  const a = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (a >= 999_500) return `${sign}$${Number((a / 1e6).toPrecision(3))}M`
  if (a >= 10_000) return `${sign}$${Math.round(a / 1000)}k`
  return money(n)
}

/** "+$2,218" or "−$3,812": what a choice adds or saves. */
export const delta = (n: number) => (Math.round(n) >= 0 ? `+${money(n)}` : money(n))

/** A rate: "$750/m²", "$1,600 each", "$9,500". */
export function rateText(rate: number, unit: Unit): string {
  if (unit === 'item') return money(rate)
  if (unit === 'each' || unit === 'room') return `${money(rate)} ${unit === 'room' ? 'a room' : 'each'}`
  return `${money(rate)}/${unit === 'm² face' ? 'm²' : unit}`
}

/** A quantity: "11.20 m²", "226.0 m³", "3 each"; empty for a lump sum. */
export function qtyText(l: Pick<CostLine, 'qty' | 'unit' | 'dp'>): string {
  if (l.unit === 'item') return ''
  const n = l.qty.toFixed(l.dp)
  if (l.unit === 'each') return `${n} each`
  if (l.unit === 'room') return `${n} ${l.qty === 1 ? 'room' : 'rooms'}`
  return `${n} ${l.unit}`
}

/** A quote's date, as "8 Nov 2026". */
export function dateText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? ''} ${m[1]}`
}

/** One CSV field: quoted when it has a comma, quote mark or line break. */
const field = (v: string | number) => {
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const dollars = (n: number) => String(Math.round(n))

/** What the total leaves out because it isn't drawn: "Incomplete: no roof, no windows". Empty when nothing is. */
export const incompleteText = (missing: string[]) => (missing.length ? `Incomplete: ${missing.map(m => `no ${m}`).join(', ')}` : '')

/** Before there are outside walls, in place of a total. */
export const NO_TOTAL = 'Draw the house’s outside walls to start the estimate.'

const pct = (x: number) => `${Number((x * 100).toFixed(1))}%`

/** The finish picked, as the choices name it: "Mid". */
export const finishName = (e: Pick<Estimate, 'finish'>) => CHOICES.finish.options.find(o => o.id === e.finish)?.label ?? 'Mid'

/** The cross-check for a complete estimate, in a sentence: where it sits against the guide and what to make of it. */
export function crossCheckText(e: Estimate): string {
  if (e.against === null || e.housePerM2 === null) return ''
  const g = finishGuide(e.finish)
  const house = `${money(e.housePerM2)} per m² for the house itself`
  const band = `${money(g.low)} to ${money(g.high)}`
  const guide = `RLB’s 2026 guide for one-off houses in Sydney at a ${finishName(e).toLowerCase()} finish`
  const owner = e.who === 'owner' ? ' The guide has a builder’s margin in it.' : ''
  if (e.against === 'under')
    return `Treat the estimate as a floor, not a budget. It prices what’s drawn at rough trade rates: ${house}, against ${band} in ${guide}. Project-home builders often land nearer the estimate.${owner}`
  if (e.against === 'over') return `The estimate comes to ${house}, over ${guide} (${band}). Check the rates and quotes for anything unusual.${owner}`
  return `The estimate comes to ${house}, within ${guide} (${band}).${owner}`
}

export interface BridgeStep {
  label: string
  /** What the step stands for, in a line. */
  note: string
  /** Whole dollars. */
  amount: number
}

/**
 * The bridge from an estimate up to the low end of the guide over it, as rows that add up by
 * hand: the estimate, each thing between, and the guide's low end. Each is rounded to the dollar
 * as the screen writes it, and the biggest row between takes up the odd dollar the rounding
 * leaves, so the column adds exactly. Null where there is no bridge.
 */
export function bridgeSteps(e: Estimate): { steps: BridgeStep[]; to: BridgeStep } | null {
  const b = e.bridge
  if (!b) return null
  const steps: BridgeStep[] = [{ label: 'The estimate, from the quantities', note: '', amount: Math.round(e.total) }]
  for (const r of b.rows) {
    const amount = Math.round(r.amount)
    if (r.id === 'margin') steps.push({ label: 'The builder’s margin the guide has in it', note: 'You build it yourself, so the estimate leaves it out.', amount })
    else if (r.id === 'house')
      steps.push({
        label: 'Not counted in the house itself',
        note: `${money(b.perM2)} per m² × ${e.floorArea.toFixed(2)} m²: mostly a one-off builder’s prices over the rough trade rates here, and things with no line yet (${NOT_COUNTED.join(', ')}).`,
        amount,
      })
    else steps.push({ label: `Contingency ${pct(e.contingency.share)} on ${b.rows.length > 2 ? 'those' : 'that'}`, note: '', amount })
  }
  const to = Math.round(b.to)
  const biggest = steps.slice(1).reduce((a, x) => (x.amount > a.amount ? x : a))
  biggest.amount += to - steps.reduce((t, x) => t + x.amount, 0)
  return { steps, to: { label: `Custom-built at a ${finishName(e).toLowerCase()} finish, low end`, note: FINISH_GUIDE_SOURCE, amount: to } }
}

/** The estimate as a CSV file: every line, each group's total, then the totals. Amounts are whole dollars, GST included. */
export function estimateCsv(e: Estimate, name: string, asAt: string): string {
  const ob = e.who === 'owner'
  const head = ['Group', 'Item', 'Where the quantity comes from', 'Quantity', 'Unit', 'Rate ($)', 'Estimate ($)', 'Quote ($)', 'Quote from', 'Amount ($)', ...(ob ? ['Materials and fees ($)', 'Labour ($)'] : [])]
  const rows: (string | number)[][] = [head]
  for (const g of e.groups) {
    for (const l of g.lines)
      rows.push([
        g.label,
        l.label,
        l.missing ?? l.from,
        l.unit === 'item' ? '' : l.qty.toFixed(l.dp),
        l.unit === 'item' ? '' : l.unit,
        l.rate === null ? '' : dollars(l.rate),
        dollars(l.estimate),
        l.quote ? dollars(l.quote.amount) : '',
        l.quote?.from ?? '',
        dollars(l.amount),
        ...(ob ? [dollars(l.materials), dollars(l.labour)] : []),
      ])
    rows.push([g.label, `${g.label} total`, '', '', '', '', '', '', '', dollars(g.total), ...(ob ? ['', ''] : [])])
  }
  const blank = head.map(() => '')
  const total = (label: string, amount: number) => ['', label, '', '', '', '', '', '', '', dollars(amount), ...(ob ? ['', ''] : [])]
  // The summary under the groups: the subtotal, the margin and the contingency.
  rows.push(blank)
  rows.push(total('Subtotal', e.subtotal))
  for (const l of e.lines.filter(x => x.group === 'summary')) rows.push(['', l.label, l.from, '', '', '', '', '', '', dollars(l.amount), ...(ob ? [dollars(l.materials), dollars(l.labour)] : [])])
  rows.push(blank)
  // No total before there are outside walls; with one, what it leaves out is said beside it.
  if (!e.ready) rows.push(['', `No total yet. ${NO_TOTAL}`])
  else {
    rows.push(total('Estimate', e.total))
    if (e.missing.length) rows.push(['', `${incompleteText(e.missing)}.`])
    rows.push(total('Likely low (−20%)', e.low))
    rows.push(total('Likely high (+20%)', e.high))
  }
  if (e.perM2 !== null) rows.push(total(`Per m² of floor (${e.floorArea.toFixed(2)} m²)`, e.perM2))
  if (e.housePerM2 !== null) rows.push(total('House only, per m² of floor (no site works, outside works, fees or contingency)', e.housePerM2))
  // The cross-check and the bridge to it, as the screen has them.
  if (e.against !== null && e.guide) {
    rows.push(blank)
    rows.push(total(`Cross-check: custom-built at a ${finishName(e).toLowerCase()} finish, low`, e.guide.low))
    rows.push(total(`Cross-check: custom-built at a ${finishName(e).toLowerCase()} finish, high`, e.guide.high))
    rows.push(['', crossCheckText(e)])
    const bridge = bridgeSteps(e)
    if (bridge) {
      rows.push(['', 'What’s not in the quantities yet'])
      for (const x of [...bridge.steps, bridge.to]) rows.push(['', x.label, x === bridge.to ? '' : x.note, '', '', '', '', '', '', String(x.amount), ...(ob ? ['', ''] : [])])
    }
  }
  if (ob) {
    rows.push(total('Materials and fees', e.materials))
    rows.push(total('Labour, if you hire trades', e.labour))
  }
  rows.push(blank)
  rows.push(['', `${name}: ${ob ? 'built by the owner' : 'built by a builder'}. ${e.quoted} of ${e.quotable} lines quoted. Starting rates are rough NSW figures as at ${asAt}, GST included.`])
  rows.push(['', CAVEAT_LINE])
  return rows.map(r => r.map(field).join(',')).join('\r\n') + '\r\n'
}

/** "1,250", "$1,250.50", "1250" → 1250. Null when it isn't an amount. */
export function parseMoney(text: string): number | null {
  const t = text.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Where a line's quantity lives, in words: "Design › Roofs" for "design/roofs". */
export function atName(at: string): string {
  const [area, tab] = at.split('/')
  const a = areaById(area)
  const t = a?.tabs.find(x => x.id === tab)
  return a && t ? `${a.label} › ${t.label}` : at
}
