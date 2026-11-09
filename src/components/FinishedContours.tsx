import { memo } from 'react'
import type { Vec2 } from '../lib/geom'
import type { PlanContours } from '../plan/finishedContours'
import './finished-contours.css'

interface LayerProps {
  contours: PlanContours
  /** House frame to the screen. */
  S: (p: Vec2) => Vec2
  /** Changes whenever S does (pan, zoom, turn, resize), so pointer moves don't redraw the contours. */
  viewKey: string
}

function Layer({ contours, S }: LayerProps) {
  const d = (lines: Vec2[][]) =>
    lines
      .map(
        l =>
          `M${l
            .map(p =>
              S(p)
                .map(n => n.toFixed(1))
                .join(' '),
            )
            .join('L')}`,
      )
      .join('')
  return (
    <g className="fc-layer">
      <path className="contour-minor" d={d(contours.natural.minor)} />
      <path className="contour-major" d={d(contours.natural.major)} />
      <path className="contour-minor fc-existing" d={d(contours.existing.minor)} />
      <path className="contour-major fc-existing" d={d(contours.existing.major)} />
      <path className="fc-finished minor" d={d(contours.finished.minor)} />
      <path className="fc-finished major" d={d(contours.finished.major)} />
      {contours.labels.map((l, i) => {
        const [x, y] = S(l.p)
        return (
          <text key={i} className={`contour-label${l.finished ? ' fc-label' : ''}`} x={x} y={y}>
            {l.text}
          </text>
        )
      })}
    </g>
  )
}

/** Natural contours as they were, faint and dashed where the ground is cut or filled, and the finished ground's contours there in ink. */
export const FinishedContourLayer = memo(Layer, (a, b) => a.contours === b.contours && a.viewKey === b.viewKey)

/** The toggle and its key, under "Ground vs this floor". */
export function ContoursKey({ on, onChange, interval }: { on: boolean; onChange: (on: boolean) => void; interval: number }) {
  return (
    <div className="fc-key">
      <label className="check">
        <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
        Finished contours
      </label>
      {on && (
        <ul>
          <li>
            <i className="fc-swatch proposed" /> <span className="fc-wide">Finished ground, proposed</span>
            <span className="fc-narrow">Proposed</span>
          </li>
          <li>
            <i className="fc-swatch existing" /> <span className="fc-wide">Natural ground, existing</span>
            <span className="fc-narrow">Existing</span>
          </li>
          <li className="small">Every {interval < 1 ? `${Math.round(interval * 1000)} mm` : `${interval} m`}, dashed where it's cut or filled</li>
        </ul>
      )}
    </div>
  )
}
