// The plan's questions, in one calm list at the foot of the plan (C19). Folded, it's a small pill
// that says how many wait; nothing in it opens by itself or sits over the drawing, so it never
// takes a click meant for the plan. Open, it lists them (./questions.ts) and answers one at a
// time in place. A question just asked lights the pill once the tool is put down, not while
// you're still drawing.

import { useEffect, useMemo, useState } from 'react'
import { hideHint, TIPS, useHintPrefs } from '../guide/hints'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { Icon } from '../nav/icons'
import { tabRoute } from '../nav/route'
import { navigate, useRouter } from '../nav/router'
import type { Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import { StreetAsk } from '../start/StreetAsk'
import { answerStreet, useStreetPending } from '../start/streetQuestion'
import { FloorTypeCard, OfferCard } from './FlowCards'
import { questionsFor, useQuestionContext, waiting, type Question } from './questions'
import { useFlow } from './store'

interface Props {
  plan: Plan
  level: string
  survey: Survey
  terrain: Terrain
  phone: boolean
}

export function QuestionTray({ plan, level, survey, terrain, phone }: Props) {
  const ask = useFlow(s => s.ask)
  const offer = useFlow(s => s.offer)
  const dismissed = useFlow(s => s.dismissed)
  const street = useStreetPending(plan, survey.boundary)
  const hints = useHintPrefs()
  const facts = useQuestionContext(s => s.facts)
  const tool = usePlan(s => s.tool)
  const qs = useMemo(
    () => questionsFor({ plan, level, street, ask: ask && { level: ask.space.level }, dismissed, offer, hints, facts }),
    [plan, level, street, ask, dismissed, offer, hints, facts],
  )
  const [open, setOpen] = useState(false)
  const [answering, setAnswering] = useState<string | null>(null)
  const current = qs.find(q => q.id === answering) ?? null
  // The block's sides answer the street question only while it's open here.
  const streetOpen = open && current?.kind === 'street'
  useEffect(() => {
    answerStreet(streetOpen)
    return () => answerStreet(false)
  }, [streetOpen])

  if (!qs.length) return null
  const n = waiting(qs)
  // Something you did just asked; say so once the tool is down, so drawing isn't interrupted.
  const fresh = qs.some(q => q.fresh) && tool === 'select'

  if (!open)
    return (
      <button type="button" className={`q-pill${fresh ? ' fresh' : ''}`} onClick={() => setOpen(true)} aria-expanded={false}>
        <i className="q-dot" aria-hidden="true" />
        {n > 0 ? `${n} question${n > 1 ? 's' : ''} waiting` : 'Next step'}
        <Icon name="chevU" size={14} />
      </button>
    )

  const close = () => {
    setAnswering(null)
    setOpen(false)
  }
  return (
    <section className="q-tray" aria-label="Questions waiting for you">
      <header>
        {current ? (
          <button type="button" className="q-back" onClick={() => setAnswering(null)}>
            <Icon name="chevL" size={14} /> All questions
          </button>
        ) : (
          <h2>
            Waiting for you <span className="q-count">{qs.length}</span>
          </h2>
        )}
        <button type="button" className="q-x" onClick={close} aria-label="Fold the questions away" title="Fold away">
          <Icon name="chevD" size={16} />
        </button>
      </header>
      {current ? (
        <Answer q={current} survey={survey} terrain={terrain} phone={phone} done={() => setAnswering(null)} />
      ) : (
        <ul className="q-list">
          {qs.map(q => (
            <Row key={q.id} q={q} phone={phone} answer={() => setAnswering(q.id)} />
          ))}
        </ul>
      )}
    </section>
  )
}

function Row({ q, phone, answer }: { q: Question; phone: boolean; answer: () => void }) {
  const tip = q.hint ? TIPS[q.hint] : null
  const detail = tip ? (phone ? tip.phone : tip.desk) : q.detail
  let action
  if (tip)
    action = (
      <>
        <button type="button" className="q-go" onClick={() => usePlan.getState().setTool(tip.tool)}>
          {tip.button}
        </button>
        <button type="button" className="q-hide" aria-label={`Hide the tip: ${tip.title}`} title="Hide this tip" onClick={() => hideHint(q.hint!)}>
          <Icon name="x" size={13} />
        </button>
      </>
    )
  else if (q.kind === 'facts')
    action = (
      <button
        type="button"
        className="q-go"
        onClick={() => {
          const r = useRouter.getState().route
          navigate(tabRoute(r, 'approvals', 'checks'))
        }}
      >
        Add them
      </button>
    )
  else
    action = (
      <button type="button" className="q-go" onClick={answer}>
        Answer
      </button>
    )
  return (
    <li className={q.fresh ? 'fresh' : undefined}>
      <div className="q-text">
        <b>{q.title}</b>
        {detail && <span>{detail}</span>}
      </div>
      <div className="q-actions">{action}</div>
    </li>
  )
}

function Answer({ q, survey, terrain, phone, done }: { q: Question; survey: Survey; terrain: Terrain; phone: boolean; done: () => void }) {
  const offer = useFlow(s => s.offer)
  if (q.kind === 'street') return <StreetAsk survey={survey} terrain={terrain} phone={phone} />
  if (q.kind === 'floor-type' && q.level) return <FloorTypeCard level={q.level} onDone={done} />
  if (q.kind === 'retain-offer' && offer) return <OfferCard o={offer} />
  return null
}
