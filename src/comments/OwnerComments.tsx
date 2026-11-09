// The owner's side of comments, in the app: reading the open project's comments while signed in
// (and again when the page comes back), the badge for new ones where the share links live, each
// link's setting and count in Share › Send, the ticks for the next link, and the list of
// comments with Show on plan, Resolve and Delete. The pins and their cards are on the plan
// (./PlanComments.tsx).

import { Icon } from '../nav/icons'
import { navigate, useRouter } from '../nav/router'
import { usePlan } from '../plan/store'
import { levelById, sortedLevels } from '../plan/model'
import { edited } from '../projects/format'
import type { ShareLink } from '../share-links/api'
import { shareLinkActions } from '../share-links/store'
import { countWords, floorOf, linkName, newCount, numbered, ownerOrder, whoWrote, type CommentMode, type OwnerComment } from './model'
import { useNow, useOwnerComments } from './hooks'
import { commentActions, useComments } from './store'
import './comments.css'

/**
 * How many comments are new, as a small badge: on Share in the areas and on its Send tab, where
 * the share links live. The one on Share also keeps the comments read (it shows wherever a
 * project is open).
 */
export function CommentsBadge({ keep = false }: { keep?: boolean }) {
  if (keep) return <KeptBadge />
  return <Badge />
}

function KeptBadge() {
  useOwnerComments()
  return <Badge />
}

function Badge() {
  const n = useComments(s => (s.side === 'owner' ? newCount(s.counts) : 0))
  if (!n) return null
  return (
    <span className="cm-badge" aria-label={`${n} new comment${n === 1 ? '' : 's'}`} title={`${n} new comment${n === 1 ? '' : 's'} from share links`}>
      {n > 99 ? '99+' : n}
    </span>
  )
}

/** "2 comments" for a link in the list, with a "1 new" badge (not a link), or nothing. */
export function LinkCommentCount({ link }: { link: ShareLink }) {
  const c = useComments(s => s.counts[link.id])
  const words = countWords(c ? { total: c.total, new: 0 } : undefined)
  if (!words || !c) return null
  return (
    <span className="sl-cm-count">
      {' · '}
      {words}
      {c.new > 0 && <b className="cm-new">{c.new} new</b>}
    </span>
  )
}

/** Two ticks: let people comment (worded for the new link or this one), and whether they see each other's comments. */
function ModeTicks({ mode, onChange, disabled, label, tick }: { mode: CommentMode; onChange: (m: CommentMode) => void; disabled?: boolean; label: string; tick: string }) {
  return (
    <div className="sl-cm" role="group" aria-label={label}>
      <label className="sl-check">
        <input type="checkbox" checked={mode !== 'off'} disabled={disabled} onChange={e => onChange(e.target.checked ? 'own' : 'off')} />
        {tick}
      </label>
      {mode !== 'off' && (
        <label className="sl-check sl-check-sub">
          <input type="checkbox" checked={mode === 'all'} disabled={disabled} onChange={e => onChange(e.target.checked ? 'all' : 'own')} />
          They see each other’s comments
        </label>
      )}
    </div>
  )
}

/** A link's comments setting, in its row. */
export function LinkCommentsSetting({ projectId, link }: { projectId: string; link: ShareLink }) {
  return <ModeTicks mode={link.comments ?? 'off'} label="Comments on this link" tick="This link: comments on" onChange={m => void commentActions.setMode(projectId, link.id, m)} />
}

/** Whether the next link takes comments: off unless ticked. */
export function NextLinkComments({ mode = 'off', disabled }: { mode?: CommentMode; disabled?: boolean }) {
  return <ModeTicks mode={mode} disabled={disabled} label="Comments on the new link" tick="New links: let people comment" onChange={m => shareLinkActions.setComments(m)} />
}

/** Share › Send: the project's comments from its links, new first, each to show on the plan, resolve or delete. */
export function CommentsSection({ projectId }: { projectId: string }) {
  const side = useComments(s => s.side)
  const listFor = useComments(s => s.projectId)
  const comments = useComments(s => s.comments)
  const counts = useComments(s => s.counts)
  const problem = useComments(s => s.problem)
  const plan = usePlan(s => s.plan)
  const route = useRouter(s => s.route)
  const now = useNow()
  if (side !== 'owner' || listFor !== projectId || !comments?.length) return null
  const numbers = numbered(comments)
  const fresh = comments.filter(c => c.resolved === null).length
  const floors = !!plan && sortedLevels(plan).length > 1
  const show = (c: OwnerComment) => {
    // To the plan, if the 3D view is showing.
    if (route.kind === 'app' && route.view !== 'plan') navigate({ ...route, view: 'plan' })
    commentActions.show(c.id)
  }
  return (
    <section className="share-links cm-list" aria-label="Comments from share links">
      <h3 className="sl-title">
        <Icon name="comment" size={16} /> Comments from share links
        {fresh > 0 && <b className="cm-new">{fresh} new</b>}
      </h3>
      <p className="sl-line muted">Pinned on the plan by people with a link. Resolve one once you’ve dealt with it.</p>
      {problem && (
        <p className="sl-problem" role="alert">
          {problem}
        </p>
      )}
      <ol>
        {ownerOrder(comments).map(c => (
          <li key={c.id} className={c.resolved !== null ? 'resolved' : undefined}>
            <span className="cm-num" aria-hidden="true">
              {numbers.get(c.id)}
            </span>
            <div className="cm-body">
              <p className="cm-text">{c.text}</p>
              <p className="cm-from muted">
                {whoWrote(c)} · {edited(c.created, now)} · from {linkName(counts[c.link], now)}
                {floors && plan ? ` · ${levelById(plan, floorOf(c, plan))?.name ?? ''}` : ''}
                {c.resolved !== null ? ' · resolved' : ''}
              </p>
              <span className="sl-acts">
                <button type="button" className="sl-btn quiet" onClick={() => show(c)} aria-label={`Show comment ${numbers.get(c.id)} on the plan`}>
                  Show on plan
                </button>
                {c.resolved === null ? (
                  <button type="button" className="sl-btn quiet" onClick={() => void commentActions.resolve(c.id, true)} aria-label={`Resolve comment ${numbers.get(c.id)}`}>
                    Resolve
                  </button>
                ) : (
                  <button type="button" className="sl-btn quiet" onClick={() => void commentActions.resolve(c.id, false)} aria-label={`Reopen comment ${numbers.get(c.id)}`}>
                    Reopen
                  </button>
                )}
                <button type="button" className="sl-btn quiet" onClick={() => commentActions.remove(c.id)} aria-label={`Delete comment ${numbers.get(c.id)}`}>
                  Delete
                </button>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
