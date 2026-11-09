// Which side of the block the street is on, for Street view (and Rear, from the other side).
// It's the same setting as Design › Checks' "Faces the street", kept with the plan; until it's
// set, Street view looks from the low side.

import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { streetSideOf, withStreetSide } from '../plan/streetSide'
import { usePlan } from '../plan/store'
import { bearingWord, streetBearing, STREET_SIDES, type StreetSide } from './camera'
import { useCamera } from './cameraStore'

const LABEL: Record<StreetSide, string> = { auto: 'Low side', N: 'N', E: 'E', S: 'S', W: 'W' }

export function StreetSidePicker({ survey, terrain }: { survey: Survey; terrain: Terrain }) {
  const plan = usePlan(s => s.plan)
  const side = streetSideOf(plan, survey.boundary)
  const low = bearingWord(streetBearing(survey.boundary, terrain.stats.fallBearing, 'auto'))
  const pick = (s: StreetSide) => {
    if (plan && s !== side) usePlan.getState().commit(p => withStreetSide(p, survey.boundary, s))
    useCamera.getState().go('street')
  }
  return (
    <div className="street-side">
      <h3>Street side</h3>
      <p className="muted small">Street view looks at the house from here, and Rear from the other side. The checks measure the front setback from it too. The low side faces {low}.</p>
      <div className="segmented" role="group" aria-label="Street side">
        {STREET_SIDES.map(s => (
          <button key={s} className={s === side ? 'on' : ''} aria-pressed={s === side} onClick={() => pick(s)}>
            {LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  )
}
