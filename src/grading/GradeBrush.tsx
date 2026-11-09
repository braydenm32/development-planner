// What the grading brush adds to the plan editor, kept out of PlanEditor itself (as sections and
// the design flow are): painting with a drag, picking a level with a click, the painted areas, and
// the suggested retaining walls with Add and Dismiss. PlanEditor hands it the pointer, clicks and
// keys first, and renders `over`.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useCheckTrees } from '../checks/siteTrees'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { useRouter } from '../nav/router'
import { nearestContour, type ContourLine } from '../plan/contourPick'
import type { ContourRun } from '../plan/finishedContours'
import { fromSite, toSite, type Plan } from '../plan/model'
import { usePlan, type Tool } from '../plan/store'
import type { Earth } from '../plan/useEarthworks'
import { areaLabelAt, areaName, areaOutline, paintPlan, strokeCells } from './model'
import { BRUSH_KEY, beginBrush, setBrushLevel, stepBrushRadius, stopBrush, stopLevelPick, useBrush } from './store'
import { addSuggestion, dismissWall } from './actions'
import { Suggested } from './SuggestedWall'
import { placeTags } from './tags'
import { planWallSuggestions } from './walls'
import './grading.css'

/** A contour this close to the pointer (px) is the one picked; a finger reaches further. */
const CONTOUR_PX = 7
const CONTOUR_TOUCH_PX = 18

export interface GradeBrushArgs {
  plan: Plan
  survey: Survey
  terrain: Terrain
  earth?: Earth | null
  tool: Tool
  /** House frame to screen pixels. */
  S: (p: Vec2) => Vec2
  /** Pixels per metre. */
  k: number
  /** The finished ground's contours, while the plan shows them. */
  finished: readonly ContourRun[] | null
  /** A phone in View: nothing paints, and suggestions only show. */
  viewOnly: boolean
  /** A finger, not a mouse: picking reaches further. */
  touch: boolean
}

/** Which Earthworks tab is open, if any. */
function earthTab(r: ReturnType<typeof useRouter.getState>['route']): string | null {
  return r.kind === 'app' && r.area === 'earthworks' ? (r.tab ?? 'cut-fill') : null
}

export function useGradeBrush(a: GradeBrushArgs) {
  const { plan, survey, terrain, earth, S, k, viewOnly } = a
  const route = useRouter(s => s.route)
  const tab = earthTab(route)
  const brush = useBrush()
  const trees = useCheckTrees()
  const active = brush.on && tab === 'cut-fill' && !viewOnly
  const painting = active && !brush.picking && (brush.mode === 'erase' || brush.rl !== null)
  const o = survey.origin
  // Survey coordinates (eastings, northings) to and from the house frame.
  const toAbs = (world: Vec2): Vec2 => {
    const s = toSite(world, plan.placement, o)
    return [s[0] + o[0], s[1] + o[1]]
  }
  const fromAbs = (p: Vec2): Vec2 => fromSite([p[0] - o[0], p[1] - o[1]], plan.placement, o)
  const SA = (p: Vec2) => S(fromAbs(p))

  const [cursor, setCursor] = useState<Vec2 | null>(null)
  const [strokePts, setStrokePts] = useState<Vec2[] | null>(null)
  const stroke = useRef<{ pts: Vec2[]; cells: Set<string> } | null>(null)

  // Leaving Cut & fill, or picking up a drawing tool, puts the brush down.
  useEffect(() => {
    if (brush.on && tab !== 'cut-fill') stopBrush()
  }, [brush.on, tab])
  useEffect(() => {
    if (a.tool !== 'select') stopBrush()
  }, [a.tool])

  const lines: ContourLine[] = useMemo(
    () => [...survey.contours.map(c => ({ z: c.z, pts: c.pts })), ...(a.finished ?? []).map(r => ({ z: r.z, pts: r.pts, finished: true }))],
    [survey, a.finished],
  )
  /** The level a click at a point picks: the contour under it, or the finished ground there, to the 10 mm. */
  const levelAt = (world: Vec2): { rl: number; contour: boolean } => {
    const local = toSite(world, plan.placement, o)
    const c = nearestContour(local, lines, (a.touch ? CONTOUR_TOUCH_PX : CONTOUR_PX) / k)
    if (c) return { rl: c.z, contour: true }
    const g = earth?.result.grid ?? terrain.grid
    return { rl: Math.round(g.sample(local[0], local[1]) * 100) / 100, contour: false }
  }

  /** Start a stroke: true when the brush took the pointer. */
  const down = (world: Vec2): boolean => {
    if (!painting) return false
    const p = toAbs(world)
    stroke.current = { pts: [p], cells: strokeCells([p], brush.radius, plan.grading?.cell) }
    setStrokePts([world])
    setCursor(world)
    return true
  }

  const move = (world: Vec2) => {
    if (!active) {
      if (cursor) setCursor(null)
      return
    }
    setCursor(world)
    const st = stroke.current
    if (!st) return
    const p = toAbs(world)
    const last = st.pts[st.pts.length - 1]
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < Math.min(brush.radius / 3, 0.25)) return
    strokeCells([last, p], brush.radius, plan.grading?.cell, st.cells)
    st.pts.push(p)
    setStrokePts(pts => [...(pts ?? []), world])
  }

  /** The end of a stroke: it goes into the plan as one undo step. True when there was one. */
  const up = (): boolean => {
    const st = stroke.current
    if (!st) return false
    stroke.current = null
    setStrokePts(null)
    const s = { mode: brush.mode, rl: brush.rl ?? undefined, cells: st.cells }
    const cur = usePlan.getState().plan
    if (cur && paintPlan(cur, s) !== cur) usePlan.getState().commit(p => paintPlan(p, s))
    return true
  }

  const cancel = () => {
    stroke.current = null
    setStrokePts(null)
  }

  /** A click while picking a level: true when it was used. */
  const click = (world: Vec2): boolean => {
    if (!active || !brush.picking) return false
    setBrushLevel(levelAt(world).rl)
    return true
  }

  /** B picks the brush up or puts it down, Esc stops picking or puts it down, [ and ] change its size. True when the key was used. */
  const key = (e: KeyboardEvent): boolean => {
    if (e.metaKey || e.ctrlKey || e.altKey || viewOnly) return false
    if (e.key.toUpperCase() === BRUSH_KEY) {
      if (active) stopBrush()
      else beginBrush()
      return true
    }
    if (!active) return false
    if (e.key === 'Escape') {
      cancel()
      if (brush.picking) stopLevelPick()
      else stopBrush()
      return true
    }
    if (e.key === '[' || e.key === ']') {
      stepBrushRadius(e.key === ']' ? 1 : -1)
      return true
    }
    return false
  }

  const levelText = brush.rl !== null ? `RL ${brush.rl.toFixed(2)}` : 'a level'
  const hint = !active
    ? null
    : brush.picking
      ? 'Click a contour, or a spot on the ground, for the level to paint to. Esc stops.'
      : brush.mode === 'erase'
        ? `Drag over painted ground to rub it out. [ and ] change the brush size; Esc stops.`
        : `Drag to paint ground to ${brush.mode === 'cut' ? 'cut down' : 'fill up'} to ${levelText}. [ and ] change the brush size; Esc stops.`

  // ---- what it draws ----
  const g = plan.grading
  const path = (pts: Vec2[], close = true) => (pts.length ? `M${pts.map(p => SA(p).map(n => n.toFixed(1)).join(' ')).join('L')}${close ? 'Z' : ''}` : '')
  const suggestions = tab === 'cut-fill' || tab === 'retaining-walls' ? planWallSuggestions(plan, survey, earth ?? null, trees) : []
  let under: ReactNode = null
  let over: ReactNode = null
  if (tab) {
    const c = g?.cell ?? 0.5
    under = (
      <g className="grade-marks">
        {g?.areas.map(ar => {
          const fill = ar.rows.map(([j, i0, i1]) => path([[i0 * c, j * c], [(i1 + 1) * c, j * c], [(i1 + 1) * c, (j + 1) * c], [i0 * c, (j + 1) * c]])).join('')
          const edge = areaOutline(ar, c).map(([p, q]) => path([p, q], false)).join('')
          return (
            <g key={ar.id} className={`grade-area ${ar.mode}`}>
              <path className="grade-fill" d={fill} />
              <path className="grade-edge" d={edge} />
            </g>
          )
        })}
      </g>
    )
    over = (
      <g className="grade-marks">
        {g?.areas.map(ar => {
          const at = areaLabelAt(ar, c)
          if (!at) return null
          const [lx, ly] = SA(at)
          return (
            <text key={ar.id} className="grade-label" x={lx} y={ly} textAnchor="middle" dominantBaseline="middle">
              {areaName(ar)}
            </text>
          )
        })}
        {!strokePts &&
          (() => {
            const scr = (p: Vec2) => S(fromSite(p, plan.placement, o))
            const ends = suggestions.map(s => ({ A: scr(s.a), B: scr(s.b), height: s.height }))
            const at = placeTags(ends, !viewOnly)
            return [
              ...suggestions.map((s, n) => <path key={`l${n}`} className="grade-suggest-line" d={`M${s.path.map(p => scr(p).map(v => v.toFixed(1)).join(' ')).join('L')}`} />),
              ...suggestions.map((s, n) => (
                <Suggested key={s.key} n={n + 1} s={s} at={at[n]} readOnly={viewOnly} onAdd={() => addSuggestion(s, survey, terrain.grid)} onDismiss={() => dismissWall(s, o)} />
              )),
            ]
          })()}
        {strokePts && strokePts.length > 0 && (
          <path
            className={`grade-stroke ${brush.mode}`}
            d={strokePts.length === 1 ? `M${S(strokePts[0]).join(' ')}l0.01 0` : `M${strokePts.map(p => S(p).map(n => n.toFixed(1)).join(' ')).join('L')}`}
            strokeWidth={Math.max(2, brush.radius * 2 * k)}
          />
        )}
        {active && cursor && !brush.picking && (
          <g className={`grade-cursor ${brush.mode}`}>
            <circle cx={S(cursor)[0]} cy={S(cursor)[1]} r={Math.max(3, brush.radius * k)} />
            <text x={S(cursor)[0]} y={S(cursor)[1] - brush.radius * k - 6} textAnchor="middle">
              {brush.mode === 'erase' ? 'Eraser' : `${brush.mode === 'cut' ? 'Cut' : 'Fill'} to ${levelText}`}
            </text>
          </g>
        )}
        {active && cursor && brush.picking && (
          <g className="grade-pick">
            <circle cx={S(cursor)[0]} cy={S(cursor)[1]} r={4} />
            <text x={S(cursor)[0] + 10} y={S(cursor)[1] - 10}>
              {(() => {
                const l = levelAt(cursor)
                return `${l.contour ? 'Contour' : 'Ground'} RL ${l.rl.toFixed(2)}`
              })()}
            </text>
          </g>
        )}
      </g>
    )
  }
  return { active, painting, down, move, up, cancel, click, key, hint, under, over }
}
