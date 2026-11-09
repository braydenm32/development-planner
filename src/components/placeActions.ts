// What Earthworks › Place does to where the house sits: turn it, centre it, square it to the
// block, and start a new house's floor on its ground. Each is one undoable step.

import type { Survey } from '../lib/survey'
import type { Heightfield } from '../lib/terrain'
import { firstFloorPlan } from '../plan/levelGround'
import type { Plan } from '../plan/model'
import { planBounds } from '../plan/ops'
import { centredPlacement } from '../plan/placement'
import type { PlacementInfo } from '../plan/keyNumbers'
import { usePlan } from '../plan/store'
import { showToast } from '../safety/store'
import { rotateHouse } from './planNumbers'

const setPlacement = (patch: Partial<Plan['placement']>) => usePlan.getState().commit(p => ({ ...p, placement: { ...p.placement, ...patch } }))

/** The placement's turn (anticlockwise from east) as the panel shows it: degrees clockwise, 0 to 360. */
export const clockwiseOf = (rotation: number) => {
  const cw = Math.round(((((-rotation % 360) + 360) % 360) * 10)) / 10
  return cw === 360 ? 0 : cw
}

/** Degrees clockwise back to the placement's anticlockwise turn, in (-180, 180]. */
export const rotationFromClockwise = (cw: number) => {
  let r = -cw % 360
  if (r <= -180) r += 360
  if (r > 180) r -= 360
  return Math.round(r * 10) / 10 + 0
}

/** Turn the house about its own middle, then fit the plan to it again: the view turns with a house-square plan. */
export function turnHouse(plan: Plan, rotation: number) {
  setPlacement(rotateHouse(plan, rotation))
  usePlan.getState().requestFit('house')
}

/** Slide the house to the middle of the block. */
export function centreOnBlock(plan: Plan, survey: Survey) {
  const b = planBounds(plan)
  if (!b) return
  setPlacement(centredPlacement(plan.placement, [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2], survey))
}

/** Turn the house the least way that squares it to the nearest side of the block. */
export function squareToBoundary(plan: Plan, info: PlacementInfo | null) {
  if (!info?.sides.length) return
  const closest = [...info.sides].sort((a, b) => a.dist - b.dist)[0]
  let r = closest.angle
  while (r > 45) r -= 90
  while (r <= -45) r += 90
  turnHouse(plan, Math.round(r * 10) / 10)
}

/**
 * After a run of walls: a house's first walls (none before the run) put its floor at the mean
 * ground under them, as its own undoable step, and say so.
 */
export function floorToFirstWalls(before: Plan, survey: Pick<Survey, 'origin'>, natural: Heightfield) {
  const st = usePlan.getState()
  if (!st.plan) return
  const first = firstFloorPlan(before, st.plan, survey, natural)
  if (!first) return
  st.commit(() => first.plan)
  const after = usePlan.getState().plan
  showToast({
    text: `Floor set to RL ${first.rl.toFixed(2)}, the mean ground under the walls. Change it in Earthworks › Place.`,
    undo: () => {
      if (usePlan.getState().plan === after) usePlan.getState().undo()
    },
  })
}

