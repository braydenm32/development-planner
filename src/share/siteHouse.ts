// The house as a site plan draws it: every level that sits on the ground filled, each with its
// own floor level, and only the storeys over another level dashed. The rings are the ones
// Earthworks › Place and Approvals › Checks measure the setbacks from (every level's outline, to
// the outside of its walls), so the printed setbacks are theirs.

import { stacking } from '../checks/measure'
import type { Vec2 } from '../lib/geom'
import { buildingOutline, planarFaces } from '../plan/geometry'
import { floorRL, houseWalls, sortedLevels, type Level, type Plan } from '../plan/model'

export interface HouseOnSite {
  /** Every level's outline rings (house frame), lowest level first. */
  rings: Vec2[][]
  /** The levels on the ground (not over a lower level): a split level beside the lowest one is here. */
  ground: { level: Level; rings: Vec2[][]; rl: number }[]
  /** The outlines of the levels over a lower one: the upper storeys. */
  upper: Vec2[][]
}

export function houseOnSite(plan: Plan): HouseOnSite {
  const levels = sortedLevels(plan)
  const by = levels.map(l => buildingOutline(planarFaces(houseWalls(plan.walls.filter(w => w.level === l.id)))).outlines)
  // The same rule the checks count storeys by: a level beside the others isn't an upper floor.
  const over = stacking(by).over
  return {
    rings: by.flat(),
    ground: levels.flatMap((level, i) => (over[i] || !by[i].length ? [] : [{ level, rings: by[i], rl: floorRL(plan, level.id) }])),
    upper: by.filter((_, i) => over[i]).flat(),
  }
}
