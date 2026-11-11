// What moves the ground at a spot, in words, so an earthworks check can say why it fails: "the
// fill batter of the Garage floor's pad", "the driveway Drive's own surface". Read from the
// platform ids the earthworks are built from (src/plan/platforms.ts, src/plan/driveway.ts,
// src/grading/model.ts).

import { groundSourceAt, type EarthworksResult, type GroundSource, type PreparedEarthworks } from '../lib/earthworks'
import type { Vec2 } from '../lib/geom'
import { BENCH_PREFIX, isPadId, isPiersId, PAD_ID, PIERS_ID } from '../plan/platforms'
import { levelById, sortedLevels, type Plan } from '../plan/model'

/** What a platform is, for the earthworks checks: the part of the design that makes it, and where it's changed. */
export interface EarthSource {
  /** The platform's id in the earthworks. */
  id: string
  kind: 'pad' | 'piers' | 'slab' | 'bench' | 'driveway' | 'painted' | 'other'
  /** Its level ground, one of its batters, or (a house pad's) the level margin outside the walls. */
  how: GroundSource['how'] | 'margin'
  /** The thing in the design, in words: "the Garage floor's pad". */
  name: string
  /** A slab or driveway area's id, or a retaining wall's, to point at on the plan. */
  areaId?: string
  wallId?: string
}

/** "the Garage floor", "the Ground floor" (not "the Ground floor floor"). */
const levelOf = (plan: Plan, id: string, prefix: string) => {
  const lv = id === prefix ? sortedLevels(plan)[0] : levelById(plan, id.slice(prefix.length + 1))
  const name = lv?.name ?? 'house'
  return /\bfloor$/i.test(name) ? `the ${name}` : `the ${name} floor`
}

/** The design part a platform id stands for. */
export function earthSource(plan: Plan, id: string | undefined, how: EarthSource['how']): EarthSource {
  if (!id) return { id: '', kind: 'other', how, name: 'other levelled ground' }
  if (isPadId(id)) return { id, kind: 'pad', how, name: `${levelOf(plan, id, PAD_ID)}'s slab pad` }
  if (isPiersId(id)) return { id, kind: 'piers', how, name: `the clearance dug under ${levelOf(plan, id, PIERS_ID)} on piers` }
  if (id.startsWith('slab:')) {
    const a = plan.areas.find(x => x.id === id.slice(5))
    return { id, kind: 'slab', how, name: a ? `the slab “${a.name}”` : 'a slab', ...(a ? { areaId: a.id } : {}) }
  }
  if (id.startsWith(BENCH_PREFIX)) {
    const wallId = id.slice(BENCH_PREFIX.length).split(':')[0]
    return { id, kind: 'bench', how, name: 'the level ground beside a retaining wall', wallId }
  }
  if (id.startsWith('grade:')) return { id, kind: 'painted', how, name: 'ground painted with the Cut or Fill brush' }
  const drive = plan.areas.find(a => a.id === id)
  if (drive) return { id, kind: 'driveway', how, name: `the driveway “${drive.name}”`, areaId: drive.id }
  return { id, kind: 'other', how, name: 'other levelled ground' }
}

/** "the fill batter of the Garage floor's slab pad", "the driveway “Drive” itself". */
export function sourceWords(s: EarthSource): string {
  if (s.how === 'margin') return `the level margin around ${s.name}`
  if (s.how === 'level') return s.kind === 'driveway' ? `${s.name} itself, built to its own levels` : s.name
  return `the ${s.how} batter of ${s.name}`
}

/** One part of the design whose earthworks come within reach of the boundary. */
export interface NearBoundary {
  source: EarthSource
  /** The closest it comes (m), where (site frame), and to which boundary edge (by index). */
  d: number
  at: Vec2
  edge: number
}

/**
 * Each part of the design whose cut or fill (over 50 mm) comes within `within` of the boundary
 * edges listed (all of them when none are), closest first: what to change to pull the works back.
 */
export function worksNearBoundary(plan: Plan, prep: PreparedEarthworks, result: EarthworksResult, boundary: Vec2[], within = 1, edges?: number[]): NearBoundary[] {
  const n = prep.natural
  const f = result.grid
  const counted = edges ?? boundary.map((_, i) => i)
  const best = new Map<string, NearBoundary>()
  for (let k = 0; k < n.z.length; k++) {
    if (!prep.inside[k]) continue
    const dz = f.z[k] - n.z[k]
    if (Math.abs(dz) <= 0.05) continue
    const i = k % n.nx
    const p: Vec2 = [n.x0 + i * n.cell, n.y0 + ((k - i) / n.nx) * n.cell]
    let d = Infinity
    let edge = -1
    for (const e of counted) {
      const de = segDist(p, boundary[e], boundary[(e + 1) % boundary.length])
      if (de < d) {
        d = de
        edge = e
      }
    }
    if (d > within) continue
    const src = groundSourceAt(prep, k)
    const pf = src ? prep.platforms[src.platform] : undefined
    if (!src || !pf) continue
    const key = pf.id ?? `#${src.platform}`
    const had = best.get(key)
    if (!had || d < had.d) best.set(key, { source: earthSource(plan, pf.id, src.how), d, at: p, edge })
  }
  return [...best.values()].sort((a, b) => a.d - b.d)
}

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
