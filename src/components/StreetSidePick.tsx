// "Pick the street side", in the panel that waits for it (Earthworks › Driveway, Approvals ›
// Stormwater). It is the plan's one street side (src/plan/streetSide.ts), the same setting as
// Site › Block's and Approvals › Checks' "Faces the street", so every panel works from the same
// street once it is picked; until then none of them assumes one.

import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { frontEdgeOf, withFrontEdge } from '../plan/streetSide'
import { usePlan } from '../plan/store'
import { streetChoices } from '../start/streetQuestion'

export function StreetSidePick({ survey, terrain, why }: { survey: Survey; terrain: Terrain; why: string }) {
  const plan = usePlan(s => s.plan)
  if (!plan || frontEdgeOf(plan, survey.boundary) !== undefined) return null
  const choices = streetChoices(survey, plan.placement, terrain.stats.fallBearing)
  if (!choices.length) return null
  return (
    <div className="street-side-pick-inline">
      <label className="num">
        <span>Pick the street side</span>
        <select value={-1} onChange={e => Number(e.target.value) >= 0 && usePlan.getState().commit(p => withFrontEdge(p, Number(e.target.value)))}>
          <option value={-1}>Which side is the street?</option>
          {choices.map(c => (
            <option key={c.index} value={c.index}>
              {c.label} · {c.length.toFixed(1)} m{c.low ? ' (low side)' : ''}
            </option>
          ))}
        </select>
      </label>
      <p className="notice small">{why}</p>
    </div>
  )
}
