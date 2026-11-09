// The empty floor's tip at the top of the plan (draw its walls), said the way drawing works
// there: keys and clicks on a desktop, taps on a phone. The next steps' tips (name the rooms…)
// wait in the plan's question list instead, off the drawing (src/flow/QuestionTray.tsx). Its button picks the tool it talks about; the link opens that
// step of the guide; × hides it for good, and Hide tips hides them all.

import { Icon } from '../nav/icons'
import type { Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import { hideAllHints, hideHint, nextHint, TIPS, useHintPrefs } from './hints'
import { openGuide } from './store'

export function PlanHints({ plan, level, phone }: { plan: Plan; level: string; phone: boolean }) {
  const prefs = useHintPrefs()
  const tool = usePlan(s => s.tool)
  const id = nextHint(plan, level, prefs)
  if (id !== 'walls') return null
  const tip = TIPS[id]
  const using = tool === tip.tool
  return (
    <section className="plan-hint" aria-label="Tip">
      <div className="plan-hint-text">
        <b>{tip.title}</b>
        <span>{phone ? tip.phone : tip.desk}</span>
      </div>
      <div className="plan-hint-actions">
        {!using && (
          <button type="button" className="plan-hint-go" onClick={() => usePlan.getState().setTool(tip.tool)}>
            {tip.button}
          </button>
        )}
        <button type="button" className="plan-hint-link" onClick={() => openGuide(tip.section)}>
          How it works
        </button>
        <button type="button" className="plan-hint-link quiet" onClick={hideAllHints}>
          Hide tips
        </button>
      </div>
      <button type="button" className="plan-hint-x" aria-label="Hide this tip" title="Hide this tip" onClick={() => hideHint(id)}>
        <Icon name="x" size={14} />
      </button>
    </section>
  )
}
