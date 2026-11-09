// The shared view's Add a comment, in the top bar, shown only on a link that takes comments
// (useSharedComments, in ./hooks.ts, reads them). The pin and the card to write it are on the
// plan (./PlanComments.tsx).

import { Icon } from '../nav/icons'
import { commentActions, useComments } from './store'

/** Add a comment, in the top bar: to the plan, then the next tap pins it. */
export function AddCommentButton({ phone, toPlan }: { phone: boolean; toPlan: () => void }) {
  const mode = useComments(s => s.mode)
  const placing = useComments(s => s.placing)
  if (mode === 'off') return null
  const go = () => {
    if (placing) return commentActions.cancel()
    toPlan()
    commentActions.startPlacing()
  }
  return (
    <button
      type="button"
      className={`${phone ? 'labelled-icon' : 'secondary'} cm-add${placing ? ' on' : ''}`}
      onClick={go}
      aria-pressed={placing}
      title="Pin a comment on the plan for the person who shared it"
    >
      <Icon name="comment" size={phone ? 19 : 16} />
      {phone ? <span>Comment</span> : 'Add a comment'}
    </button>
  )
}
