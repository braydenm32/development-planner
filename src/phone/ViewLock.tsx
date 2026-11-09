// View on a phone reads but never changes the plan: a panel's fields and buttons are
// locked, with one line that says so and the way to Edit.

import { useContext, type ReactNode } from 'react'
import { Icon } from '../nav/icons'
import { usePhoneMode } from './device'
import { LockedFor } from './lockedFor'

interface Props {
  children: ReactNode
  /** The line goes after what it locks (the selection, whose numbers lead) rather than before (a panel). */
  after?: boolean
}

export function ViewLock({ children, after = false }: Props) {
  const setMode = usePhoneMode(s => s.setMode)
  const locked = useContext(LockedFor)
  const note = locked ? (
    <div className={`view-lock-note${after ? ' after' : ''}`}>
      <span>{locked.text}</span>
    </div>
  ) : (
    <div className={`view-lock-note${after ? ' after' : ''}`}>
      <span>View: one finger pans, nothing moves. Tap Edit to change the plan.</span>
      <button className="secondary-sm" onClick={() => setMode('edit')}>
        <Icon name="pencil" size={14} /> Edit
      </button>
    </div>
  )
  return (
    <>
      {!after && note}
      <fieldset className="view-lock" disabled>
        {children}
      </fieldset>
      {after && note}
    </>
  )
}
