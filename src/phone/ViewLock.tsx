// View on a phone reads but never changes the plan: a panel's fields and buttons are
// locked, with one line that says so and the way to Edit. Approvals and Share read the house on a
// computer too: there the line says where it is changed, with the way there.

import { useContext, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Icon } from '../nav/icons'
import { usePhoneMode } from './device'
import { LockedFor } from './lockedFor'

interface Props {
  children: ReactNode
  /** The line goes after what it locks (the selection, whose numbers lead) rather than before (a panel). */
  after?: boolean
  /** Why it's locked here and the way to where it isn't, in place of the phone's View line. */
  why?: { text: string; label: string; go: () => void }
  /**
   * A panel for reading (Approvals): what only opens, lists or goes somewhere stays live, and
   * only what writes an answer is locked (PH-07).
   */
  reading?: boolean
}

/**
 * What stays live in a reading panel: a row or group that unfolds, a link to somewhere, and what a
 * panel marks as only changing what is shown (the CDC / DA route, a download).
 */
export const READS = 'button[aria-expanded], button.link, [data-view-reads], [data-view-reads] *'

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement

/** Lock the fields and buttons in `el` that write, now and as rows unfold; returns what undoes it. */
export function lockWrites(el: HTMLElement): () => void {
  const lock = () => {
    for (const c of el.querySelectorAll<Field>('input, select, textarea, button')) {
      if (c.disabled || c.matches(READS)) continue
      c.disabled = true
      c.dataset.viewLocked = ''
    }
  }
  lock()
  const seen = new MutationObserver(lock)
  seen.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] })
  return () => {
    seen.disconnect()
    for (const c of el.querySelectorAll<Field>('[data-view-locked]')) {
      c.disabled = false
      delete c.dataset.viewLocked
    }
  }
}

function ReadingLock({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => (box.current ? lockWrites(box.current) : undefined), [])
  return (
    <div ref={box} className="view-lock reading">
      {children}
    </div>
  )
}

export function ViewLock({ children, after = false, why, reading = false }: Props) {
  const setMode = usePhoneMode(s => s.setMode)
  const locked = useContext(LockedFor)
  const note = why ? (
    <div className={`view-lock-note elsewhere${after ? ' after' : ''}`}>
      <span>{why.text}</span>
      <button className="secondary-sm" onClick={why.go}>
        {why.label}
      </button>
    </div>
  ) : locked ? (
    <div className={`view-lock-note${after ? ' after' : ''}`}>
      <span>{locked.text}</span>
    </div>
  ) : (
    <div className={`view-lock-note${after ? ' after' : ''}`}>
      <span>{reading ? 'View: everything here opens to read. Tap Edit to change an answer.' : 'View: one finger pans, nothing moves. Tap Edit to change the plan.'}</span>
      <button className="secondary-sm" onClick={() => setMode('edit')}>
        <Icon name="pencil" size={14} /> Edit
      </button>
    </div>
  )
  return (
    <>
      {!after && note}
      {reading ? (
        <ReadingLock>{children}</ReadingLock>
      ) : (
        <fieldset className="view-lock" disabled>
          {children}
        </fieldset>
      )}
      {after && note}
    </>
  )
}
