// Comments on the plan: numbered pins where each was left, a card to read one (and, for the
// owner, Resolve or Delete it), and for someone with a share link, Add a comment's "tap the spot"
// and the card to write it. The plan (src/components/PlanEditor.tsx) calls useCommentsPlan with
// its own way from the house's frame to the screen, so pins move with the view and stay on
// their spot of the block. Every comment is shown as text, never as markup.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import { Card, CommentsKey, ComposeCard, OwnerBody, PlacingBar, SentBar, ViewerBody } from './CommentCards'
import { floorOf, numbered, spotAt, surveyToPlan, whoWrote, type OwnerComment, type ViewerComment } from './model'
import { commentActions, useComments } from './store'
import './comments.css'

/** Shown for a few seconds once a comment has gone. */
const SENT_MS = 5000

interface Args {
  plan: Plan
  /** The floor showing. */
  level: string
  /** The house's frame to screen pixels. */
  S: (p: Vec2) => Vec2
  /** The plan's size on screen. */
  size: { w: number; h: number }
  /** Bring these points (the house's frame) into view. */
  fitTo: (pts: Vec2[]) => void
}

export interface CommentsPlan {
  /** A tap on the plan (the house's frame): pins a new comment while Add a comment waits for one. True if it was used. */
  click: (world: Vec2) => boolean
  /** The pins, drawn just after the plan so the plan's own buttons, key and sheets sit over them. */
  pins: ReactNode
  /** The cards and bars, over everything on the plan. */
  html: ReactNode
  /** The plan key's switch for the owner, when there are comments to show. */
  key: ReactNode
}

type Pinned = ViewerComment | OwnerComment

export function useCommentsPlan({ plan, level, S, size, fitTo }: Args): CommentsPlan {
  const side = useComments(s => s.side)
  const pins = useComments(s => s.pins)
  const owned = useComments(s => s.comments)
  const seen = useComments(s => s.seen)
  const placing = useComments(s => s.placing)
  const draft = useComments(s => s.draft)
  const open = useComments(s => s.open)
  const focus = useComments(s => s.focus)
  const sent = useComments(s => s.sent)

  const list: Pinned[] = useMemo(() => (side === 'viewer' ? seen : side === 'owner' && pins ? (owned ?? []) : []), [side, seen, owned, pins])
  const numbers = useMemo(() => numbered(list), [list])
  const here = list.filter(c => floorOf(c, plan) === level)
  const at = (c: { x: number; y: number }) => S(surveyToPlan(c, plan.placement))

  // Esc leaves Add a comment, the comment being written, or the card open.
  const busy = placing || !!draft || !!open
  useEffect(() => {
    if (!busy) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') commentActions.cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy])

  // Show on plan: to its floor first (which brings back that floor's view), then to the pin.
  const fitRef = useRef(fitTo)
  useEffect(() => {
    fitRef.current = fitTo
  })
  const done = useRef(0)
  useEffect(() => {
    if (!focus || focus.n === done.current) return
    const c = list.find(x => x.id === focus.id)
    if (!c) return
    const floor = floorOf(c, plan)
    if (floor !== level) {
      usePlan.getState().setActiveLevel(floor)
      return
    }
    done.current = focus.n
    const [px, py] = surveyToPlan(c, plan.placement)
    const r = 8
    fitRef.current([
      [px - r, py - r],
      [px + r, py + r],
    ])
  }, [focus, list, level, plan])

  // "Sent", for a few seconds: until the send it was for is put away.
  const [putAway, setPutAway] = useState(0)
  useEffect(() => {
    if (!sent) return
    const t = setTimeout(() => setPutAway(sent), SENT_MS)
    return () => clearTimeout(t)
  }, [sent])

  const click = (world: Vec2) => {
    if (side !== 'viewer' || !placing) return false
    commentActions.place(spotAt(world, level, plan.placement))
    return true
  }

  const openOne = list.find(c => c.id === open && floorOf(c, plan) === level) ?? null
  const pinsHtml =
    side === null ? null : (
      <>
        {here.map(c => {
          const [x, y] = at(c)
          if (x < -40 || y < -40 || x > size.w + 40 || y > size.h + 40) return null
          const n = numbers.get(c.id)
          const resolved = side === 'owner' ? (c as OwnerComment).resolved !== null : (c as ViewerComment).resolved
          return (
            <button
              key={c.id}
              type="button"
              className={`cm-pin${resolved ? ' resolved' : ''}${open === c.id ? ' on' : ''}`}
              style={{ left: x, top: y }}
              onClick={() => commentActions.openCard(open === c.id ? null : c.id)}
              aria-label={`Comment ${n}, ${resolved ? 'resolved, ' : ''}from ${side === 'viewer' && (c as ViewerComment).mine ? 'you' : whoWrote(c)}: ${c.text.slice(0, 80)}`}
              aria-expanded={open === c.id}
            >
              {n}
            </button>
          )
        })}
        {draft && floorOf(draft, plan) === level && <i className="cm-pin draft" style={{ left: at(draft)[0], top: at(draft)[1] }} aria-hidden="true" />}
      </>
    )
  const html =
    side === null ? null : (
      <>
        {placing && <PlacingBar />}
        {!placing && !draft && sent > putAway && side === 'viewer' && <SentBar />}
        {draft && <ComposeCard place={cardPlace(at(draft), size)} />}
        {openOne && !draft && (
          <Card place={cardPlace(at(openOne), size)} n={numbers.get(openOne.id) ?? 0}>
            {side === 'owner' ? <OwnerBody c={openOne as OwnerComment} /> : <ViewerBody c={openOne as ViewerComment} />}
          </Card>
        )}
      </>
    )

  const key = side === 'owner' && owned && owned.length > 0 ? <CommentsKey on={pins} fresh={owned.filter(c => c.resolved === null).length} /> : null
  return { click, pins: pinsHtml, html, key }
}

/** Where a card goes: beside its pin, inside the plan. On a phone it sits along the bottom instead (comments.css). */
function cardPlace([x, y]: Vec2, size: { w: number; h: number }, w = 300, h = 240): { left: number; top: number } {
  const left = x + 30 + w <= size.w - 12 ? x + 30 : Math.max(12, x - 30 - w)
  const top = Math.min(Math.max(64, y - 60), Math.max(64, size.h - h - 12))
  return { left, top }
}
