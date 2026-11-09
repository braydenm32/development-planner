// Setback dimensions on the plan canvas: a dimension line from the house to each side of the
// block, with ticks at both ends and its length in mm. Shown in Earthworks › Place, while moving
// the house, and anywhere else the plan's Setbacks switch is on. A side the house goes past is
// drawn in red from the house's furthest corner, "−1.20 m over".

import type { Vec2 } from '../lib/geom'
import type { SetbackDim } from '../plan/setbacks'
import './setbacks.css'

interface Props {
  dims: SetbackDim[]
  /** Survey local frame to the screen. */
  toScreen: (p: Vec2) => Vec2
}

/** Shorter than this on screen (px), a line is drawn but not labelled (unless it's over the boundary, which always says so). */
const MIN_LABEL_PX = 30

export function SetbackLines({ dims, toScreen }: Props) {
  return (
    <g className="setbacks" aria-label="Setbacks">
      {dims.map(d => {
        const a = toScreen(d.from)
        const b = toScreen(d.to)
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (len < 2) return null
        const u: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
        // Architectural ticks: short strokes at 45° across each end.
        const t: Vec2 = [(u[0] - u[1]) * 4, (u[1] + u[0]) * 4]
        const tick = (p: Vec2) => `M${(p[0] - t[0]).toFixed(1)} ${(p[1] - t[1]).toFixed(1)}L${(p[0] + t[0]).toFixed(1)} ${(p[1] + t[1]).toFixed(1)}`
        let ang = (Math.atan2(u[1], u[0]) * 180) / Math.PI
        if (ang > 90) ang -= 180
        if (ang < -90) ang += 180
        const mx = (a[0] + b[0]) / 2
        const my = (a[1] + b[1]) / 2
        return (
          <g key={d.side} className={d.over ? 'setback over' : 'setback'}>
            <path className="setback-line" d={`M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`} />
            <path className="setback-tick" d={`${tick(a)}${tick(b)}`} />
            {(len >= MIN_LABEL_PX || d.over) && (
              <text className="setback-label" x={mx} y={my} dy={-5} transform={`rotate(${ang.toFixed(1)} ${mx} ${my})`} textAnchor="middle">
                {d.text}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

/** The plan key's switch for the setback lines, beside Ground vs this floor. */
export function SetbacksKey({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="check setbacks-key">
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
      Setbacks
    </label>
  )
}
