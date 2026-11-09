// Check everything: the project's six steps in one list beside the plan, each with its number,
// whether it's done, and what's left in it. A click on an item goes to where it's fixed; on a
// computer the list stays open beside the plan so you can work down it, and on a phone it's a
// sheet that steps aside to show the place. It sits beside the menus; it doesn't replace them.

import { useEffect, useRef } from 'react'
import { Icon } from '../nav/icons'
import type { Loaded } from '../shell/useSite'
import { goTo } from './go'
import { firstOpen, progressText, statusText, type Step, type StepItem } from './model'
import { closeSteps, showStep, useStepsPanel, wentTo } from './store'
import { useSteps } from './useSteps'
import './steps.css'

const TONE_TEXT: Record<StepItem['tone'], string> = { todo: 'To do', ask: 'Question', fix: 'Fix', confirm: 'Confirm', fact: 'Add a fact' }

export function StepsPanel({ d, phone }: { d: Loaded; phone: boolean }) {
  const steps = useSteps(d)
  const picked = useStepsPanel(s => s.step)
  const last = useStepsPanel(s => s.last)
  const open = picked ?? firstOpen(steps)
  const box = useRef<HTMLElement>(null)

  // Focus the list as it opens, so Escape and Tab work in it, and give focus back as it closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    box.current?.focus({ preventScroll: true })
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true })
    }
  }, [])

  const go = (item: StepItem) => {
    wentTo(item.id)
    goTo(item.go)
    // A phone has no room for both: the sheet steps aside to show the place.
    if (phone) closeSteps()
  }
  const at = steps.findIndex(s => s.id === open)
  const next = steps.slice(at + 1).find(s => s.status !== 'done')

  return (
    <>
      {phone && <div className="sheet-backdrop" onClick={closeSteps} />}
      <aside
        ref={box}
        className={`steps-sheet${phone ? ' phone' : ''}`}
        role="dialog"
        aria-label="Check everything"
        tabIndex={-1}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            closeSteps()
          }
        }}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <header className="steps-head">
          <div>
            <h2>Check everything</h2>
            <p className="muted small">{progressText(steps)}</p>
          </div>
          <button className="icon-button" onClick={closeSteps} aria-label="Close Check everything" title="Close">
            <Icon name="x" size={17} />
          </button>
        </header>
        <div className="steps-bars" aria-hidden="true">
          {steps.map(s => (
            <i key={s.id} className={`s-${s.status}`} />
          ))}
        </div>
        <ol className="steps-list">
          {steps.map(s => (
            <StepRow key={s.id} s={s} open={s.id === open} last={last} go={go} />
          ))}
        </ol>
        {next && (
          <footer className="steps-foot">
            <button className="secondary" onClick={() => showStep(next.id)}>
              Next: {next.title} <Icon name="chevR" size={14} />
            </button>
          </footer>
        )}
      </aside>
    </>
  )
}

function StepRow({ s, open, last, go }: { s: Step; open: boolean; last: string | null; go: (item: StepItem) => void }) {
  const status = statusText(s)
  const warn = s.items.some(x => x.tone === 'fix') ? 'fix' : s.items.length ? 'todo' : s.status
  return (
    <li className={`step s-${s.status}${open ? ' open' : ''}`}>
      <button className="step-head" aria-expanded={open} onClick={() => showStep(s.id)}>
        <span className={`step-n s-${s.status}`} aria-hidden="true">
          {s.status === 'done' ? <Icon name="check" size={14} stroke={2.2} /> : s.n}
        </span>
        <span className="step-text">
          <span className="step-title">{s.title}</span>
          <span className="step-num">{s.headline}</span>
        </span>
        <span className={`step-status st-${warn}`}>
          <i aria-hidden="true" />
          {status}
        </span>
      </button>
      {open && (
        <div className="step-body">
          {s.items.length ? (
            <ul className="step-items" aria-label={`What’s left in ${s.title}`}>
              {s.items.map(item => (
                <li key={item.id}>
                  <button className={`step-item t-${item.tone}${item.id === last ? ' last' : ''}`} onClick={() => go(item)}>
                    <i className="dot" aria-hidden="true" />
                    <span className="what">
                      <b>{item.text}</b>
                      {item.detail && <span>{item.detail}</span>}
                    </span>
                    <span className="sr-only">{TONE_TEXT[item.tone]}</span>
                    <Icon name="chevR" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small step-none">{s.status === 'done' ? 'Nothing left here.' : 'Nothing to do here until there’s more drawn.'}</p>
          )}
        </div>
      )}
    </li>
  )
}
