// The tools that draw by clicking each point, said to someone who pressed and dragged instead
// (the habit from programs that draw a wall from press to release). Here a drag always moves the
// plan, with every tool, so the drag did that; the line says how the tool does draw.

import type { Tool } from '../plan/store'

const HINTS: Partial<Record<Tool, string>> = {
  wall: 'Walls are drawn click by click: click the start, then each corner. A drag moves the plan.',
  retaining: 'A retaining wall is drawn click by click: click its start, then each corner. A drag moves the plan.',
  area: 'An area is drawn click by click: click each corner in turn. A drag moves the plan.',
  roof: 'A roof outline is drawn click by click: click each corner in turn. A drag moves the plan.',
  stair: 'A stair takes two clicks: where it starts, then the way it goes up. A drag moves the plan.',
  measure: 'Measure with two clicks: one point, then another. A drag moves the plan.',
  sketch: 'Sketch lines are drawn click by click: click the start, then each point. A drag moves the plan.',
}

/**
 * What to say after a drag with a drawing tool, or null: only for the tools that draw from point
 * to point, and only before the first point is down (after that the person has found the way).
 */
export function dragHint(tool: Tool, o: { started: boolean; roofOutline?: boolean }): string | null {
  if (o.started) return null
  if (tool === 'roof' && !o.roofOutline) return null
  return HINTS[tool] ?? null
}

/** Whether a notice is one of these lines: the next click, which shows the person has it, takes it down. */
export const isDragHint = (notice: string | null): boolean => !!notice && Object.values(HINTS).includes(notice)
