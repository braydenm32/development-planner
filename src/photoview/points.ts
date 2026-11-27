// The points a person can line a photo up by: the block's corners, the survey's marks, the corners
// of what they've drawn on the site (a neighbour's house, a fence) and the house's own corners, in
// scene metres, each with a name to say back. Pure.

import * as THREE from 'three'
import type { Vec2 } from '../lib/geom'
import type { SurveyPoint } from '../lib/survey'
import { floorRL, sortedLevels, toSite, type Plan } from '../plan/model'
import { geomPoints, type SiteFeature } from '../site/model'

export interface KnownPoint {
  at: THREE.Vector3
  label: string
}

interface Input {
  boundary: Vec2[]
  levels: SurveyPoint[]
  reference: SurveyPoint[]
  features: SiteFeature[]
  plan: Plan | null
  origin: Vec2
  /** The natural ground's RL at a local point. */
  groundRL: (p: Vec2) => number
  refZ: number
  exag: number
}

export function knownPoints(i: Input): KnownPoint[] {
  const y = (rl: number) => (rl - i.refZ) * i.exag
  const at = (p: Vec2, rl: number) => new THREE.Vector3(p[0], y(rl), -p[1])
  const out: KnownPoint[] = []
  i.boundary.forEach((p, k) => out.push({ at: at(p, i.groundRL(p)), label: `Block corner ${k + 1}` }))
  for (const p of i.reference) out.push({ at: at([p.x, p.y], p.z), label: 'Survey reference point' })
  for (const p of i.levels) out.push({ at: at([p.x, p.y], p.z), label: 'Survey spot level' })
  for (const f of i.features) {
    if (f.type !== 'building' && f.type !== 'fence') continue
    const name = f.type === 'building' ? (f.neighbour ? 'Neighbour’s building corner' : 'Building corner') : 'Fence corner'
    for (const p of geomPoints(f.geom)) {
      const g = i.groundRL(p)
      out.push({ at: at(p, g), label: name })
      if (f.height) out.push({ at: at(p, g + f.height), label: `${name}, top` })
    }
  }
  if (i.plan) {
    const plan = i.plan
    for (const level of sortedLevels(plan)) {
      const rl = floorRL(plan, level.id)
      const seen = new Set<string>()
      for (const w of plan.walls) {
        if (w.level !== level.id || w.kind !== 'external') continue
        for (const end of [w.a, w.b]) {
          const key = `${end[0].toFixed(2)},${end[1].toFixed(2)}`
          if (seen.has(key)) continue
          seen.add(key)
          const p = toSite(end, plan.placement, i.origin)
          out.push({ at: at(p, rl), label: `House corner at the floor (${level.name})` }, { at: at(p, rl + level.height), label: `House corner at the top of the wall (${level.name})` })
        }
      }
    }
  }
  return out
}
