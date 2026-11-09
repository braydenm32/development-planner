// What a retaining wall changes, for the line under its height box: the earth it adds to or saves
// from the cut and fill, how far behind it the ground is reworked, and the wall's own size and
// rough cost. Worked out against the same plan without the wall, as the app's earthworks are.

import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Heightfield } from '../lib/terrain'
import { rateFor } from '../costs/estimate'
import type { CostsData } from '../costs/model'
import type { Plan, Wall } from './model'
import { toSite } from './model'
import { SLEEPER_MAX_THICKNESS } from './quantities'
import { retainingProfile } from './retaining'
import { earthFrom, earthInputs, type Earth } from './useEarthworks'

/** Ground that moves less than this (m) isn't counted as changed. */
const CHANGED = 0.05

export interface WallChange {
  /** Cut and fill with the wall, less without it (m³). */
  cut: number
  fill: number
  /** How far from the wall the ground is reworked because of it, on the side it holds, at most (m). */
  reach: number
  /** The wall's height above the ground in front (m), and its face (m²). */
  height: number
  face: number
  /** Face times the rate for its kind of wall ($); null without costs. */
  cost: number | null
  /** The grid squares whose finished ground the wall changes, in the survey's local frame: their lower-left corners. */
  cells: Vec2[]
  cell: number
}

/** What `wall` changes in `plan` (which has it), against the plan without it. */
export function wallChange(plan: Plan, wall: Wall, survey: Pick<Survey, 'origin' | 'boundary'>, natural: Heightfield, earth: Earth, costs?: Pick<CostsData, 'rates'>): WallChange {
  const without: Plan = { ...plan, walls: plan.walls.filter(w => w.id !== wall.id) }
  const before = earthFrom(natural, survey.boundary, earthInputs(without, survey))
  const a = earth.result.grid
  const b = before.result.grid
  const wa = toSite(wall.a, plan.placement, survey.origin)
  const wb = toSite(wall.b, plan.placement, survey.origin)
  const dx = wb[0] - wa[0]
  const dy = wb[1] - wa[1]
  const len = Math.hypot(dx, dy) || 1
  const cells: Vec2[] = []
  let reach = 0
  for (let j = 0; j < a.ny; j++) {
    for (let i = 0; i < a.nx; i++) {
      const k = j * a.nx + i
      if (!(Math.abs(a.z[k] - b.z[k]) > CHANGED)) continue
      const x = a.x0 + i * a.cell
      const y = a.y0 + j * a.cell
      cells.push([x - a.cell / 2, y - a.cell / 2])
      // Distance from the wall's line, along its length or past its ends.
      const t = Math.max(0, Math.min(1, ((x - wa[0]) * dx + (y - wa[1]) * dy) / (len * len)))
      reach = Math.max(reach, Math.hypot(x - wa[0] - t * dx, y - wa[1] - t * dy))
    }
  }
  const prof = retainingProfile(wall, plan, survey.origin, a)
  const rateId = wall.thickness < SLEEPER_MAX_THICKNESS ? 'retaining-sleeper' : 'retaining-block'
  return {
    cut: earth.result.cut - before.result.cut,
    fill: earth.result.fill - before.result.fill,
    reach,
    height: prof.maxHeight,
    face: prof.faceArea,
    cost: costs ? prof.faceArea * rateFor(costs, rateId) : null,
    cells,
    cell: a.cell,
  }
}

const vol = (v: number, what: string) => `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(v >= 10 || v <= -10 ? 0 : 1)} m³ ${what}`

/** The change in one line: "+56 m³ cut, ground reworked 9 m behind, 1.42 m wall ≈ $12,800". */
export function wallChangeText(c: WallChange, money: (n: number) => string): string {
  const parts: string[] = []
  if (Math.abs(c.cut) >= 0.5) parts.push(vol(c.cut, 'cut'))
  if (Math.abs(c.fill) >= 0.5) parts.push(vol(c.fill, 'fill'))
  if (!parts.length) parts.push('no change to the cut and fill')
  if (c.reach >= 0.5) parts.push(`ground reworked up to ${c.reach.toFixed(c.reach >= 10 ? 0 : 1)} m from it`)
  const wall = `${c.height.toFixed(2)} m wall`
  parts.push(c.cost !== null && c.cost > 0 ? `${wall} ≈ ${money(c.cost)}` : wall)
  return parts.join(', ')
}
