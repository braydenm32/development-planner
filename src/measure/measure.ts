// The two-point ruler's numbers. The ground under each point comes from the same place as the
// plan's RL readout (groundAtPlan: the survey's ground, and nothing off the block).

import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Heightfield } from '../lib/terrain'
import { groundAtPlan } from '../plan/groundOverlay'
import type { Placement } from '../plan/model'

export interface Measurement {
  /** Distance on the plan, as a map or drawing shows it (m). */
  flat: number
  /** RL of the ground under each end; null off the block. */
  rlA: number | null
  rlB: number | null
  /** Height from the first point to the second (m, positive going up); null when an end is off the block. */
  rise: number | null
  /** Distance along the ground's slope between the ends, flat and height together (m); null with no rise. */
  sloped: number | null
}

/** Points are in the house's frame (what the plan works in). */
export function measure(a: Vec2, b: Vec2, pl: Placement, survey: Pick<Survey, 'origin' | 'boundary'>, grid: Heightfield): Measurement {
  const flat = Math.hypot(b[0] - a[0], b[1] - a[1])
  const rlA = groundAtPlan(a, pl, survey, grid)
  const rlB = groundAtPlan(b, pl, survey, grid)
  const rise = rlA === null || rlB === null ? null : rlB - rlA
  return { flat, rlA, rlB, rise, sloped: rise === null ? null : Math.hypot(flat, rise) }
}

const m2 = (n: number) => `${n.toFixed(2)} m`

/** "+1.20 m" or "−0.35 m": a height gained or lost. */
export const riseText = (n: number) => (Math.abs(n) < 0.005 ? '0.00 m' : `${n > 0 ? '+' : '−'}${m2(Math.abs(n))}`)

/** The three numbers in words, for the readout and for screen readers. */
export function measureText(m: Measurement): { flat: string; sloped: string; rise: string } {
  return {
    flat: m2(m.flat),
    sloped: m.sloped === null ? 'off the block' : m2(m.sloped),
    rise: m.rise === null ? 'off the block' : riseText(m.rise),
  }
}
