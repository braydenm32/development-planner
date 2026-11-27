// Press, drag and release to draw a line, the habit from programs that draw a wall from press to
// release. With a tool that draws point to point (a wall, a retaining wall, a sketch line or
// circle, a measurement, a stair's direction, a section line), a press that moves past a few
// pixels puts the first point down where it was pressed, and the release is the next click: the
// same snapping, Shift square, Alt free, a typed length, one undo step, and a run carries on from
// where it was let go. A press that doesn't move is a click, exactly as before. PlanEditor asks
// `dragDraws` as a press starts and `pastSlop` as it moves.

import type { Tool } from '../plan/store'
import type { SketchMode } from '../sketch/store'

/** How far a mouse or pen has to move (px) before a press is a drag: the plan's click slop. */
export const DRAW_SLOP = 4

export interface DragDrawScene {
  tool: Tool
  /** The Wall tool's way of drawing: a rectangle room drags its own way (src/components/RectRoom.tsx). */
  wallMode: 'line' | 'rect'
  sketchMode: SketchMode
  /** A section line is being drawn (Design › Sections, X). */
  sectionLine: boolean
}

/**
 * Whether a press with the left button (or one finger) and a drag draws, rather than moving the
 * plan. Area and roof outlines are shapes, clicked corner by corner, and an arc takes three
 * points, so those still pan (and say how they draw: ./dragHint.ts).
 */
export function dragDraws(s: DragDrawScene): boolean {
  if (s.sectionLine) return true
  if (s.tool === 'wall') return s.wallMode === 'line'
  if (s.tool === 'sketch') return s.sketchMode !== 'arc'
  return s.tool === 'retaining' || s.tool === 'measure' || s.tool === 'stair'
}

/** Whether the pointer has moved far enough from the press (px) to be a drag: `slop` for a finger is larger. */
export const pastSlop = (from: { x: number; y: number }, to: { x: number; y: number }, slop = DRAW_SLOP): boolean => Math.hypot(to.x - from.x, to.y - from.y) > slop

/**
 * Whether a drag that starts at `press` (px) carries on a run whose last point is at `last` (px):
 * pressed on that point (within `near` px), the drag draws the next piece from it; pressed
 * elsewhere, the run so far ends and the drag starts a new one where it was pressed.
 */
export const continuesRun = (press: { x: number; y: number }, last: { x: number; y: number } | null, near = 10): boolean => !!last && Math.hypot(press.x - last.x, press.y - last.y) <= near
