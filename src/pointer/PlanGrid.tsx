// The grid under the plan, when the Key's Grid switch is on: squares in the house's own frame
// (so walls drawn square sit on its lines), 1 m to a square at most zooms, finer zoomed in and
// bigger zoomed out, with a bolder line every few. Points snap every 50 mm, so every line is one
// they can land on. And the two switches themselves, for the Key.

import type { Vec2 } from '../lib/geom'
import { gridSteps } from './grid'
import { FREE_KEY, useSnapping } from './snapping'
import './pointer.css'

const sizeText = (m: number) => (m < 1 ? `${Math.round(m * 1000)} mm` : `${m} m`)

export function PlanGrid({ S, k, size }: { S: (p: Vec2) => Vec2; k: number; size: { w: number; h: number } }) {
  const on = useSnapping(s => s.grid)
  if (!on) return null
  const o = S([0, 0])
  const x = S([1, 0])
  const y = S([0, 1])
  // The house frame to the screen, so the squares turn with the plan.
  const matrix = `matrix(${(x[0] - o[0]).toFixed(4)} ${(x[1] - o[1]).toFixed(4)} ${(y[0] - o[0]).toFixed(4)} ${(y[1] - o[1]).toFixed(4)} ${o[0].toFixed(2)} ${o[1].toFixed(2)})`
  const { fine, bold } = gridSteps(k)
  const tile = (id: string, step: number, cls: string) => (
    <pattern id={id} patternUnits="userSpaceOnUse" width={step} height={step} patternTransform={matrix}>
      {/* Each line is drawn on both edges of the square, half of it inside each. */}
      <path className={cls} d={`M0 0V${step}M${step} 0V${step}M0 0H${step}M0 ${step}H${step}`} strokeWidth={1 / k} />
    </pattern>
  )
  return (
    <g className="plan-grid" aria-hidden="true">
      <defs>
        {tile('plan-grid-fine', fine, 'fine')}
        {tile('plan-grid-bold', bold, 'bold')}
      </defs>
      <rect width={size.w} height={size.h} fill="url(#plan-grid-fine)" />
      <rect width={size.w} height={size.h} fill="url(#plan-grid-bold)" />
    </g>
  )
}

/** The Key's Snapping and Grid switches. */
export function SnapKey({ k }: { k: number }) {
  const { on, grid, setOn, setGrid } = useSnapping()
  const { fine, bold } = gridSteps(k)
  return (
    <>
      <label className="check snap-key" title={`Points snap to corners, walls, square angles and every 50 mm. Hold ${FREE_KEY} to turn it off for one move; hold Shift to keep a line square.`}>
        <input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} />
        Snapping
      </label>
      <label className="check snap-key">
        <input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} />
        Grid{grid && <span className="muted"> · {sizeText(fine)} squares, bold every {sizeText(bold)}</span>}
      </label>
    </>
  )
}
