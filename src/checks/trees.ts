// Tree protection zones (AS 4970-2009, which Wollongong DCP E17 cites) and how much of each
// one the design takes. The zone sizes are Site › Features' own; the share here counts the
// house, hard areas and any change to the ground together, as the checks need one number.

import { pointInPolygon, type Vec2 } from '../lib/geom'
import type { Measures } from './measure'
import { distToRing } from './measure'
import type { CheckTree } from './types'
import { MAJOR_ENCROACHMENT, srzRadius, tpzRadius } from '../site/warnings'

export { tpzRadius, srzRadius }

/** Share of a TPZ that can be built in without detailed root investigation (AS 4970-2009). */
export const MINOR_ENCROACHMENT = MAJOR_ENCROACHMENT

/** E17 13.3: a tree with its base this close to a DA-approved building may then be removed. */
export const E17_REMOVAL_DISTANCE = 3

export interface Encroachment {
  tpz: number
  srz: number
  /** Share of the TPZ's area taken by the house, hard areas, retaining walls and ground level changes. */
  share: number
  /** Something sits inside the structural root zone. */
  inSrz: boolean
  /** Closest the house comes to the trunk (m); null with no house. */
  toHouse: number | null
}

/** How much of a tree's protection zone the design takes, sampled at the centres of a 0.25 m grid. */
export function encroachment(t: CheckTree, m: Measures): Encroachment {
  const changed = m.changedAt
  const tpz = tpzRadius(t.trunk)
  const srz = srzRadius(t.trunk)
  const step = 0.25
  let n = 0
  let hit = 0
  let inSrz = false
  const built = (p: Vec2) =>
    m.outlines.some(r => pointInPolygon(p[0], p[1], r)) ||
    m.hard.some(r => pointInPolygon(p[0], p[1], r)) ||
    (changed ? changed(p) : false)
  // Cell centres, so the samples don't line up with walls drawn on whole metres.
  for (let y = -tpz + step / 2; y < tpz; y += step) {
    for (let x = -tpz + step / 2; x < tpz; x += step) {
      const r = Math.hypot(x, y)
      if (r > tpz) continue
      n++
      const p: Vec2 = [t.at[0] + x, t.at[1] + y]
      if (built(p)) {
        hit++
        if (r <= srz) inSrz = true
      }
    }
  }
  const toHouse = m.outlines.length ? Math.min(...m.outlines.map(r => (pointInPolygon(t.at[0], t.at[1], r) ? 0 : distToRing(t.at, r)))) : null
  return { tpz, srz, share: n ? hit / n : 0, inSrz, toHouse }
}
