// How costs read: whole dollars with thousands commas, quantities as the panel they come
// from shows them, and the estimate as a CSV file for a spreadsheet.

import { areaById } from '../nav/menu'
import type { CostLine, Estimate } from './estimate'
import type { Unit } from './rates'

const commas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** "$205,934"; a negative amount with a true minus sign. */
export function money(n: number): string {
  const r = Math.round(n)
  return `${r < 0 ? '−' : ''}$${commas(Math.abs(r))}`
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
  if (ob) {
    rows.push(total('Materials and fees', e.materials))
    rows.push(total('Labour, if you hire trades', e.labour))
  }
  rows.push(blank)
  rows.push(['', `${name}: ${ob ? 'built by the owner' : 'built by a builder'}. ${e.quoted} of ${e.quotable} lines quoted. Starting rates are rough NSW figures as at ${asAt}, GST included.`])
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
