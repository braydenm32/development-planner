import { buildingOutline, planarFaces } from '../plan/geometry'
import { isRetaining, type Plan } from '../plan/model'

/**
 * Whether a floor has been drawn: a room, or a wall that isn't a retaining wall. Until then the
 * strip's numbers (the floor level of nothing, checks that are all "not drawn yet") say nothing
 * useful, so it shows none.
 */
export const floorDrawn = (plan: Plan) => plan.rooms.length > 0 || plan.walls.some(w => !isRetaining(w))

/**
 * Whether there is an enclosed floor yet: a room, or walls on some level that close into an
 * outline. One wall, or an outline still open, is a drawing in progress: the strip holds its
 * earthworks, checks and estimate back until it closes, so the first wall never reads as an error.
 */
export function outlineClosed(plan: Plan): boolean {
  if (plan.rooms.length > 0) return true
  return plan.levels.some(l => {
    const walls = plan.walls.filter(w => w.level === l.id && !isRetaining(w))
    return walls.length >= 3 && buildingOutline(planarFaces(walls)).outlines.length > 0
  })
}

/** What the strip says in place of its numbers until then. */
export const stripWaitText = (plan: Plan) => (floorDrawn(plan) ? 'Key numbers show here once the outline is closed: finish the walls back at the first corner.' : 'Key numbers show here once a floor is drawn.')
