// What a click on a floor picks with the Select tool (CB-06): the room whose floor it is, then,
// on another click, what lies flat with it, a slab or deck drawn under it and the roof over it.
// Walls, doors, furniture, stairs and a room's label are picked before any of these (PlanEditor).

import { pointInPolygon, type Vec2 } from '../lib/geom'
import { faceAround, type Face } from './geometry'
import type { Plan, Roof } from './model'
import { roofAtPoint } from './roofPick'
import type { Selection } from './store'

/**
 * What lies flat under a point on a level, in the order clicks pick it: the room, an area, a roof.
 * `faces` are the level's closed spaces and `roofs` the roofs that show on it; `edge` is how near
 * a roof's edge counts as on it (m).
 */
export function floorStack(plan: Pick<Plan, 'rooms' | 'areas'>, level: string, faces: Face[], roofs: Roof[], at: Vec2, edge: number): Selection[] {
  const face = faceAround(at, faces)
  const room = face && plan.rooms.find(r => r.level === level && faceAround(r.at, faces) === face)
  const area = plan.areas.find(a => a.level === level && pointInPolygon(at[0], at[1], a.pts))
  const roof = roofAtPoint(roofs, at, edge)
  return [...(room ? [{ type: 'room' as const, id: room.id }] : []), ...(area ? [{ type: 'area' as const, id: area.id }] : []), ...(roof ? [{ type: 'roof' as const, id: roof.id }] : [])]
}

/** The one after the picked one, round again to the first; the first when none of them is picked. */
export function nextOnFloor(stack: Selection[], picked: (s: Selection) => boolean): Selection | null {
  if (!stack.length) return null
  return stack[(stack.findIndex(picked) + 1) % stack.length]
}
