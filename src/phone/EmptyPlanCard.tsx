// A phone opens every project in View (PH-28). On a plan with nothing drawn that left a newcomer
// looking at an empty block with no next step: this card says honestly that drawing is easier on a
// computer, how to get the project there, and that Edit is here if they want to try.

import { emptyPlanCardShows, hideHint, useHintPrefs } from '../guide/hints'
import { Icon } from '../nav/icons'
import { navigate, useRouter } from '../nav/router'
import { tabRoute } from '../nav/route'
import type { Plan } from '../plan/model'
import { usePhoneMode } from './device'

export function EmptyPlanCard({ plan }: { plan: Plan }) {
  const prefs = useHintPrefs()
  if (!emptyPlanCardShows(plan, prefs.off || prefs.hidden.includes('walls'))) return null
  return (
    <section className="plan-hint phone-empty" aria-label="Tip">
      <div className="plan-hint-text">
        <b>No house drawn yet</b>
        <span>Drawing is easier on a computer. Here you can look, check and share.</span>
      </div>
      <div className="plan-hint-actions">
        <button type="button" className="plan-hint-go" onClick={() => navigate(tabRoute(useRouter.getState().route, 'share', 'send'))}>
          Send it to a computer
        </button>
        <button type="button" className="plan-hint-link" onClick={() => usePhoneMode.getState().setMode('edit')}>
          Or try Edit here
        </button>
      </div>
      <button type="button" className="plan-hint-x" aria-label="Hide this tip" title="Hide this tip" onClick={() => hideHint('walls')}>
        <Icon name="x" size={14} />
      </button>
    </section>
  )
}
