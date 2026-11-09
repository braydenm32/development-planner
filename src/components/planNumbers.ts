// The plan's numbers and actions that several panels share: moved out of
// PlanSections so its file holds only components.

import { useMemo } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { buildingOutline, planarFaces } from '../plan/geometry'
import { balancedFloorRL, placementInfo, type PlacementInfo } from '../plan/keyNumbers'
import { fflForGroundRL, sortedLevels, type Plan } from '../plan/model'
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

/** The ground floor's outline, which sets the ground under the house and its distances to the boundary. */
export const lowestOutline = (plan: Plan): Vec2[][] =>
  buildingOutline(planarFaces(plan.walls.filter(w => w.level === sortedLevels(plan)[0]?.id))).outlines

export function usePlacementInfo(plan: Plan, survey: Survey, terrain: Terrain): PlacementInfo | null {
  const gross = useMemo(() => lowestOutline(plan), [plan])
  const pl = plan.placement
  return useMemo(() => placementInfo(gross, pl, survey, terrain), [gross, pl, survey, terrain])
}
