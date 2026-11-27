// Click a wall's length on the plan and type the new one, there, as in other planners. The box
// reads what's typed as the wall's card does (a bare number is mm; 0.9 or 9m is metres), moves
// the end that disturbs less of the plan (ringed while the box is open), and keeps a length that
// can't be used in red with the reason. Enter keeps it (one undo step); Esc leaves it as it was.

import { cloneElement, useEffect, type ReactElement, type ReactNode, type RefObject, type SVGProps } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Plan, Wall } from '../plan/model'
import { usePlan } from '../plan/store'
import { stillerEnd } from '../plan/wallJoins'
import { DimBox } from './DimBox'
import { closeDimEdit, editWallLength, useDimEdit } from './dimStore'
import './pointer.css'

interface Args {
  plan: Plan
  /** The plan's SVG, where the labels are. */
  svg: RefObject<SVGSVGElement | null>
  /** Lengths can be typed here: the Select tool, where the house can be changed. */
  on: boolean
  S: (p: Vec2) => Vec2
  /** A point on the page (client pixels) in the house frame. */
  toHouse: (cx: number, cy: number) => Vec2
}

/** What a press says of itself. */
interface Press {
  button: number
  clientX: number
  clientY: number
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

export function useDimLabels({ plan, svg, on, S, toHouse }: Args) {
  const open = useDimEdit(s => s.open)
  const wall = open ? plan.walls.find(w => w.id === open.wall) : undefined
  // Another tool, another place, or the wall gone: the box goes too.
  useEffect(() => {
    if (open && (!on || !wall)) closeDimEdit()
  }, [open, on, wall])
  useEffect(() => closeDimEdit, [])

  /** A wall's length label, marked as one a click types into. */
  const label = (w: Wall, text: ReactNode): ReactNode => {
    const el = text as ReactElement<SVGProps<SVGTextElement> & { 'data-wall'?: string }> | null
    if (!on || !el) return text
    return cloneElement(el, { className: `${el.props.className ?? 'dim'} dim-click`, 'data-wall': w.id })
  }

  /**
   * A press on the plan: true when it landed on a wall's length, which picks the wall and opens
   * the box on the label. Found by where the labels are drawn, not by which element took the
   * press, because roofs and other layers are drawn over them.
   */
  const press = (e: Press): boolean => {
    if (!on || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return false
    // A label hidden to make room for another (src/components/declutter.ts) isn't there to click.
    for (const t of svg.current?.querySelectorAll<SVGTextElement>('text.dim-click:not(.crowded)') ?? []) {
      const r = t.getBoundingClientRect()
      const id = t.dataset.wall
      if (!id || e.clientX < r.left - 2 || e.clientX > r.right + 2 || e.clientY < r.top - 2 || e.clientY > r.bottom + 2) continue
      usePlan.getState().select({ type: 'wall', id })
      editWallLength(id, toHouse(r.left + r.width / 2, r.top + r.height / 2))
      return true
    }
    return false
  }

  const at = open ? S(open.at) : null
  const shows = !!open && !!wall && on
  const html = shows && wall && at ? <DimBox key={wall.id} plan={plan} wall={wall} x={at[0]} y={at[1]} /> : null
  // The end that will move, ringed on the plan while the box is open (as the card's Length box rings it).
  const end = shows && wall ? S(wall[stillerEnd(plan, wall.id)]) : null
  const ring = end ? <circle className="moving-end" cx={end[0]} cy={end[1]} r={12} /> : null
  return { label, press, html, ring }
}
