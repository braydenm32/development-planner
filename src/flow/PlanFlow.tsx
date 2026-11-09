// What the design flow adds to the plan editor, kept out of PlanEditor itself: the hover tooltip,
// picking a contour for a floor level, clicking a retaining wall's earth side, and the small cards
// that ask a new room's floor type and offer a retaining wall. PlanEditor hands it the pointer,
// clicks and keys first, and renders what it returns.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { pointInPolygon, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { nearestContour, type ContourLine } from '../plan/contourPick'
import type { ContourRun } from '../plan/finishedContours'
import { fromSite, levelById, toSite, wallLength, type Plan, type Wall } from '../plan/model'
import { retainingProfile } from '../plan/retaining'
import { setEarthSide, SIDE_PICK_CLEAR, sideOfWall, stopSidePick, useRetaining } from '../plan/retainingSession'
import type { Tool } from '../plan/store'
import type { Earth } from '../plan/useEarthworks'
import type { SiteFeature } from '../site/model'
import { useSiteFeatures } from '../site/store'
import { FlowCards } from './FlowCards'
import { EarthSide, Tag } from './PlanMarks'
import { cancelContourPick, pickContour, setFlowGround, startContourPick, useFlow } from './store'
import { tooltipText, type TipSubject } from './tooltip'
import './flow.css'

/** How long the pointer rests on something before its tooltip shows (ms). */
export const TOOLTIP_DELAY = 400

/** A contour this close to the pointer (px) is the one under it; a finger reaches further. */
const CONTOUR_PX = 7
const CONTOUR_TOUCH_PX = 18

export interface PlanFlowArgs {
  plan: Plan
  level: string
  tool: Tool
  survey: Survey
  terrain: Terrain
  earth?: Earth | null
  /** House frame to screen pixels. */
  S: (p: Vec2) => Vec2
  /** Pixels per metre. */
  k: number
  size: { w: number; h: number }
  /** What a click at a point would pick: the plan's own hit test. */
  pickAt: (world: Vec2, sx: number, sy: number) => TipSubject | null
  /** The finished ground's contours, while the plan shows them. */
  finished: readonly ContourRun[] | null
  /** Site features' own tools have the plan. */
  siteActive: boolean
  /** A phone in View: taps read, nothing hovers. */
  viewOnly: boolean
}

export interface PointerInfo {
  /** A drag or a drawing gesture is under way. */
  dragging: boolean
  pointerType: string
  buttons: number
}

const fine = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

/** The site feature under a point (local frame), for the tooltip. */
export function siteFeatureAt(features: readonly SiteFeature[], p: Vec2, tol: number): SiteFeature | null {
  const near = (pts: Vec2[]) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const l2 = dx * dx + dy * dy
      const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
      if (Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) <= tol) return true
    }
    return false
  }
  // Points and lines first: they sit on top of the areas.
  for (const f of [...features].reverse()) {
    const g = f.geom
    if (g.kind === 'point') {
      const r = f.type === 'tree' ? Math.max((f.canopy ?? 0) / 2, (f.trunk ?? 0) / 2, tol) : tol * 1.5
      if (Math.hypot(p[0] - g.at[0], p[1] - g.at[1]) <= r) return f
    } else if (g.kind === 'line' && near(g.pts)) return f
  }
  for (const f of [...features].reverse()) if (f.geom.kind === 'area' && pointInPolygon(p[0], p[1], f.geom.pts)) return f
  return null
}

export function usePlanFlow(a: PlanFlowArgs) {
  const { plan, level, tool, survey, terrain, S, k, size } = a
  const picking = useFlow(s => s.picking)
  const sidePick = useRetaining(s => s.sidePick)
  const features = useSiteFeatures()
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)
  const [hover, setHover] = useState<{ world: Vec2; sx: number; sy: number } | null>(null)
  const timer = useRef(0)
  const live = useRef(a)
  useEffect(() => {
    live.current = a
  })

  useEffect(() => setFlowGround({ survey, natural: terrain.grid }), [survey, terrain])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // The level being picked for must still exist.
  useEffect(() => {
    if (picking && !levelById(plan, picking.level)) cancelContourPick()
  }, [picking, plan])

  const sideWall: Wall | undefined = sidePick ? plan.walls.find(w => w.id === sidePick) : undefined
  const active = !!picking || !!sideWall

  /** The contours a click can pick: the survey's own, and the finished ground's while they show. */
  const lines: ContourLine[] = useMemo(
    () => [...survey.contours.map(c => ({ z: c.z, pts: c.pts })), ...(a.finished ?? []).map(r => ({ z: r.z, pts: r.pts, finished: true }))],
    [survey, a.finished],
  )
  const contourAt = (world: Vec2) => nearestContour(toSite(world, plan.placement, survey.origin), lines, (fine() ? CONTOUR_PX : CONTOUR_TOUCH_PX) / k)

  const hideTip = () => {
    window.clearTimeout(timer.current)
    setTip(t => (t ? null : t))
  }

  /** What the tooltip says about whatever is under a point, or null for nothing. */
  const describe = (world: Vec2, sx: number, sy: number): string | null => {
    const cur = live.current
    const ground = cur.earth?.result.grid ?? cur.terrain.grid
    const ctx = {
      plan: cur.plan,
      retained: (w: Wall) => (wallLength(w) > 1e-3 ? retainingProfile(w, cur.plan, cur.survey.origin, ground).maxHeight : null),
    }
    const hit = cur.pickAt(world, sx, sy)
    if (hit) return tooltipText(hit, ctx)
    const local = toSite(world, cur.plan.placement, cur.survey.origin)
    const f = siteFeatureAt(features, local, 6 / cur.k)
    if (f) return tooltipText({ type: 'site', item: f }, ctx)
    const c = nearestContour(local, lines, CONTOUR_PX / cur.k)
    if (c) return tooltipText({ type: 'contour', z: c.z, finished: c.finished }, ctx)
    return null
  }

  const move = (world: Vec2, sx: number, sy: number, e: PointerInfo) => {
    if (active) {
      hideTip()
      setHover({ world, sx, sy })
      return
    }
    setHover(h => (h ? null : h))
    // Tooltips: a mouse resting on the plan with Select, never while dragging or drawing.
    hideTip()
    if (a.viewOnly || a.siteActive || tool !== 'select' || e.dragging || e.buttons !== 0 || e.pointerType !== 'mouse' || !fine()) return
    timer.current = window.setTimeout(() => {
      const text = describe(world, sx, sy)
      if (text) setTip({ text, x: sx, y: sy })
    }, TOOLTIP_DELAY)
  }

  const leave = () => {
    hideTip()
    setHover(null)
  }

  /** A click while picking: true when it was used. */
  const click = (world: Vec2): boolean => {
    hideTip()
    if (sideWall) {
      // A click on (or right beside) the wall's line is no answer: it's the second click of the
      // double-click that finished the wall, so keep waiting.
      const side = sideOfWall(sideWall, world, SIDE_PICK_CLEAR)
      if (side) {
        stopSidePick()
        const ground = a.earth?.result.grid ?? terrain.grid
        setEarthSide(sideWall.id, side, survey.origin, terrain.grid, retainingProfile(sideWall, plan, survey.origin, ground).maxHeight)
      }
      return true
    }
    if (picking) {
      const c = contourAt(world)
      if (c) pickContour(c.z)
      return true
    }
    return false
  }

  /** Esc stops picking. True when the key was used. */
  const key = (e: KeyboardEvent): boolean => {
    if (e.key !== 'Escape') return false
    hideTip()
    if (sideWall) {
      stopSidePick()
      return true
    }
    if (picking) {
      cancelContourPick()
      return true
    }
    return false
  }

  // ---- what it draws ----
  const path = (pts: Vec2[], close = false) => (pts.length ? `M${pts.map(p => S(p).map(n => n.toFixed(1)).join(' ')).join('L')}${close ? 'Z' : ''}` : '')
  let over: ReactNode = null
  if (picking && hover) {
    const c = contourAt(hover.world)
    const name = levelById(plan, picking.level)?.name ?? 'this floor'
    over = (
      <g className="flow-pick">
        {c && <path className="flow-pick-line" d={path(c.pts.map(p => fromSite(p, plan.placement, survey.origin)))} />}
        <Tag x={hover.sx} y={hover.sy} size={size} lines={c ? [`RL ${c.z.toFixed(2)}`, `Click to put ${name} here`] : ['Point at a contour line']} />
      </g>
    )
  } else if (sideWall && hover) {
    const side = sideOfWall(sideWall, hover.world, SIDE_PICK_CLEAR)
    if (side) over = <EarthSide wall={sideWall} side={side} S={S} k={k} at={[hover.sx, hover.sy]} size={size} />
  }

  const html = (
    <>
      {tip && (
        <div className="flow-tip" role="tooltip" style={{ left: Math.min(tip.x + 14, size.w - 12), top: tip.y + 18 }}>
          {tip.text}
        </div>
      )}
      {picking && (
        <div className="flow-bar" role="status">
          <span>
            Pick a contour for <b>{levelById(plan, picking.level)?.name}</b>: {fine() ? 'click' : 'tap'} a contour line to put its floor at that RL.
          </span>
          <button type="button" onClick={cancelContourPick}>
            Cancel <kbd>Esc</kbd>
          </button>
        </div>
      )}
      {sideWall && (
        <div className="flow-bar" role="status">
          <span>Click the side of the wall the earth is on.</span>
          <button type="button" onClick={stopSidePick}>
            Cancel <kbd>Esc</kbd>
          </button>
        </div>
      )}
      <FlowCards />
    </>
  )

  const chipAction = (
    <button type="button" className="flow-chip-btn" onClick={() => startContourPick(level)} title="Click a contour to put this floor at its level">
      Pick a contour
    </button>
  )

  return { active, move, leave, click, key, over, html, chipAction, hideTip }
}
