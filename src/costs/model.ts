// A project's own costs: who builds it, the materials chosen, rates changed from the starting
// ones, and quotes. Kept with the project as its `costs` record (src/costs/persist.ts), in the
// project file and in cloud saves, and never in a share link.

import { CHOICE_GROUPS, CHOICES, CONTINGENCY, DEFAULT_CHOICES, isRateId, MARGIN, type Choices, type RateId } from './rates'

/** The project record that keeps them. */
export const COSTS_KIND = 'costs'

export type Who = 'builder' | 'owner'

/** A price someone gave for one line: it replaces that line's estimate. */
export interface Quote {
  /** $, GST included. */
  amount: number
  /** Who it's from. */
  from: string
  /** When it was added, as yyyy-mm-dd. */
  date: string
}

export interface CostsData {
  version: 1
  who: Who
  choices: Choices
  /** Rates changed from the starting rate, by id ($ per unit, GST included). */
  rates: Partial<Record<RateId, number>>
  /** Contingency, as a share of everything else. */
  contingency: number
  /** The builder's margin and overheads, as a share of the building work. */
  margin: number
  /** Quotes, by the line they replace. */
  quotes: Record<string, Quote>
}

export const emptyCosts = (): CostsData => ({ version: 1, who: 'builder', choices: { ...DEFAULT_CHOICES }, rates: {}, contingency: CONTINGENCY, margin: MARGIN, quotes: {} })

const money = (v: unknown, max = 1e9): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null)
const share = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback)

/** Check saved costs (a project's record, or a project file's), keeping what is sound. */
export function normalizeCosts(raw: unknown): CostsData {
  const d = raw as Partial<CostsData> | null
  const out = emptyCosts()
  if (!d || typeof d !== 'object') return out
  if (d.who === 'owner' || d.who === 'builder') out.who = d.who
  if (d.choices && typeof d.choices === 'object')
    for (const g of CHOICE_GROUPS) {
      const c = (d.choices as Record<string, unknown>)[g]
      if (typeof c === 'string' && CHOICES[g].options.some(o => o.id === c)) out.choices[g] = c
    }
  if (d.rates && typeof d.rates === 'object')
    for (const [k, v] of Object.entries(d.rates)) {
      const n = money(v, 1e7)
      if (isRateId(k) && n !== null) out.rates[k] = n
    }
  out.contingency = share(d.contingency, CONTINGENCY)
  out.margin = share(d.margin, MARGIN)
  if (d.quotes && typeof d.quotes === 'object')
    for (const [k, q] of Object.entries(d.quotes)) {
      const amount = money(q?.amount)
      if (!k || amount === null) continue
      out.quotes[k] = { amount, from: typeof q.from === 'string' ? q.from.slice(0, 200) : '', date: typeof q.date === 'string' ? q.date.slice(0, 10) : '' }
    }
  return out
}

/** In a few words, what a project's costs hold beyond the starting point: "2 quotes, 1 changed rate". */
export function costsSummary(d: CostsData): string {
  const n = (c: number, one: string) => (c ? `${c} ${one}${c === 1 ? '' : 's'}` : null)
  const parts = [n(Object.keys(d.quotes).length, 'quote'), n(Object.keys(d.rates).length, 'changed rate'), d.who === 'owner' ? 'built by the owner' : null].filter(Boolean)
  return parts.length ? parts.join(', ') : 'Material choices'
}

/** Today, as a quote's date. */
export const today = () => new Date().toISOString().slice(0, 10)
