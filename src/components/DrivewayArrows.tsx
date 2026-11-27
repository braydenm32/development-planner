// Each driveway's direction on the plan: an arrow down its middle from the garage end to the
// street end, the one direction its levels, grades, cut and fill and checks run along
// (driveEndPoints in src/plan/driveway.ts). Shown while Earthworks › Driveway is open, and on a
// driveway while it is selected; Swap ends in the panel turns it round.

import { useMemo } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import { useRouter } from '../nav/router'
import { driveEndPoints } from '../plan/driveway'
import { areaKind, fromSite, type Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import './finishing.css'

interface Props {
  plan: Plan
  survey: Survey
  /** Plan frame to screen pixels. */
  S: (p: Vec2) => Vec2
}

export function DrivewayArrows({ plan, survey, S }: Props) {
  const route = useRouter(s => s.route)
  const selection = usePlan(s => s.selection)
  const tab = route.kind === 'app' && route.area === 'earthworks' && route.tab === 'driveway'
  const picked = selection?.type === 'area' ? selection.id : null
  const drives = useMemo(
    () =>
      plan.areas
        .filter(a => areaKind(a) === 'driveway' && (tab || a.id === picked))
        .flatMap(a => {
          const e = driveEndPoints(plan, a, survey.origin, survey.boundary)
          return e ? [{ id: a.id, garage: fromSite(e.garage, plan.placement, survey.origin), street: fromSite(e.street, plan.placement, survey.origin) }] : []
        }),
    [plan, survey, tab, picked],
  )
  if (!drives.length) return null
  return (
    <g className="drive-arrows" aria-label="Driveway direction: garage end to street end">
      {drives.map(d => {
        const g = S(d.garage)
        const s = S(d.street)
        const l = Math.hypot(s[0] - g[0], s[1] - g[1])
        if (l < 24) return null
        const u: Vec2 = [(s[0] - g[0]) / l, (s[1] - g[1]) / l]
        // In from each end, so the arrow sits on the drive and clear of the garage door.
        const inset = Math.min(l * 0.18, 26)
        const a: Vec2 = [g[0] + u[0] * inset, g[1] + u[1] * inset]
        const b: Vec2 = [s[0] - u[0] * inset, s[1] - u[1] * inset]
        const wing = (t: number) => `${(b[0] - u[0] * 11 - u[1] * t).toFixed(1)} ${(b[1] - u[1] * 11 + u[0] * t).toFixed(1)}`
        // The words sit beside the arrow, level, whichever way it points.
        const side: Vec2 = [-u[1], u[0]]
        const flip = side[0] < 0 ? -1 : 1
        const tx = (p: Vec2) => p[0] + side[0] * flip * 10
        const ty = (p: Vec2) => p[1] + side[1] * flip * 10 + 4
        return (
          <g key={d.id}>
            <path d={`M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}M${wing(6)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}L${wing(-6)}`} />
            <circle cx={a[0]} cy={a[1]} r={3.5} />
            {l > 90 && (
              <>
                <text x={tx(a)} y={ty(a)}>
                  garage end
                </text>
                <text x={tx(b)} y={ty(b)}>
                  street end
                </text>
              </>
            )}
          </g>
        )
      })}
    </g>
  )
}
