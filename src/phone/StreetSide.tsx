// Which side of the block the street is on, for Street view (and Rear, from the other side).
// It's the same setting as Approvals › Checks' "Faces the street", kept with the plan; until it's
// set, Street view looks from the low side. Its home is Site › Block, beside which way the block
// falls; Site › 3D and Approvals › Checks link there.

import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { streetBearingOf, streetSideOf, withStreetSide } from '../plan/streetSide'
import { usePlan } from '../plan/store'
import { useProjects } from '../projects/session'
import { isLevel } from '../components/siteWords'
import { setSketchStreet } from '../start/sketchStreet'
import { bearingWord, streetBearing, STREET_SIDES, type StreetSide } from './camera'
import { goToStreetSide, STREET_SIDE_ID, streetSideLabel } from './streetSideWords'

/**
 * Site › Block's street side: a choice beside "Falls towards", as a row of the facts. On a sketch
 * block the street is part of the sketch (its width runs along the street and its fall goes back
 * from it), so this is the same setting as Change size › Street: picking another side re-lays the
 * sketch through the same review, and the two can't disagree.
 */
export function StreetSideField({ survey, terrain }: { survey: Survey; terrain: Terrain }) {
  const plan = usePlan(s => s.plan)
  const sketch = useProjects().opened?.survey?.sketch
  const side = sketch ? sketch.street : streetSideOf(plan, survey.boundary)
  const low = bearingWord(streetBearing(survey.boundary, terrain.stats.fallBearing, 'auto'))
  const pick = (s: StreetSide) => {
    if (s === side) return
    if (sketch) {
      if (s !== 'auto') setSketchStreet(sketch, s)
    } else if (plan) usePlan.getState().commit(p => withStreetSide(p, survey.boundary, s))
  }
  return (
    <>
      <dt id={STREET_SIDE_ID}>
        <label htmlFor="street-side-pick" title="Street view in 3D looks at the house from here, and the checks measure the front setback from it.">
          Street side
        </label>
      </dt>
      <dd>
        <select
          id="street-side-pick"
          className="street-side-pick"
          value={side}
          title={sketch ? 'Part of the sketch: picking another side turns the block, after a review.' : undefined}
          onChange={e => pick(e.target.value as StreetSide)}
        >
          {STREET_SIDES.filter(s => !sketch || s !== 'auto').map(s => (
            <option key={s} value={s}>
              {streetSideLabel(s, low, isLevel(terrain.stats))}
            </option>
          ))}
        </select>
      </dd>
    </>
  )
}

/** Elsewhere (Site › 3D, Approvals › Checks): which side it is now, and the way to Site › Block to change it. */
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
