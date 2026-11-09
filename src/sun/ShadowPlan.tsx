// The 21 June shadow diagram on the plan: the house's shadows at 9 am, 12 pm and 3 pm, each
// hatched its own way with a solid, dashed or dotted edge so they read apart where they overlap
// (and in black and white), labelled at their far end, with the part over the boundary in red.
// The plan key's Shadows switch turns it on and off.

import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import type { Plan } from '../plan/model'
import type { Earth } from '../plan/useEarthworks'
import { DIAGRAM_TIMES } from './facts'
import { hourText } from './solar'
import { useSun } from './store'
import { useShadowDiagram } from './useSun'
import './sun.css'

/** Hatch angle for each time, so overlapping shadows cross-hatch. */
const HATCH = [45, -45, 90]
const COLOURS = ['#6a5a9e', '#3d6f8f', '#8a5a3c']

interface Props {
  plan: Plan
  survey: Survey
  terrain: Terrain
  earth: Earth | null
  /** The survey's frame to the screen. */
  toScreen: (p: Vec2) => Vec2
}

export function ShadowPlanLayer(props: Props) {
  const on = useSun(s => s.planShadows)
  if (!on) return null
  return <Shadows {...props} />
}

function Shadows({ plan, survey, terrain, earth, toScreen }: Props) {
  const diagram = useShadowDiagram(plan, survey, terrain, earth, true)
  if (!diagram) return null
  const d = (rings: Vec2[][]) =>
    rings
      .map(r =>
        r
          .map((p, i) => {
            const [x, y] = toScreen(p)
            return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
          })
          .join(''),
      )
      .join('Z') + 'Z'
  return (
    <g className="plan-shadows" aria-label="Shadows at 9 am, 12 pm and 3 pm on 21 June">
      <defs>
        {HATCH.map((a, i) => (
          <pattern key={i} id={`sun-hatch-${i}`} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform={`rotate(${a})`}>
            <line x1="0" y1="0" x2="0" y2="7" stroke={COLOURS[i]} strokeOpacity="0.7" strokeWidth="1" />
          </pattern>
        ))}
      </defs>
      {diagram.shadows.map((s, i) =>
        s.shadow && s.shadow.rings.length ? <path key={s.minutes} className={`plan-shadow t${i}`} d={d(s.shadow.rings)} fill={`url(#sun-hatch-${i})`} /> : null,
      )}
      {diagram.shadows.map(s => (s.shadow && s.shadow.over.rings.length ? <path key={`over-${s.minutes}`} className="plan-shadow-over" d={d(s.shadow.over.rings)} /> : null))}
      {diagram.shadows.map((s, i) => {
        if (!s.shadow || !s.shadow.rings.length) return null
        const [x, y] = toScreen(s.shadow.tip)
        return (
          <text key={`label-${s.minutes}`} className={`plan-shadow-label t${i}`} x={x} y={y} dy={4} textAnchor="middle">
            {hourText(s.minutes)}
          </text>
        )
      })}
    </g>
  )
}

/** The plan key's switch for the shadows, with what each line means. */
export function ShadowsKey() {
  const on = useSun(s => s.planShadows)
  return (
    <div className="shadows-key">
      <label className="check">
        <input type="checkbox" checked={on} onChange={e => useSun.getState().setPlanShadows(e.target.checked)} />
        Shadows, 21 June
      </label>
      {on && (
        <ul>
          {DIAGRAM_TIMES.map((m, i) => (
            <li key={m}>
              <svg width="22" height="10" aria-hidden="true">
                <rect className={`plan-shadow t${i}`} x="1" y="1" width="20" height="8" fill={COLOURS[i]} fillOpacity="0.15" />
              </svg>
              {hourText(m)}
            </li>
          ))}
          <li>
            <svg width="22" height="10" aria-hidden="true">
              <rect className="plan-shadow-over" x="1" y="1" width="20" height="8" />
            </svg>
            Over the boundary
          </li>
          <li className="small">On the ground, finished where cut or filled. Times AEST.</li>
        </ul>
      )}
    </div>
  )
}
