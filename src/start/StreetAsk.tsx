// "Which side faces the street?", once, on the plan just after a survey import. The answer is the
// plan's street side (src/plan/streetSide.ts): the checks' front edge and Street view in 3D. The
// low side is picked to start, since most blocks fall to the street; a side is picked here or by
// clicking it on the plan, which shows the one picked (and the one pointed at), and Use confirms.
// The card sits beside the block rather than over it. Each side can be set again later in
// Site › Block or Design › Checks.

import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { withFrontEdge } from '../plan/streetSide'
import { usePlan } from '../plan/store'
import { showToast } from '../safety/store'
import './street-ask.css'
import { chooseStreetEdge, hoverStreetEdge, streetAsked, streetChoices, useStreetAsk, useStreetAskOpen } from './streetQuestion'

export function StreetAsk({ survey, terrain, phone = false }: { survey: Survey; terrain: Terrain; phone?: boolean }) {
  const plan = usePlan(s => s.plan)
  const open = useStreetAskOpen(plan, survey.boundary)
  const picked = useStreetAsk(s => s.chosen)
  // Not asked for this project, or answered already in Site › Block or Design › Checks.
  if (!open || !plan) return null
  const choices = streetChoices(survey, plan.placement, terrain.stats.fallBearing)
  const chosen = choices.find(c => c.index === picked) ?? choices.find(c => c.low) ?? choices[0]
  if (!chosen) return null
  const use = () => {
    usePlan.getState().commit(p => withFrontEdge(p, chosen.index))
    streetAsked()
    showToast({ text: `The street is on the ${chosen.label.toLowerCase()}. Change it any time in Site › Block.` })
  }
  return (
    <section className="flow-card street-ask" aria-label="Street side">
      <header>
        <h2>Which side faces the street?</h2>
        <p>
          The survey doesn’t say. The checks measure the front setback from it, and Street view in 3D looks from it. {phone ? 'Tap' : 'Click'} a side here or on the plan.
        </p>
      </header>
      <div className="flow-choices street-choices" role="radiogroup" aria-label="Sides of the block" onPointerLeave={() => hoverStreetEdge(null)}>
        {choices.map(c => (
          <button
            key={c.index}
            type="button"
            role="radio"
            aria-checked={c.index === chosen.index}
            className={`flow-choice${c.index === chosen.index ? ' on' : ''}`}
            onClick={() => chooseStreetEdge(c.index)}
            onPointerEnter={() => hoverStreetEdge(c.index)}
            onFocus={() => hoverStreetEdge(c.index)}
            onBlur={() => hoverStreetEdge(null)}
          >
            <b>
              {c.label}
              {c.low && <em className="street-low">low side</em>}
            </b>
            <span>{c.length.toFixed(1)} m long</span>
          </button>
        ))}
      </div>
      <footer>
        <button type="button" className="flow-pri" onClick={use}>
          Use the {chosen.label.toLowerCase()}
        </button>
        <button type="button" className="flow-quiet" onClick={streetAsked}>
          Not sure yet
        </button>
      </footer>
    </section>
  )
}
