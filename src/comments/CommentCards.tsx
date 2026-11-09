// The cards on the plan for comments from share links (./PlanComments.tsx places them): reading
// one, as someone with the link or as its owner (with Resolve or Reopen, and Delete),
// writing a new one, the bars over the plan, and the plan key's switch. A comment is always
// shown as text, never as markup.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../nav/icons'
import { levelById, sortedLevels } from '../plan/model'
import { usePlan } from '../plan/store'
import { edited, onDay } from '../projects/format'
import { useNow } from './hooks'
import { charCount, floorOf, linkName, NAME_MAX, TEXT_MAX, whoWrote, type OwnerComment, type ViewerComment } from './model'
import { commentActions, useComments } from './store'

const fine = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

export function Card({ place, n, children, label }: { place: { left: number; top: number }; n: number; children: ReactNode; label?: string }) {
  return (
    <div className="cm-card" role="dialog" aria-label={label ?? `Comment ${n}`} style={{ ['--cm-left' as string]: `${place.left}px`, ['--cm-top' as string]: `${place.top}px` }}>
      <button type="button" className="icon-button cm-close" onClick={() => commentActions.openCard(null)} aria-label="Close">
        <Icon name="x" size={15} />
      </button>
      {children}
    </div>
  )
}

/** Someone with the link reading a comment: theirs or another's, and whether it was resolved. */
export function ViewerBody({ c }: { c: ViewerComment }) {
  const now = useNow()
  const who = c.mine ? (c.name ? `You (${c.name})` : 'You') : whoWrote(c)
  return (
    <>
      <p className="cm-meta">
        <b>{who}</b> · {edited(c.created, now)}
      </p>
      <p className="cm-text">{c.text}</p>
      {c.resolved && (
        <p className="cm-tag">
          <Icon name="check" size={14} /> Resolved
        </p>
      )}
    </>
  )
}

/** The owner reading one: who, when, which link, and Resolve (or Reopen) and Delete. */
export function OwnerBody({ c }: { c: OwnerComment }) {
  const now = useNow()
  const plan = usePlan(s => s.plan)
  const link = useComments(s => s.counts[c.link])
  const floors = plan && sortedLevels(plan).length > 1 ? levelById(plan, floorOf(c, plan))?.name : null
  return (
    <>
      <p className="cm-meta">
        <b>{whoWrote(c)}</b> · {edited(c.created, now)}
      </p>
      <p className="cm-text">{c.text}</p>
      <p className="cm-from">
        From {linkName(link, now)}
        {floors ? ` · ${floors}` : ''}
        {c.resolved !== null ? ` · resolved ${onDay(c.resolved, now)}` : ''}
      </p>
      <div className="cm-acts">
        {c.resolved === null ? (
          <button type="button" className="cm-btn" onClick={() => void commentActions.resolve(c.id, true)}>
            <Icon name="check" size={15} /> Resolve
          </button>
        ) : (
          <button type="button" className="cm-btn" onClick={() => void commentActions.resolve(c.id, false)}>
            Reopen
          </button>
        )}
        <button type="button" className="cm-btn quiet" onClick={() => commentActions.remove(c.id)}>
          Delete
        </button>
      </div>
    </>
  )
}

/** Writing a comment at the spot just pinned: the words, a name if they like, and Send. */
export function ComposeCard({ place }: { place: { left: number; top: number } }) {
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const sending = useComments(s => s.sending)
  const problem = useComments(s => s.problem)
  const mode = useComments(s => s.mode)
  const sharedBy = useComments(s => s.sharedBy)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => box.current?.focus({ preventScroll: true }), [])
  const left = TEXT_MAX - charCount(text.trim())
  const send = () => void commentActions.send(text, name)
  return (
    <form
      className="cm-card cm-compose"
      aria-label="Add a comment"
      style={{ ['--cm-left' as string]: `${place.left}px`, ['--cm-top' as string]: `${place.top}px` }}
      onSubmit={e => {
        e.preventDefault()
        send()
      }}
    >
      <button type="button" className="icon-button cm-close" onClick={() => commentActions.cancel()} aria-label="Cancel the comment">
        <Icon name="x" size={15} />
      </button>
      <label className="cm-label" htmlFor="cm-text">
        Your comment
      </label>
      <textarea
        id="cm-text"
        ref={box}
        rows={3}
        value={text}
        placeholder="Move this wall back a metre?"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            send()
          }
        }}
      />
      {left < 100 && <span className={`cm-count${left < 0 ? ' over' : ''}`}>{left < 0 ? `${-left} too many` : `${left} left`}</span>}
      <label className="cm-label" htmlFor="cm-name">
        Your name <span className="muted">(optional)</span>
      </label>
      <input id="cm-name" value={name} maxLength={NAME_MAX * 2} autoComplete="name" placeholder={'Leave it blank to be “Someone with the link”'} onChange={e => setName(e.target.value)} />
      <p className="cm-who">{mode === 'all' ? 'Everyone with this link sees it, with your name if you give one.' : `Only ${sharedBy || 'the person who shared this'} sees it, and you, on this device.`}</p>
      {problem && (
        <p className="cm-problem" role="alert">
          {problem}
        </p>
      )}
      <div className="cm-acts">
        <button type="button" className="cm-btn quiet" onClick={() => commentActions.cancel()}>
          Cancel
        </button>
        <button type="submit" className="cm-btn primary" disabled={sending || !text.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  )
}

export function SentBar() {
  const sharedBy = useComments(s => s.sharedBy)
  return (
    <div className="flow-bar cm-bar" role="status">
      <span>
        <Icon name="check" size={15} /> Sent. {sharedBy || 'The person who shared this'} will see it on their plan.
      </span>
    </div>
  )
}

/** The plan key's switch: the comments from share links on the plan, and how many are new. */
export function CommentsKey({ on, fresh }: { on: boolean; fresh: number }) {
  return (
    <label className="check cm-key">
      <input type="checkbox" checked={on} onChange={e => commentActions.setPins(e.target.checked)} />
      Comments from share links
      {fresh > 0 && <b className="cm-new">{fresh} new</b>}
    </label>
  )
}

/** Add a comment, waiting for the spot: what to do, and Cancel. */
export function PlacingBar() {
  return (
    <div className="flow-bar cm-bar placing" role="status">
      <span>{fine() ? 'Click' : 'Tap'} the spot on the plan your comment is about.</span>
      <button type="button" onClick={() => commentActions.cancel()}>
        Cancel <kbd>Esc</kbd>
      </button>
    </div>
  )
}
