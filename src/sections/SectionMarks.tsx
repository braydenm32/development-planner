// What sections add to the plan editor, kept out of PlanEditor itself (as the design flow is):
// drawing a section line with two clicks, and the lines with their A–A marks while Design ›
// Sections is open. PlanEditor hands it the pointer, clicks and keys first, and renders `over`.

import { useState, type ReactNode } from 'react'
import type { Vec2 } from '../lib/geom'
import { tabRoute } from '../nav/route'
import { navigate, useRouter } from '../nav/router'
import type { Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import { addSection, MIN_SECTION, sectionsOf, snapEnd } from './lines'
import { Mark, Preview } from './MarkSvg'
import { showDrawing, startSectionLine, stopSectionLine, useSections } from './store'
import './sections.css'

/** The key that starts a section line on the plan (L and E belong to other tools). */
export const SECTION_KEY = 'X'

/** Whether Design › Sections is open. */
const onSectionsTab = (r: ReturnType<typeof useRouter.getState>['route']) => r.kind === 'app' && r.area === 'design' && r.tab === 'sections'

/** Start drawing a section line: from the tab's button, the X key or ⌘K. Opens Design › Sections, where its drawing shows. */
export function beginSectionLine() {
  const r = useRouter.getState().route
  if (!onSectionsTab(r)) navigate(tabRoute(r, 'design', 'sections'))
  startSectionLine()
}

export interface SectionMarksArgs {
  plan: Plan
  /** House frame to screen pixels. */
  S: (p: Vec2) => Vec2
  /** Pixels per metre. */
  k: number
  /** A phone in View: nothing is drawn. */
  viewOnly: boolean
}

export function useSectionMarks({ plan, S, k, viewOnly }: SectionMarksArgs) {
  const route = useRouter(s => s.route)
  const drawing = useSections(s => s.drawing)
  const shown = useSections(s => s.shown)
  const [cursor, setCursor] = useState<{ p: Vec2; free: boolean } | null>(null)
  const lines = sectionsOf(plan)
  const active = !!drawing && !viewOnly
  const visible = active || onSectionsTab(route)

  /** The end of the line being drawn, at the pointer. */
  const end = (p: Vec2, free: boolean) => (drawing?.a ? snapEnd(drawing.a, p, free) : p)

  const move = (world: Vec2, free: boolean) => {
    if (active) setCursor({ p: world, free })
    else if (cursor) setCursor(null)
  }

  /** A click: true when sections used it. */
  const click = (world: Vec2, free: boolean): boolean => {
    if (active && drawing) {
      if (!drawing.a) {
        useSections.setState({ drawing: { a: world } })
        return true
      }
      const b = end(world, free)
      if (Math.hypot(b[0] - drawing.a[0], b[1] - drawing.a[1]) < MIN_SECTION) return true
      const st = usePlan.getState()
      const cur = st.plan
      if (!cur) return true
      const { plan: next, line } = addSection(cur, drawing.a, b)
      st.commit(() => next)
      stopSectionLine()
      setCursor(null)
      showDrawing({ kind: 'section', id: line.id })
      return true
    }
    // On the Sections tab, a click on a line shows its drawing.
    if (visible) {
      const hit = lines.find(l => distToSegment(S(world), S(l.a), S(l.b)) < 8)
      if (hit) {
        showDrawing({ kind: 'section', id: hit.id })
        return true
      }
    }
    return false
  }

  /** X starts a line, Esc stops one. True when the key was used. */
  const key = (e: KeyboardEvent): boolean => {
    if (e.key === 'Escape' && drawing) {
      stopSectionLine()
      setCursor(null)
      return true
    }
    if (e.key.toUpperCase() === SECTION_KEY && !e.metaKey && !e.ctrlKey && !e.altKey && !viewOnly) {
      beginSectionLine()
      return true
    }
    return false
  }

  const hint = !active ? null : drawing?.a ? 'Click where the section ends. It keeps square to the house; Shift draws it at any angle. Esc stops.' : 'Click where the section starts, then where it ends. Esc stops.'

  let over: ReactNode = null
  if (visible) {
    const sel = shown?.kind === 'section' ? shown.id : null
    over = (
      <g className="sec-marks">
        {lines.map(l => (
          <Mark key={l.id} line={l} S={S} on={l.id === sel} />
        ))}
        {active && drawing?.a && cursor && <Preview a={drawing.a} b={end(cursor.p, cursor.free)} S={S} k={k} />}
        {active && !drawing?.a && cursor && <circle className="sec-start" cx={S(cursor.p)[0]} cy={S(cursor.p)[1]} r={4} />}
      </g>
    )
  }
  return { active, move, click, key, hint, over }
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
