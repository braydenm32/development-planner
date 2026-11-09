// Each painted area's own share of the cut and fill, for the grading brush's list.

import { volumesWithout } from '../lib/earthworks'
import type { Earth } from '../plan/useEarthworks'
import { gradePlatformId, type GradeArea } from './model'

/**
 * Each painted area's own cut and fill: the earthworks with it, less the earthworks without it (and,
 * under '', all the painted ground's together). Never below nothing: where painted ground overlaps a
 * batter or a wall, taking it away can leave a little more of something else, which isn't its own.
 */
export function ownVolumes(earth: Earth | null, areas: GradeArea[]): Map<string, { cut: number; fill: number }> {
  const out = new Map<string, { cut: number; fill: number }>()
  if (!earth) return out
  const own = (w: { cut: number; fill: number }) => ({ cut: Math.max(0, earth.result.cut - w.cut), fill: Math.max(0, earth.result.fill - w.fill) })
  const all = new Set(areas.map(a => gradePlatformId(a.id)))
  for (const a of areas) {
    const id = gradePlatformId(a.id)
    out.set(a.id, own(volumesWithout(earth.prep, p => p.id === id)))
  }
  if (areas.length > 1) out.set('', own(volumesWithout(earth.prep, p => !!p.id && all.has(p.id))))
  return out
}
