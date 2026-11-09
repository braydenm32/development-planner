// "Which side faces the street?", once, on the plan just after a survey import. The answer is the
// plan's street side (src/plan/streetSide.ts): the checks' front edge and Street view in 3D. It
// says which side is low, since most blocks fall to the street. Each side can be set again
// later in Design › Checks or Site › 3D.

import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { withFrontEdge } from '../plan/streetSide'
import { usePlan } from '../plan/store'
import { showToast } from '../safety/store'
import { streetAsked, streetChoices, useStreetAskOpen } from './streetQuestion'

export function StreetAsk({ survey, terrain }: { survey: Survey; terrain: Terrain }) {
  const plan = usePlan(s => s.plan)
  // Not asked for this project, or answered already in Design › Checks or Site › 3D.
  if (!useStreetAskOpen(plan, survey.boundary) || !plan) return null
  const choices = streetChoices(survey, plan.placement, terrain.stats.fallBearing)
  const pick = (i: number, label: string) => {
    usePlan.getState().commit(p => withFrontEdge(p, i))
    streetAsked()
    showToast({ text: `The street is on the ${label.toLowerCase()}. Change it any time in Design › Checks.` })
  }
  return (
    <section className="flow-card street-ask" aria-label="Street side">
      <header>
        <h2>Which side faces the street?</h2>
        <p>The survey doesn’t say. The checks measure the front setback from it, and Street view in 3D looks from it.</p>
      </header>
      <div className="flow-choices street-choices">
        {choices.map(c => (
          <button key={c.index} type="button" className="flow-choice" onClick={() => pick(c.index, c.label)}>
            <b>{c.label}</b>
            <span>
              {c.length.toFixed(2)} m{c.low ? ' · the low side' : ''}
            </span>
          </button>
        ))}
      </div>
      <footer>
        <button type="button" className="flow-quiet" onClick={streetAsked}>
          Not sure yet
        </button>
      </footer>
    </section>
  )
}
