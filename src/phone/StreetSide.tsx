// Which side of the block the street is on, for Street view (and Rear, from the other side).
// It's the same setting as Design › Checks' "Faces the street", kept with the plan; until it's
// set, Street view looks from the low side. Its home is Site › Block, beside which way the block
// falls; Site › 3D and Design › Checks link there.

import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { streetBearingOf, streetSideOf, withStreetSide } from '../plan/streetSide'
import { usePlan } from '../plan/store'
import { bearingWord, streetBearing, STREET_SIDES, type StreetSide } from './camera'
import { goToStreetSide, STREET_SIDE_ID, streetSideLabel } from './streetSideWords'

/** Site › Block's street side: a choice beside "Falls towards", as a row of the facts. */
export function StreetSideField({ survey, terrain }: { survey: Survey; terrain: Terrain }) {
  const plan = usePlan(s => s.plan)
  const side = streetSideOf(plan, survey.boundary)
  const low = bearingWord(streetBearing(survey.boundary, terrain.stats.fallBearing, 'auto'))
  const pick = (s: StreetSide) => {
    if (plan && s !== side) usePlan.getState().commit(p => withStreetSide(p, survey.boundary, s))
  }
  return (
    <>
      <dt id={STREET_SIDE_ID}>
        <label htmlFor="street-side-pick" title="Street view in 3D looks at the house from here, and the checks measure the front setback from it.">
          Street side
        </label>
      </dt>
      <dd>
        <select id="street-side-pick" className="street-side-pick" value={side} onChange={e => pick(e.target.value as StreetSide)}>
          {STREET_SIDES.map(s => (
            <option key={s} value={s}>
              {streetSideLabel(s, low)}
            </option>
          ))}
        </select>
      </dd>
    </>
  )
}

/** Elsewhere (Site › 3D, Design › Checks): which side it is now, and the way to Site › Block to change it. */
export function StreetSideLink({ survey, terrain, lead = 'Street view looks from' }: { survey: Survey; terrain: Terrain; lead?: string }) {
  const plan = usePlan(s => s.plan)
  const side = streetSideOf(plan, survey.boundary)
  const word = bearingWord(streetBearingOf(plan, survey.boundary, terrain.stats.fallBearing))
  return (
    <p className="street-side-link muted small">
      {lead} the {word} side{side === 'auto' ? ' (the low side, until you set it)' : ''}.{' '}
      <button className="link" onClick={goToStreetSide}>
        Change the street side
      </button>
    </p>
  )
}
