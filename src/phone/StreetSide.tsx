// Which side of the block the street is on, for Street view (and Rear, from the other
// side). The survey doesn't say, so it starts as the low side and can be picked here.

import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { bearingWord, streetBearing, STREET_SIDES, type StreetSide } from './camera'
import { useCamera, useStreetSide } from './cameraStore'

const LABEL: Record<StreetSide, string> = { auto: 'Low side', N: 'N', E: 'E', S: 'S', W: 'W' }

export function StreetSidePicker({ projectKey, survey, terrain }: { projectKey: string; survey: Survey; terrain: Terrain }) {
  const side = useStreetSide(projectKey)
  const low = bearingWord(streetBearing(survey.boundary, terrain.stats.fallBearing, 'auto'))
  const pick = (s: StreetSide) => {
    useCamera.getState().setStreetSide(projectKey, s)
    useCamera.getState().go('street')
  }
  return (
    <div className="street-side">
      <h3>Street side</h3>
      <p className="muted small">Street view looks at the house from here, and Rear from the other side. The low side faces {low}.</p>
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
