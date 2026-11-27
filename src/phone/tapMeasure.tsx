// Measure in View on a phone (PH-29): with Measure on (the ruler in the view buttons), a tap puts
// down the first point, which stays marked, and a second tap reads the distance, the height and
// the ground's level at each end, as Edit's Measure does (src/measure). The points snap as every
// tool's do. Nothing is kept: View changes nothing. A third tap starts again. With Measure off, a
// tap on the ground reads its level, as before.

import { useEffect, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { measure, measureText } from '../measure/measure'
import type { Plan } from '../plan/model'
import { forTouch } from './words'

/** Whether the View ruler is on; `n` counts the times it was turned on or off, so each time starts afresh. */
export const useTapMeasureOn = create<{ on: boolean; n: number }>(() => ({ on: false, n: 0 }))
export const setTapMeasure = (on: boolean) => useTapMeasureOn.setState(s => (s.on === on ? s : { on, n: s.n + 1 }))

/** The points after a tap at `p`: a first point, the second, or (after both) a new first. */
export const nextPoints = (pts: Vec2[], p: Vec2): Vec2[] => (pts.length === 1 ? [pts[0], p] : [p])

/** What the card says before the numbers: where to tap next. */
export const tapMeasureHint = (placed: number, touch?: boolean) =>
  forTouch(placed === 0 ? 'Click a point on the plan, then a second point, to read the distance between them.' : 'Click the second point.', touch)

interface Args {
  /** A phone's plan in View. */
  on: boolean
  plan: Plan
  level: string
  survey: Survey
  terrain: Terrain
  /** House frame to screen pixels. */
  S: (p: Vec2) => Vec2
  /** The plan's own snapping. */
  snapAt: (raw: Vec2, o: { anchor?: Vec2 | null; points?: Vec2[]; free: boolean }) => Vec2
}

const mm = (n: number) => `${Math.round(n * 1000)} mm`

export function useTapMeasure({ on: canvasOn, plan, level, survey, terrain, S, snapAt }: Args) {
  const picked = useTapMeasureOn(s => s.on)
  const on = canvasOn && picked
  // Its points belong to one floor and one turn of the ruler: either changing starts afresh.
  const key = `${level}|${useTapMeasureOn(s => s.n)}`
  const [ruler, setRuler] = useState<{ key: string; pts: Vec2[] }>({ key, pts: [] })
  const pts = on && ruler.key === key ? ruler.pts : []
  // Edit has Measure on its rail; leaving View or the plan puts this one down.
  useEffect(() => {
    if (!canvasOn) setTapMeasure(false)
  }, [canvasOn])
  useEffect(() => () => setTapMeasure(false), [])

  /** A tap on the plan in View: true when Measure took it. */
  const tap = (world: Vec2, free: boolean): boolean => {
    if (!on) return false
    const first = pts.length === 1 ? pts[0] : null
    const p = snapAt(world, { anchor: first, points: first ? [first] : [], free })
    setRuler({ key, pts: nextPoints(pts, p) })
    return true
  }

  const m = pts.length === 2 ? measure(pts[0], pts[1], plan.placement, survey, terrain.grid) : null
  const txt = m && measureText(m)

  const over: ReactNode =
    on && pts.length ? (
      <g className="measure-line tap-measure">
        {pts.length === 2 && <path d={`M${pts.map(p => S(p).join(' ')).join('L')}`} />}
        {/* The first point stays marked, so the second tap knows where it measures from. */}
        <circle className="tap-measure-ring" cx={S(pts[0])[0]} cy={S(pts[0])[1]} r={11} />
        {pts.map((p, i) => (
          <circle key={i} cx={S(p)[0]} cy={S(p)[1]} r={5} />
        ))}
        {m && (
          <text x={(S(pts[0])[0] + S(pts[1])[0]) / 2} y={(S(pts[0])[1] + S(pts[1])[1]) / 2 - 10} textAnchor="middle">
            {mm(m.flat)}
          </text>
        )}
      </g>
    ) : null

  const html: ReactNode = on ? (
    <div className="measure-card tap-measure-card" role="status" aria-live="polite">
      {m && txt ? (
        <>
          <span>
            Flat <b>{txt.flat}</b>
          </span>
          <span>
            Along the ground <b>{txt.sloped}</b>
          </span>
          <span>
            Height <b>{txt.rise}</b>
          </span>
          {m.rlA !== null && m.rlB !== null && (
            <span className="muted">
              Ground RL {m.rlA.toFixed(2)} → {m.rlB.toFixed(2)}
            </span>
          )}
        </>
      ) : (
        <span className="muted">{tapMeasureHint(pts.length)}</span>
      )}
      <button className="secondary small" onClick={() => setTapMeasure(false)}>
        Done
      </button>
    </div>
  ) : null

  return { on, tap, over, html }
}
