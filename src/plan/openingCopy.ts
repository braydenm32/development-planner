// Copying a door or window on its own: where the copy goes in a wall, clear of the corners and of
// the doors and windows already there.

import { newId, type Opening, type Plan, type Wall } from './model'
import { wallClear } from './openingFit'

/** The gap left between a copy and its neighbours when there's room for one (m). */
export const COPY_GAP = 0.1

/**
 * Where a door or window `width` wide can go in a wall, as its centre's distance from the wall's
 * start: the free spot nearest `want`, between the corners and the openings already in the wall.
 * Null when no gap in the wall is wide enough.
 */
export function freeSpot(plan: Plan, wall: Wall, width: number, want: number): number | null {
  const run = wallClear(plan.walls, wall)
  const taken = plan.openings
    .filter(o => o.wall === wall.id)
    .map(o => [o.offset - o.width / 2, o.offset + o.width / 2] as const)
    .sort((a, b) => a[0] - b[0])
  const gaps: [number, number][] = []
  let from = run.from
  for (const [s, e] of taken) {
    if (s > from) gaps.push([from, Math.min(s, run.to)])
    from = Math.max(from, e)
  }
  if (run.to > from) gaps.push([from, run.to])
  let best: number | null = null
  for (const [s, e] of gaps) {
    const spare = e - s - width
    if (spare < -1e-9) continue
    const pad = Math.min(COPY_GAP, Math.max(0, spare) / 2)
    const at = Math.min(Math.max(want, s + width / 2 + pad), e - width / 2 - pad)
    // The nearest spot wins; of two as near, the one further along the wall.
    if (best === null || Math.abs(at - want) <= Math.abs(best - want) + 1e-9) best = at
  }
  return best === null ? null : Math.round(best * 1e4) / 1e4
}

/**
 * Put a copy of a door or window in a wall: beside the original when it's the same wall, else at
 * the same distance along. Returns the plan with the copy and the copy's id, or null when the
 * wall has no room for one that wide.
 */
export function copyOpeningTo(plan: Plan, o: Opening, wall: Wall): { plan: Plan; id: string } | null {
  const want = o.wall === wall.id && plan.openings.some(x => x.id === o.id) ? o.offset + o.width + COPY_GAP : o.offset
  const offset = freeSpot(plan, wall, o.width, want)
  if (offset === null) return null
  const copy: Opening = { ...o, id: newId(o.kind), wall: wall.id, offset }
  return { plan: { ...plan, openings: [...plan.openings, copy] }, id: copy.id }
}
