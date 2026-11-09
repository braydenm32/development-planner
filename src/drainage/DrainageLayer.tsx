// The stormwater concept on the plan canvas, while Approvals › Stormwater is open: a dashed path
// from the house to where the water would go, dots at the likely downpipe spots, and an arrow for
// which way the ground falls. Everything here is a concept; the labels say so.

import { useMemo } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { bearingName } from '../lib/terrain'
import { useRouter } from '../nav/router'
import { fromSite, type Plan } from '../plan/model'
import { destinationText, downpipeSpots, fallReport, houseCorners, streetEdgeOf } from './stormwater'
import './drainage.css'

interface Props {
  plan: Plan
  survey: Survey
  terrain: Terrain
  /** Plan frame to screen pixels. */
  S: (p: Vec2) => Vec2
  /** Pixels per metre. */
  k: number
}

/** How far the fall arrow reaches on the plan (m). */
const ARROW_M = 5

export function DrainageLayer(props: Props) {
  const route = useRouter(s => s.route)
  const on = route.kind === 'app' && route.area === 'approvals' && route.tab === 'stormwater'
  return on ? <Layer {...props} /> : null
}

const fmt = (p: Vec2) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`

function Layer({ plan, survey, terrain, S, k }: Props) {
  const report = useMemo(() => fallReport(plan, survey, terrain, streetEdgeOf(plan, survey, terrain.stats.fallBearing)), [plan, survey, terrain])
  const spots = useMemo(() => downpipeSpots(plan), [plan])
  const site = (p: Vec2) => S(fromSite(p, plan.placement, survey.origin))

  // The fall arrow starts just past the house, downhill of its middle, so it never sits on the walls.
  const b = (terrain.stats.fallBearing * Math.PI) / 180
  const dir: Vec2 = [Math.sin(b), Math.cos(b)]
  const corners = houseCorners(plan, survey)
  // How far the house reaches downhill of its middle, so the arrow starts a metre past its wall.
  const reach = corners.reduce((m, c) => Math.max(m, (c[0] - report.centre[0]) * dir[0] + (c[1] - report.centre[1]) * dir[1]), 0) + 1
  const level = terrain.stats.maxSlopePct < 0.05
  const a0: Vec2 = [report.centre[0] + dir[0] * reach, report.centre[1] + dir[1] * reach]
  const a1: Vec2 = [a0[0] + dir[0] * ARROW_M, a0[1] + dir[1] * ARROW_M]
  const arrow = (from: Vec2, to: Vec2) => {
    const ux = to[0] - from[0]
    const uy = to[1] - from[1]
    const l = Math.hypot(ux, uy) || 1
    const [hx, hy] = [ux / l, uy / l]
    const wing = (t: number) => `${(to[0] - hx * 9 - hy * t).toFixed(1)} ${(to[1] - hy * 9 + hx * t).toFixed(1)}`
    return `M${fmt(from)}L${fmt(to)}M${wing(5)}L${fmt(to)}L${wing(-5)}`
  }
  const path = report.path.map(site)
  const label = report.path.length === 2 ? `Stormwater concept: to ${destinationText(report)}` : ''
  const mid: Vec2 | null = path.length === 2 ? [(path[0][0] + path[1][0]) / 2, (path[0][1] + path[1][1]) / 2] : null
  let ang = path.length === 2 ? (Math.atan2(path[1][1] - path[0][1], path[1][0] - path[0][0]) * 180) / Math.PI : 0
  if (ang > 90) ang -= 180
  if (ang < -90) ang += 180
  const long = path.length === 2 && Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]) > 90

  return (
    <g className="drainage" aria-label="Stormwater concept">
      {spots.map((p, i) => {
        const q = S(p)
        return <circle key={i} className="drainage-dp" cx={q[0]} cy={q[1]} r={Math.min(Math.max(k * 0.12, 3), 6)} />
      })}
      {path.length === 2 && (
        <>
          <path className="drainage-path" d={arrow(path[0], path[1])} />
          <circle className="drainage-end" cx={path[0][0]} cy={path[0][1]} r={4} />
          {mid && long && (
            <text className="drainage-label" x={mid[0]} y={mid[1]} dy={-6} transform={`rotate(${ang.toFixed(1)} ${mid[0]} ${mid[1]})`} textAnchor="middle">
              {label}
            </text>
          )}
        </>
      )}
      {!level && (
        <g className="drainage-fall">
          <path d={arrow(site(a0), site(a1))} />
          <text x={site(a1)[0]} y={site(a1)[1]} dy={16} textAnchor="middle">
            falls to the {bearingName(terrain.stats.fallBearing)}
          </text>
        </g>
      )}
    </g>
  )
}
