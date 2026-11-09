// What the live section strip adds to the plan editor, kept out of PlanEditor itself (as the
// sections and the design flow are): the cut line across the plan, with its ends and middle to
// drag, and the strip under the plan. PlanEditor renders `over` in its drawing and `html` beside it.

import { useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { fromSite, type Plan } from '../plan/model'
import type { Earth } from '../plan/useEarthworks'
import { snapEnd } from '../sections/lines'
import { bearingToLineUp, defaultCut } from './geometry'
import { SectionStrip } from './SectionStrip'
import { setCut, useStrip, type Cut } from './store'

export interface SectionStripArgs {
  /** The strip shows here: Design or Earthworks, in the app's frame. */
  shows: boolean
  plan: Plan
  survey: Survey
  terrain: Terrain
  earth?: Earth | null
  S: (p: Vec2) => Vec2
  /** A point on the page (clientX, clientY) in the house frame. */
  toHouse: (cx: number, cy: number) => Vec2
  k: number
  width: number
  left: number
  right: number
  /** The project, whose cut is remembered. */
  projectKey: string | null
  /** Levels, eaves and the cut can be dragged; a phone, or a plan for looking at, only views. */
  editable: boolean
  /** The cut's handles show: Select is the tool. */
  handles: boolean
  phone: boolean
  /** Set the plan's top of view. */
  onUp: (up: number) => void
}

export function useSectionStrip(a: SectionStripArgs): { over: ReactNode; html: ReactNode } {
  const { shows, plan, survey, S, toHouse, k, projectKey, editable, handles, phone } = a
  const key = projectKey ?? 'this-view'
  const stored = useStrip(s => s.cuts[key])
  const open = useStrip(s => s.open)
  const boundary = useMemo(() => survey.boundary.map(p => fromSite(p, plan.placement, survey.origin)), [survey, plan.placement])
  // Until it's moved, the cut follows the house as it's drawn.
  const auto = useMemo(() => defaultCut(plan, boundary), [plan, boundary])
  const cut = stored ?? auto
  const drag = useRef<{ end: 'a' | 'b' | 'mid'; from: Vec2; start: Cut } | null>(null)

  if (!shows) return { over: null, html: null }

  const down = (e: ReactPointerEvent<SVGElement>, end: 'a' | 'b' | 'mid') => {
    if (e.button !== 0) return
    // The plan's own press (select, pan) never sees it.
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { end, from: toHouse(e.clientX, e.clientY), start: cut }
  }
  const move = (e: ReactPointerEvent<SVGElement>, keep = false) => {
    const d = drag.current
    if (!d) return
    const p = toHouse(e.clientX, e.clientY)
    let next: Cut
    if (d.end === 'mid') {
      const dx = p[0] - d.from[0]
      const dy = p[1] - d.from[1]
      next = { a: [d.start.a[0] + dx, d.start.a[1] + dy], b: [d.start.b[0] + dx, d.start.b[1] + dy] }
    } else {
      // An end keeps the cut square to the house (or at 45°) unless Shift is held, as a section line does.
      const other = d.end === 'a' ? d.start.b : d.start.a
      const q = snapEnd(other, p, e.shiftKey)
      if (Math.hypot(q[0] - other[0], q[1] - other[1]) < 2) return
      next = d.end === 'a' ? { a: q, b: other } : { a: other, b: q }
    }
    const round = (v: Vec2): Vec2 => [Math.round(v[0] * 1000) / 1000, Math.round(v[1] * 1000) / 1000]
    setCut(key, { a: round(next.a), b: round(next.b) }, keep)
  }
  const up = (e: ReactPointerEvent<SVGElement>) => {
    if (!drag.current) return
    move(e, true)
    drag.current = null
  }

  const pa = S(cut.a)
  const pb = S(cut.b)
  const mid: Vec2 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]
  // The label sits by whichever end is on the left of the screen, or the top one of a cut running up it.
  const lead = Math.abs(pa[0] - pb[0]) > 1 ? (pa[0] < pb[0] ? pa : pb) : pa[1] < pb[1] ? pa : pb
  const grab = editable && handles && open
  const over = (
    <g className={`sstrip-cut${open ? '' : ' folded'}`}>
      <line className="line" x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} />
      <text className="tag" x={lead[0] + 8} y={lead[1] - 8}>
        Section
      </text>
      {grab &&
        (['a', 'b'] as const).map(end => {
          const p = end === 'a' ? pa : pb
          return (
            <circle key={end} className="end" cx={p[0]} cy={p[1]} r={6} onPointerDown={e => down(e, end)} onPointerMove={e => move(e)} onPointerUp={up}>
              <title>Drag to swing the section's cut (Shift for any angle)</title>
            </circle>
          )
        })}
      {grab && (
        <rect className="mid" x={mid[0] - 6} y={mid[1] - 6} width={12} height={12} rx={2} transform={`rotate(45 ${mid[0]} ${mid[1]})`} onPointerDown={e => down(e, 'mid')} onPointerMove={e => move(e)} onPointerUp={up}>
          <title>Drag to move the section's cut across the plan</title>
        </rect>
      )}
    </g>
  )
  const html = (
    <SectionStrip
      plan={plan}
      survey={survey}
      terrain={a.terrain}
      earth={a.earth}
      S={S}
      k={k}
      width={a.width}
      left={a.left}
      right={a.right}
      cut={cut}
      alongHouse={!stored}
      onReset={() => setCut(key, null)}
      onLineUp={() => a.onUp(bearingToLineUp(cut, plan.placement.rotation))}
      editable={editable}
      phone={phone}
    />
  )
  return { over, html }
}
