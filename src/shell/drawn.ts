import { isRetaining, type Plan } from '../plan/model'

/**
 * Whether a floor has been drawn: a room, or a wall that isn't a retaining wall. Until then the
 * strip's numbers (the floor level of nothing, checks that are all "not drawn yet") say nothing
 * useful, so it shows none.
 */
export const floorDrawn = (plan: Plan) => plan.rooms.length > 0 || plan.walls.some(w => !isRetaining(w))
