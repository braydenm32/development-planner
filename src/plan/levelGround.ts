// Each level's floor against the natural ground under it, for Earthworks › Place: on a split level
// every level sits on its own part of the block, so one "ground floor level" says too little. And
// the level a new house's first floor starts at: the mean ground under its first walls.

import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Heightfield } from '../lib/terrain'
import { buildingOutline, planarFaces } from './geometry'
import { groundRange } from './groundOverlay'
import { fflForGroundRL, floorRL, houseWalls, sortedLevels, toSite, wallLength, type Plan, type Wall } from './model'

export interface LevelGround {
  id: string
  name: string
  /** The level's floor RL. */
  floor: number
  /** The lowest and highest natural ground under its outline; null before it has walls round a floor. */
  ground: { min: number; max: number } | null
}

/** Every level, lowest first, with its floor and the natural ground under it. */
export function levelGrounds(plan: Plan, origin: Vec2, natural: Heightfield): LevelGround[] {
  return sortedLevels(plan).map(l => {
    const rings = buildingOutline(planarFaces(houseWalls(plan.walls.filter(w => w.level === l.id)))).outlines
    let ground: LevelGround['ground'] = null
    for (const r of rings) {
      const g = groundRange(r, plan.placement, origin, natural)
      if (g) ground = ground ? { min: Math.min(ground.min, g.min), max: Math.max(ground.max, g.max) } : g
    }
    return { id: l.id, name: l.name, floor: floorRL(plan, l.id), ground }
  })
}

/** The mean natural ground along some walls, sampled every half metre or so; null with none on the block. */
export function meanGroundUnder(walls: Pick<Wall, 'a' | 'b'>[], plan: Plan, survey: Pick<Survey, 'origin'>, natural: Heightfield): number | null {
  let sum = 0
  let n = 0
  for (const w of walls) {
    const steps = Math.max(1, Math.ceil(wallLength(w) / 0.5))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const p = toSite([w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t], plan.placement, survey.origin)
      const z = natural.sample(p[0], p[1])
      if (!Number.isFinite(z)) continue
      sum += z
      n++
    }
  }
  return n ? sum / n : null
}

/**
 * A house's first walls: the plan had none before this run of walls and has some now. Its floor
 * goes to the mean ground under them (to 50 mm), so a new house starts sitting on its ground, not
 * stuck out over the low side or dug into the high side. Null when nothing should change.
 */
export function firstFloorPlan(before: Plan, now: Plan, survey: Pick<Survey, 'origin'>, natural: Heightfield): { plan: Plan; rl: number } | null {
  if (houseWalls(before.walls).length || !houseWalls(now.walls).length) return null
  const lowest = sortedLevels(now)[0]?.id
  const walls = houseWalls(now.walls).filter(w => w.level === lowest)
  const mean = meanGroundUnder(walls, now, survey, natural)
  if (mean === null) return null
  const rl = Math.round(mean * 20) / 20
  if (Math.abs(rl - floorRL(now)) < 0.005) return null
  return { plan: { ...now, placement: { ...now.placement, ffl: fflForGroundRL(now, rl) } }, rl }
}
