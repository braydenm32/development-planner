// The plan's numbers and actions that several panels share: moved out of
// PlanSections so its file holds only components.

import { useMemo } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { buildingOutline, planarFaces } from '../plan/geometry'
import { balancedFloorRL, placementInfo, type PlacementInfo } from '../plan/keyNumbers'
import { fflForGroundRL, houseWalls, sortedLevels, type Plan } from '../plan/model'
import { planBounds } from '../plan/ops'
import { ringsCentre, rotatedPlacement } from '../plan/placement'
import { RETAINING_FREEBOARD, retainingProfiles } from '../plan/retaining'
import { usePlan } from '../plan/store'
import type { Earth } from '../plan/useEarthworks'

/** Ground held back (ground to ground) and the wall's height, which adds the upstand: "2.74 m · wall 2.84 m high". */
export const retainedText = (h: number) => `${h.toFixed(2)} m · wall ${(h + RETAINING_FREEBOARD).toFixed(2)} m high`

/** Every retaining wall, measured against the finished ground. */
export function useRetainingWalls(plan: Plan, survey: Survey, terrain: Terrain, earth: Earth | null) {
  return useMemo(() => retainingProfiles(plan, survey.origin, earth?.result.grid ?? terrain.grid), [plan, survey, earth, terrain])
}

/** Move the floor up or down until cut and fill are about equal. Returns what happened, to show. */
export function balanceCutFill(earth: Earth | null): string | null {
  const st = usePlan.getState()
  const plan = st.plan
  if (!earth || !plan) return null
  const rl = balancedFloorRL(plan, earth.prep)
  if (rl === null) return "Cut and fill can't be balanced by moving the floor up or down within 6 m."
  st.commit(p => ({ ...p, placement: { ...p.placement, ffl: fflForGroundRL(p, rl) } }))
  return `Floor moved to RL ${rl.toFixed(2)}, where cut and fill are about equal.`
}

/**
 * The outside of the house's walls on every level, lowest level first, with each ring's level
 * name. On a split level each level sits on its own part of the block, and an upper wing can be
 * nearer a boundary than anything below it: the ground under the house and its distances to the
 * boundary come from all of them. Retaining walls aren't the house, so they're left out.
 */
export function houseOutline(plan: Plan): { rings: Vec2[][]; names: string[] } {
  const rings: Vec2[][] = []
  const names: string[] = []
  for (const l of sortedLevels(plan)) {
    for (const r of buildingOutline(planarFaces(houseWalls(plan.walls.filter(w => w.level === l.id)))).outlines) {
      rings.push(r)
      names.push(l.name)
    }
  }
  return { rings, names }
}

export function usePlacementInfo(plan: Plan, survey: Survey, terrain: Terrain): PlacementInfo | null {
  const house = useMemo(() => houseOutline(plan), [plan])
  const pl = plan.placement
  return useMemo(() => placementInfo(house.rings, pl, survey, terrain, house.names), [house, pl, survey, terrain])
}

/**
 * Turn the house on the block about its own middle, so it turns where it stands. The middle is the
 * house's outline (all levels), or what's drawn when there are no walls yet.
 */
export function rotateHouse(plan: Plan, rotation: number): Plan['placement'] {
  const b = planBounds(plan)
  const mid = ringsCentre(houseOutline(plan).rings) ?? (b ? ([(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] as Vec2) : null)
  return rotatedPlacement(plan.placement, rotation, mid)
}
