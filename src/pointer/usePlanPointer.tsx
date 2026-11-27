// The mouse and keyboard habits people bring from other planners, gathered for the plan
// (src/components/PlanEditor.tsx) so it stays out of that file: Space and drag to pan, the
// right-click menu, a wall's length typed on its label, the grid, and the badge that says
// snapping is off. PlanEditor calls this once and puts what it returns where it belongs.

import type { ReactNode, RefObject } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Plan } from '../plan/model'
import type { SnapResult } from '../plan/snap'
import { useDimLabels } from './useDimLabels'
import { PlanGrid } from './PlanGrid'
import { PlanMenu } from './PlanMenu'
import { useSpacePan } from './spacePan'
import './pointer.css'

interface Args {
  plan: Plan
  svg: RefObject<SVGSVGElement | null>
  /** House frame to plan pixels, and back. */
  S: (p: Vec2) => Vec2
  W: (sx: number, sy: number) => Vec2
  k: number
  size: { w: number; h: number }
  /** The house can be changed here (not a phone in View, not a shared link). */
  edits: boolean
  /** A wall's length can be typed on its label: Select, with nothing else taking the clicks. */
  lengths: boolean
  /** The snapped pointer while drawing or dragging, and whether it's one snapping applies to. */
  cursor: SnapResult | null
  snaps: boolean
}

export function usePlanPointer({ plan, svg, S, W, k, size, edits, lengths, cursor, snaps }: Args) {
  const space = useSpacePan(svg)
  const dims = useDimLabels({
    plan,
    svg,
    on: lengths,
    S,
    toHouse: (cx, cy) => {
      const r = svg.current!.getBoundingClientRect()
      return W(cx - r.left, cy - r.top)
    },
  })
  const at = cursor && snaps && cursor.kind === 'free' ? S(cursor.p) : null
  return {
    /** Space and drag: `grab()` as a press starts (true: it pans), `release()` as it ends (true: it was a pan, nothing is clicked). */
    space,
    /** Marks a wall's length label as one a click types into; `dimPress` is true when a press landed on one (and took it). */
    dimLabel: dims.label,
    dimPress: dims.press,
    /** Inside the plan's SVG, under everything drawn. */
    under: <PlanGrid S={S} k={k} size={size} /> as ReactNode,
    /** Inside the plan's SVG, over everything: the end a typed length moves, and "Snapping off" beside the pointer while it is. */
    over: (
      <>
        {dims.ring}
        {at && (
          <text className="snap-off-tag" x={at[0] + 14} y={at[1] + 24}>
            Snapping off
          </text>
        )}
      </>
    ) as ReactNode,
    /** Beside the SVG: the box a length is typed in, and the right-click menu. */
    html: (
      <>
        {dims.html}
        <PlanMenu on={edits} middle={[size.w / 2, size.h / 2]} toHouse={p => W(p[0], p[1])} />
      </>
    ) as ReactNode,
  }
}
