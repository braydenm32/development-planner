// Share › Send: "Share a view-only link" for the open project, lasting 30 days, 90 days or a
// year, the link just made with Copy and the phone's share sheet, and the project's links with
// when each was made, works until and was last opened, each with Add 30 days and Turn off. Only
// where the app has its cloud (not on GitHub Pages). A link can take comments on the plan too:
// its ticks, its count and the comments left are from src/comments.

import { useEffect, useRef, useState } from 'react'
import { CommentsSection, LinkCommentCount, LinkCommentsSetting, NextLinkComments } from '../comments/OwnerComments'
import { commentActions, useComments } from '../comments/store'
import { cloudActions, useCloud, type CloudState } from '../cloud/state'
import { Icon } from '../nav/icons'
import { tabRoute } from '../nav/route'
import { navigate, useRouter } from '../nav/router'
import { edited, onDay } from '../projects/format'
import { useProjects } from '../projects/session'
import { linkTo } from '../shell/links'
import { EXTEND_DAYS, LINK_DAYS, MAX_DAYS, type ShareLink } from './api'
import { lengthName, worksUntil } from './length'
import { shareLinkActions, useShareLinks, type ShareLinksState } from './store'
import './share-links.css'

/** The one line that says what a link gives away. */
export const WHO_SEES = 'Anyone with the link can see this project, including the block’s survey. They can’t change anything.'

/** Where the app has no cloud, why there's no link to make. */
export const NO_CLOUD_LINKS = 'View-only links need the online version of Contour & Gable. The project file below works anywhere.'

type Nav = Pick<Navigator, 'share'> & Partial<Pick<Navigator, 'clipboard'>>

const DAY = 86_400_000

/** Whether a link still works at `now`. */
const works = (now: number) => (l: ShareLink) => l.expires === null || l.expires > now

/** Whether Add 30 days has its whole 30 days to add (a link ends at most a year from now). */
const roomToExtend = (l: ShareLink, now: number) => l.expires !== null && l.expires + EXTEND_DAYS * DAY <= now + MAX_DAYS * DAY

/** Whether this browser has a share sheet for a link. */
const canShareLink = (nav: Partial<Nav> | undefined = globalThis.navigator) => typeof nav?.share === 'function'

export function ShareLinksSection() {
  const phase = useCloud(s => s.phase)
  const projectId = useProjects().currentId
  const inCloud = useCloud(s => !!projectId && s.inCloud.includes(projectId))
  const state = useShareLinks()
  // The time, a minute at a time, so days left and ended links stay true while it shows.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // The list, once signed in and the project is in the cloud (again when it opens or arrives there).
  useEffect(() => {
    if (phase === 'signed-in' && projectId && inCloud) {
      void shareLinkActions.load(projectId)
      void commentActions.loadOwner(projectId)
    }
  }, [phase, projectId, inCloud])

  // Comments not yet resolved come first, above the links, so they aren't missed below the fold.
  const waiting = useComments(s => (s.side === 'owner' && s.projectId === projectId ? (s.comments ?? []).filter(c => c.resolved === null).length : 0))
  const comments = phase === 'signed-in' && projectId ? <CommentsSection projectId={projectId} /> : null
  return (
    <>
      {waiting > 0 && comments}
      <ShareLinksBody phase={phase} projectId={projectId} inCloud={inCloud} state={state} now={now} />
      {waiting === 0 && comments}
    </>
  )
}

/** What the section shows for the cloud's phase, the open project and its links. */
export function ShareLinksBody({ phase, projectId, inCloud, state, now }: { phase: CloudState['phase']; projectId: string | null; inCloud: boolean; state: ShareLinksState; now: number }) {
  const { links, making, problem, fresh, days, extending, projectId: listFor } = state
  // Not known yet: nothing, so it doesn't flicker.
  if (phase !== 'signed-in' && phase !== 'signed-out' && phase !== 'unavailable') return null
  if (!projectId) return null

  const head = (
    <h3 className="sl-title">
      <Icon name="link" size={16} /> View-only link
    </h3>
  )

  // No cloud here (GitHub Pages, a copy run at home): say so, rather than leave the links out unexplained.
  if (phase === 'unavailable')
    return (
      <section className="share-links" aria-label="View-only link">
        {head}
        <p className="sl-line muted">{NO_CLOUD_LINKS}</p>
      </section>
    )

  if (phase === 'signed-out')
    return (
      <section className="share-links" aria-label="View-only link">
        {head}
        <p className="sl-line">Show the plan, the 3D view and the numbers to anyone, on any phone or computer, with no sign-in for them.</p>
        <button className="sl-btn" onClick={() => cloudActions.open('sign-in', 'share')}>
          <Icon name="cloud" size={16} /> Sign in to share a link
        </button>
      </section>
    )

  const mine = listFor === projectId
  const list = (mine ? (links ?? []) : []).filter(works(now))
  const shownFresh = mine && fresh?.projectId === projectId && list.some(l => l.id === fresh.linkId) ? fresh : null
  const busy = mine && making !== null
  return (
    <section className="share-links" aria-label="View-only link">
      {head}
      <p className="sl-line sl-who">{WHO_SEES}</p>
      {!inCloud && !busy && <p className="sl-line muted">This project is on this device only. Making a link saves it to the cloud first.</p>}
      <div className="sl-length">
        <span className="sl-length-label" id="sl-length-label">
          Works for
        </span>
        <div className="sl-seg" role="radiogroup" aria-labelledby="sl-length-label">
          {LINK_DAYS.map(d => (
            <button key={d} role="radio" aria-checked={days === d} disabled={busy} onClick={() => shareLinkActions.setDays(d)}>
              {lengthName(d)}
            </button>
          ))}
        </div>
      </div>
      <NextLinkComments mode={state.comments} disabled={busy} />
      <button className="sl-btn primary" disabled={busy} onClick={() => void shareLinkActions.make(projectId)}>
        <Icon name="link" size={16} />
        {busy ? (making === 'upload' ? 'Saving to the cloud…' : 'Making the link…') : inCloud ? 'Share a view-only link' : 'Save to the cloud and share a link'}
      </button>
      {mine && problem && (
        <p className="sl-problem" role="alert">
          {problem}
        </p>
      )}
      {shownFresh && <FreshLink key={shownFresh.url} url={shownFresh.url} expires={list.find(l => l.id === shownFresh.linkId)?.expires ?? null} now={now} />}
      {list.length > 0 && (
        <div className="sl-list">
          <h4>
            {list.length === 1 ? 'Link that works now' : `${list.length} links that work now`}
          </h4>
          <ul>
            {list.map(l => {
              const until = worksUntil(l, now)
              const made = edited(l.created, now)
              const room = roomToExtend(l, now)
              return (
                <li key={l.id} className={shownFresh?.linkId === l.id ? 'fresh' : undefined}>
                  <b className="sl-made">Made {made}</b>
                  <span className="sl-meta muted">
                    <span className={until.soon ? 'sl-soon' : undefined}>{until.text}</span>
                    {' · '}
                    {l.lastOpened ? `last opened ${edited(l.lastOpened, now)}` : 'not opened yet'}
                    <LinkCommentCount link={l} />
                  </span>
                  <LinkCommentsSetting projectId={projectId} link={l} />
                  <span className="sl-acts">
                    {l.expires !== null && (
                      <button
                        className="sl-btn quiet"
                        disabled={!room || extending === l.id}
                        title={room ? undefined : 'A link can work for up to a year from today.'}
                        onClick={() => void shareLinkActions.extend(projectId, l)}
                        aria-label={`Add ${EXTEND_DAYS} days to the link made ${made}`}
                      >
                        Add {EXTEND_DAYS} days
                      </button>
                    )}
                    <button className="sl-btn quiet" onClick={() => void shareLinkActions.turnOff(projectId, l)} aria-label={`Turn off the link made ${made}`}>
                      Turn off
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="sl-line muted">A link opens the latest saved version. Turning one off stops it at once, and Add {EXTEND_DAYS} days keeps it going longer.</p>
        </div>
      )}
    </section>
  )
}

/** The link just made: its address, Copy, and the share sheet where the browser has one. */
function FreshLink({ url, expires, now }: { url: string; expires: number | null; now: number }) {
  const [copied, setCopied] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setNote(null)
    } catch {
      // Select it, so it can be copied by hand.
      input.current?.select()
      setNote('Selected: copy it with your keyboard or a long press.')
    }
  }
  const share = async () => {
    try {
      await navigator.share({ url, title: 'House plan', text: 'A view-only link to my house plan.' })
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') void copy()
    }
  }
  return (
    <div className="sl-fresh" role="group" aria-label="The new link">
      <input ref={input} className="sl-url" value={url} readOnly aria-label="View-only link" onFocus={e => e.currentTarget.select()} />
      <div className="sl-fresh-actions">
        <button className="sl-btn" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? 'Copied' : 'Copy link'}
        </button>
        {canShareLink() && (
          <button className="sl-btn" onClick={() => void share()}>
            <Icon name="phoneShare" size={16} />
            Share…
          </button>
        )}
      </div>
      <p className="sl-line muted">{note ?? `Shown only now, so send it on.${expires !== null ? ` It works until ${onDay(expires, now)}.` : ''} You can make another any time.`}</p>
    </div>
  )
}

/** On a phone's Share › Plans: the way to a view-only link, after the files. Only where there is a cloud. */
export function ShareLinkRow() {
  const phase = useCloud(s => s.phase)
  const route = useRouter(s => s.route)
  if (phase !== 'signed-in' && phase !== 'signed-out') return null
  return (
    <a className="share-next" {...linkTo(tabRoute(route, 'share', 'send'), r => navigate(r))}>
      <Icon name="link" size={18} />
      <span>Share a view-only link</span>
      <Icon name="chevR" size={16} />
    </a>
  )
}
