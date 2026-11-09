// Balance's preview: what moving the floor to where cut and fill are about equal would change,
// before anything moves. Every number comes from the helper that shows it elsewhere (the strip,
// Cut & fill, Retaining walls, Roofs, Checks), worked out for the plan as it is and as Balance
// would leave it, so the popover can't disagree with the rest of the app.

import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { balancedFloorRL, crossedBoundaries, tallestRoof } from '../plan/keyNumbers'
import { fflForGroundRL, floorRL, type Plan } from '../plan/model'
import { retainingProfiles } from '../plan/retaining'
import { earthFrom, earthInputs, type Earth } from '../plan/useEarthworks'
import { impliedTotals, impliedWalls } from './implied'

export interface BalanceFacts {
  /** The ground floor's RL. */
  ffl: number
  cut: number
  fill: number
  /** Cut less fill: more than zero is earth to take away (m³). */
  net: number
  /** The most any retaining wall holds back, drawn or implied (m); 0 with none. */
  tallestWall: number
  /** The roof's height above the natural ground (m); null with no roof. */
  roof: number | null
  /** The boundaries the batters run over, in words; null when none. */
  batters: string | null
  /** Checks that fail; null when they aren't counted here. */
  fails: number | null
}

export interface BalancePreview {
  /** The floor RL Balance would set. */
  to: number
  before: BalanceFacts
  after: BalanceFacts
  /** The plan as Balance would leave it. */
  plan: Plan
}

/** Counts the checks that fail for a plan and its earthworks (Design › Checks' own count). */
export type CountFails = (plan: Plan, earth: Earth) => number

/** The numbers Balance changes, for a plan and its earthworks. */
export function balanceFacts(plan: Plan, survey: Survey, terrain: Terrain, earth: Earth, fails?: CountFails): BalanceFacts {
  const r = earth.result
  const walls = retainingProfiles(plan, survey.origin, r.grid)
  const implied = impliedTotals(impliedWalls(survey, earth))
  return {
    ffl: floorRL(plan),
    cut: r.cut,
    fill: r.fill,
    net: r.cut - r.fill,
    tallestWall: Math.max(0, ...walls.map(w => w.maxHeight), implied?.maxHeight ?? 0),
    roof: tallestRoof(plan, survey, terrain)?.height ?? null,
    batters: crossedBoundaries(r, survey),
    fails: fails ? fails(plan, earth) : null,
  }
}

/** What Balance would do, worked out without changing the plan; null when it can't balance. */
export function balancePreview(plan: Plan, survey: Survey, terrain: Terrain, earth: Earth | null, fails?: CountFails): BalancePreview | null {
  if (!earth || !earth.platforms.length) return null
  const to = balancedFloorRL(plan, earth.prep)
  if (to === null) return null
  const moved: Plan = { ...plan, placement: { ...plan.placement, ffl: fflForGroundRL(plan, to) } }
  const after = earthFrom(terrain.grid, survey.boundary, earthInputs(moved, survey))
  return { to, before: balanceFacts(plan, survey, terrain, earth, fails), after: balanceFacts(moved, survey, terrain, after, fails), plan: moved }
}

export interface BalanceRow {
  label: string
  before: string
  after: string
  /** The change makes this worse (taller, more boundaries, more fails). */
  worse: boolean
  /** It changes at all. */
  changed: boolean
}

const m = (v: number) => `${v.toFixed(2)} m`
const m3 = (v: number) => `${v.toFixed(1)} m³`
const netText = (v: number) => (Math.abs(v) < 0.05 ? 'none' : v > 0 ? `${m3(v)} away` : `${m3(-v)} in`)

/** The preview as rows to show: before, after, and whether it got worse. */
export function balanceRows(p: BalancePreview): BalanceRow[] {
  const { before: b, after: a } = p
  const row = (label: string, before: string, after: string, worse: boolean): BalanceRow => ({ label, before, after, worse: worse && before !== after, changed: before !== after })
  const rows = [
    row('Floor', `RL ${b.ffl.toFixed(2)}`, `RL ${a.ffl.toFixed(2)}`, false),
    row('Cut · fill', `${b.cut.toFixed(1)} · ${b.fill.toFixed(1)} m³`, `${a.cut.toFixed(1)} · ${a.fill.toFixed(1)} m³`, a.cut + a.fill > b.cut + b.fill + 0.5),
    row('Earth to move off or bring in', netText(b.net), netText(a.net), Math.abs(a.net) > Math.abs(b.net) + 0.05),
  ]
  if (b.tallestWall > 0 || a.tallestWall > 0) rows.push(row('Tallest wall', b.tallestWall > 0 ? m(b.tallestWall) : 'none', a.tallestWall > 0 ? m(a.tallestWall) : 'none', a.tallestWall > b.tallestWall + 0.005))
  if (b.roof !== null && a.roof !== null) rows.push(row('Roof above ground', m(b.roof), m(a.roof), a.roof > b.roof + 0.005))
  if (b.batters || a.batters) rows.push(row('Batters cross', b.batters ?? 'none', a.batters ?? 'none', countSides(a.batters) > countSides(b.batters)))
  if (b.fails !== null && a.fails !== null) rows.push(row('Checks that fail', String(b.fails), String(a.fails), a.fails > b.fails))
  return rows
}

/** How many boundaries a "the north and east boundaries" names, near enough to compare. */
function countSides(t: string | null): number {
  if (!t) return 0
  if (/all|every/.test(t)) return 9
  return t.split(/,| and /).length
}
