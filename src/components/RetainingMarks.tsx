import { useMemo, type ReactNode } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import { fromSite, isRetaining, wallDir, wallLength, type Plan, type Wall } from '../plan/model'
import { engineerNote, needsEngineer, retainingProfile } from '../plan/retaining'
import './retaining.css'

interface Props {
  plan: Plan
  /** Walls on the level being drawn; only the retaining ones are marked. */
  walls: Wall[]
  origin: Vec2
  /** Finished ground, so the heights match the panel's. */
  ground: Heightfield
  /** The wall whose height is written beside it: the selected or new one. */
  show: string | null
  /** House frame to screen pixels, and pixels per metre. */
  toScreen: (p: Vec2) => Vec2
  k: number
  /** Tag every wall with the ground it holds ("H 1.3"): on Earthworks › Retaining walls. */
  tags?: boolean
  /** The wall whose row in a list is under the pointer: lit up. */
  hover?: string | null
  /** Ground a wall's height changes, lit while its height box has focus (survey local frame). */
  changed?: { cells: Vec2[]; cell: number } | null
}

/** Text along a line on screen reads left to right. */
function readable(a: Vec2, b: Vec2): number {
  let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
  if (ang > 90) ang -= 180
  if (ang < -90) ang += 180
  return ang
}

/**
 * On the plan: "Holds back up to …" beside the selected or new retaining wall, on the side it holds,
 * with a marker at its tallest point; and a quiet amber flag on every wall that needs an engineer (needsEngineer).
 * On Earthworks › Retaining walls every wall carries its height ("H 1.3"), and the one pointed at
 * in the list is lit up.
 */
export function RetainingMarks({ plan, walls, origin, ground, show, toScreen: S, k, tags = false, hover = null, changed = null }: Props) {
  const profiles = useMemo(
    () => walls.filter(w => isRetaining(w) && wallLength(w) > 0.05).map(w => retainingProfile(w, plan, origin, ground)),
    [walls, plan, origin, ground],
  )
  const changedPath = useMemo(() => {
    if (!changed?.cells.length) return ''
    const c = changed.cell
    const pt = (x: number, y: number) => S(fromSite([x, y], plan.placement, origin)).map(v => v.toFixed(1)).join(' ')
    return changed.cells.map(([x, y]) => `M${pt(x, y)}L${pt(x + c, y)}L${pt(x + c, y + c)}L${pt(x, y + c)}Z`).join('')
  }, [changed, plan.placement, origin, S])
  return (
    <g className="rw-marks">
      {changedPath && <path className="rw-changed" d={changedPath} />}
      {profiles.map(p => {
        const w = p.wall
        const d = wallDir(w)
        const hs = p.high === 'right' ? -1 : 1
        const n: Vec2 = [-d[1] * hs, d[0] * hs]
        const at = (s: number, off: number): Vec2 => [w.a[0] + d[0] * s + n[0] * off, w.a[1] + d[1] * s + n[1] * off]
        const len = p.length
        const t2 = w.thickness / 2
        const ang = readable(S(w.a), S(w.b))
        const tall = needsEngineer(p.maxHeight)
        const labelled = w.id === show
        const tallest = p.samples.reduce((m, x) => (Math.abs(x.left - x.right) > Math.abs(m.left - m.right) ? x : m), p.samples[0])
        const out: ReactNode[] = []
        // The height label sits on the side the wall holds, clear of its length.
        const text = `Holds back up to ${p.maxHeight.toFixed(2)} m`
        const fs = 12
        const pill = text.length * fs * 0.56 + 22
        const [lx, ly] = S(at(len / 2, t2 + 34 / k))
        if (labelled) {
          out.push(
            <g key="label" className="rw-label" transform={`translate(${lx} ${ly}) rotate(${ang})`}>
              <rect x={-pill / 2} y={-11} width={pill} height={22} rx={11} />
              <text textAnchor="middle" dominantBaseline="central">
                {text}
              </text>
            </g>,
          )
          if (p.maxHeight > 0.05) {
            const s = Math.min(Math.max(tallest.s, 0.3), len - 0.3)
            const [mx, my] = S(at(s, t2 + 12 / k))
            const [nx, ny] = S(at(s, t2 + 12 / k + 1))
            const turn = (Math.atan2(ny - my, nx - mx) * 180) / Math.PI + 90
            out.push(
              <g key="tallest" className="rw-tallest" transform={`translate(${mx} ${my}) rotate(${turn})`}>
                <title>Tallest point</title>
                <path d="M0 -8V8M-4 -4 0 -8 4 -4M-4 4 0 8 4 4" />
              </g>,
            )
          }
        }
        if (w.id === hover) {
          const [ax, ay] = S(w.a)
          const [bx, by] = S(w.b)
          out.unshift(<path key="hover" className="rw-hover" d={`M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`} />)
        }
        if (tags && !labelled) {
          // Short, to sit on every wall at once: the ground held, to 100 mm.
          const t = `H ${p.maxHeight.toFixed(1)}`
          const tw = t.length * 6.6 + 12
          out.push(
            <g key="tag" className={`rw-htag${tall ? ' tall' : ''}`} transform={`translate(${lx} ${ly}) rotate(${ang})`}>
              <title>{`Holds back up to ${p.maxHeight.toFixed(2)} m`}</title>
              <rect x={-tw / 2} y={-9} width={tw} height={18} rx={9} />
              <text textAnchor="middle" dominantBaseline="central">
                {t}
              </text>
            </g>,
          )
        }
        if (tall) {
          // Where the label goes, or just before it when it's showing.
          const r = (ang * Math.PI) / 180
          const back = labelled ? pill / 2 + 16 : tags ? 36 : 0
          out.push(
            <g key="flag" className="rw-flag" transform={`translate(${lx - Math.cos(r) * back} ${ly - Math.sin(r) * back})`}>
              <title>{engineerNote(p.maxHeight)}</title>
              <circle r={11} />
              <path d="M0 -6.5 7 5.5H-7Z" />
              <path d="M0 -2V1.8M0 3.4V3.6" />
            </g>,
          )
        }
        return <g key={w.id}>{out}</g>
      })}
    </g>
  )
}
