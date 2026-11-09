// Council and government fees a new house usually pays, worked out roughly from the estimated
// cost of the building work: the development application fee, the NSW long service levy, and the
// council's development contribution. Each is a rough figure, shown as its own line in the
// estimate, and a figure from the council replaces it (the line's quote).
//
// Sources, checked November 2026:
// - DA fee: NSW Department of Planning, "Schedule of planning and development fees and charges
//   2026/27", item 2.1 (EP&A Regulation 2021, Schedule 4): erecting a building or carrying out
//   work, by estimated development cost including GST. The base amounts are fee units, indexed
//   each 1 July; the per-$1,000 amounts aren't.
//   https://www.planning.nsw.gov.au/sites/default/files/2026-06/schedule-planning-development-fees-charges-2026-27.pdf
//   Not counted: notification and advertising fees, and the fees for integrated or designated
//   development, which depend on the council and the site.
// - Long service levy: 0.25% of the cost of building work of $250,000 or more, GST included
//   (Long Service Corporation, nsw.gov.au). Owner-builders with a permit can get up to half off,
//   which isn't taken off here: it's applied for when paying.
//   https://www.nsw.gov.au/employment/rights-responsibilities/portable-long-service/bci-long-service-payments-scheme/long-service-levy
// - Development contributions: each council's own plan. Only Wollongong's section 7.12 levy is
//   here so far (Wollongong City-Wide Development Contributions Plan 2025, Schedule 1: nil up to
//   $100,000, 0.5% to $200,000, 1% over; not in the West Dapto Urban Release Area).
//   https://www.wollongong.nsw.gov.au/__data/assets/pdf_file/0027/304758/Wollongong-City-Wide-Development-Contributions-Plan-2025.pdf
//   Kiama, Blue Mountains and Central Coast have none here yet: their plans charge by area and by
//   kind of development, which needs reading plan by plan.

import { checkSettingsOf, activeCouncil } from '../checks/councils'
import type { CouncilId } from '../checks/types'
import type { Plan } from '../plan/model'

/** What the fees depend on besides the cost: the council whose rules are on, and the pathway. */
export interface FeeContext {
  council: { id: CouncilId; name: string } | null
  /** A development application (true), or complying development, which pays no DA fee. */
  da: boolean
}

/** No council known, as a DA: what a plan without check settings estimates against. */
export const NO_FEE_CONTEXT: FeeContext = { council: null, da: true }

/** The fee context a plan's check settings give (Design › Checks). */
export function feeContextOf(plan: Pick<Plan, 'checks'> | null | undefined): FeeContext {
  const s = checkSettingsOf(plan?.checks)
  const c = activeCouncil(s)
  return { council: c ? { id: c.id, name: c.name } : null, da: s.pathway === 'da' }
}

/** One band of the DA fee scale: from `over` (exclusive) the fee is base + perK for each $1,000 or part of $1,000 above `over`. */
interface Band {
  over: number
  base: number
  perK: number
}

/** The DA fee scale for 2026/27 (item 2.1), in $; the first band is a flat fee. */
export const DA_FEE_SCALE: Band[] = [
  { over: 0, base: 153, perK: 0 },
  { over: 5_000, base: 235, perK: 3 },
  { over: 50_000, base: 488, perK: 3.64 },
  { over: 250_000, base: 1_608, perK: 2.34 },
  { over: 500_000, base: 2_420, perK: 1.64 },
  { over: 1_000_000, base: 3_625, perK: 1.44 },
  { over: 10_000_000, base: 22_009, perK: 1.19 },
]

/** The year the DA fee scale is for. */
export const DA_FEE_YEAR = '2026/27'

/** The DA fee for an estimated development cost ($, GST included). */
export function daFee(cost: number): number {
  if (!(cost > 0)) return 0
  let band = DA_FEE_SCALE[0]
  for (const b of DA_FEE_SCALE) if (cost > b.over) band = b
  return band.base + band.perK * Math.ceil((cost - band.over) / 1000 - 1e-9)
}

/** The long service levy's rate, and the cost of work it starts at ($, GST included). */
export const LSL = { rate: 0.0025, from: 250_000 }

export function longServiceLevy(cost: number): number {
  return cost >= LSL.from ? cost * LSL.rate : 0
}

/** A council's section 7.12 levy: a share of the cost, by band. `upTo` is inclusive. */
interface LevyBand {
  upTo: number
  rate: number
}

interface Contributions {
  /** The plan, as a line names it. */
  plan: string
  bands: LevyBand[]
  /** Where it doesn't apply, in a few words. */
  except?: string
}

/** Each council's development contribution, where the app has it. */
export const CONTRIBUTIONS: Partial<Record<CouncilId, Contributions>> = {
  wollongong: {
    plan: 'Wollongong section 7.12 levy',
    bands: [
      { upTo: 100_000, rate: 0 },
      { upTo: 200_000, rate: 0.005 },
      { upTo: Infinity, rate: 0.01 },
    ],
    except: 'not in the West Dapto Urban Release Area',
  },
}

/** The council's contribution for a cost, or null when the app has no figure for that council. */
export function contribution(council: CouncilId | null, cost: number): { amount: number; rate: number; plan: Contributions } | null {
  const plan = council ? CONTRIBUTIONS[council] : undefined
  if (!plan) return null
  const band = plan.bands.find(b => cost <= b.upTo) ?? plan.bands[plan.bands.length - 1]
  return { amount: cost * band.rate, rate: band.rate, plan }
}
