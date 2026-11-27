// A sentence that says what the plan and the 3D view show, for people who can't see them: each is
// a picture to a screen reader (role=img), named with this, and pointed to the lists and numbers
// that say the same in text (WCAG 1.1.1). Before, the plan read as an unnamed image followed by
// forty loose numbers, and the 3D view as nothing at all.

import { levelSummaries } from '../plan/keyNumbers'
import { houseWalls, levelById, sortedLevels, type Plan } from '../plan/model'

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Plan of Ground floor: 4 rooms, 113.2 m² floor area, 10 walls, 5 doors and windows, 1 outdoor area." */
export function planSummary(plan: Plan, levelId: string): string {
  const level = levelById(plan, levelId)
  const s = levelSummaries(plan).find(x => x.level.id === levelId)
  const walls = houseWalls(plan.walls.filter(w => w.level === levelId))
  const ids = new Set(walls.map(w => w.id))
  const openings = plan.openings.filter(o => ids.has(o.wall)).length
  const stairs = plan.stairs.filter(x => x.level === levelId).length
  const furniture = plan.furniture.filter(f => f.level === levelId).length
  const head = `Plan of ${level?.name ?? 'the house'}`
  if (!walls.length && !s?.areas.length) return `${head}: nothing drawn on this level yet.`
  const parts = [
    s?.rooms.length ? count(s.rooms.length, 'room') : null,
    s && s.gross.area > 0 ? `${s.gross.area.toFixed(1)} m² floor area` : null,
    count(walls.length, 'wall'),
    openings ? count(openings, 'door or window', 'doors and windows') : null,
    stairs ? count(stairs, 'stair') : null,
    furniture ? count(furniture, 'piece of furniture', 'pieces of furniture') : null,
    s?.areas.length ? count(s.areas.length, 'outdoor area') : null,
  ].filter(Boolean)
  return `${head}: ${parts.join(', ')}.`
}

/** Where the plan's content is in text, and its keys. `changes`: the house can be changed here (not Approvals, Share or a phone in View). */
export const planHelp = (changes: boolean) =>
  `The plan is a drawing. Its rooms, walls, doors, windows, stairs and furniture are listed in Design, under Rooms and areas, Walls and doors, and Furniture${changes ? ', where each can be picked, changed and deleted' : ''}. With the plan in focus: arrow keys move the view${changes ? ', or what is picked' : ''}; plus and minus zoom; 0 fits the house.`

/** "3D view of the block with the house on it: ground from RL 41.20 to RL 47.80; the house has 2 levels." */
export function sceneSummary(plan: Plan | null, ground: { minRL: number; maxRL: number }): string {
  const levels = plan ? sortedLevels(plan).filter(l => plan.walls.some(w => w.level === l.id && w.kind !== 'retaining')) : []
  const house = levels.length ? ` with the house on it: ground from RL ${ground.minRL.toFixed(2)} to RL ${ground.maxRL.toFixed(2)}; the house has ${count(levels.length, 'level')}` : `: ground from RL ${ground.minRL.toFixed(2)} to RL ${ground.maxRL.toFixed(2)}; no house drawn yet`
  return `3D view of the block${house}.`
}

export const SCENE_HELP = 'The 3D view is a picture. Its numbers are in Overview. With it in focus: left and right arrows turn the view, up and down tilt it, plus and minus zoom. Street view, From above and From the rear show each side.'
