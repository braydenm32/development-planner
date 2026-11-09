// The quiet sync chip: Saved, Saving…, Offline, or what needs you. Tap for what happened and
// Sync now. In the top bar, only while signed in.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Icon } from '../nav/icons'
import { edited } from '../projects/format'
import { cloudActions, useCloud } from './state'
import { chipLook, noticeText } from './words'
import './cloud.css'

export function SyncChip() {
  const phase = useCloud(s => s.phase)
  const sync = useCloud(s => s.sync)
  const notices = useCloud(s => s.notices.length)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const anyInCloud = useCloud(s => s.inCloud.length > 0)
  if (phase !== 'signed-in') return null
  const look = chipLook(sync, anyInCloud)
  // All well and nothing to read: on a phone's crowded top bar it steps back (⋯ › Cloud saves has it).
  const calm = look.tone === 'quiet' && !notices && !open
  return (
    <div ref={wrap} className={`cloud-ui cl-chip-wrap cl-in-shell${calm ? ' calm' : ''}`}>
      <button
        className={`cl-chip ${look.tone}${sync.busy ? ' busy' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Cloud: ${look.label}${notices ? `, ${notices} to read` : ''}`}
        title={look.detail}
        onClick={() => setOpen(!open)}
      >
        <Icon name={look.icon} size={16} />
        <span className="cl-chip-label">{look.label}</span>
        {notices > 0 && <i className="cl-dot" aria-hidden="true" />}
      </button>
      {open && <SyncPop wrap={wrap} onClose={() => setOpen(false)} />}
    </div>
  )
}

function SyncPop({ wrap, onClose }: { wrap: RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const sync = useCloud(s => s.sync)
  const notices = useCloud(s => s.notices)
  const anyInCloud = useCloud(s => s.inCloud.length > 0)
  const look = chipLook(sync, anyInCloud)
  const pop = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useLayoutEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    pop.current?.querySelector<HTMLElement>('button')?.focus()
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close.current()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
        wrap.current?.querySelector<HTMLElement>('.cl-chip')?.focus()
      }
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc, true)
    }
  }, [wrap])
  const then = (fn: () => void) => () => {
    onClose()
    fn()
  }
  return (
    <div ref={pop} className="cl-pop" role="dialog" aria-label="Cloud saves">
      <div className={`cl-status ${look.tone}`}>
        <Icon name={look.icon} size={18} />
        <p>{look.detail}</p>
      </div>
      {notices.length > 0 && (
        <ul className="cl-notices">
          {notices.map(n => (
            <li key={`${n.at}-${n.id ?? n.name}-${n.kind}`}>
              {noticeText(n)} <span className="cl-muted">{edited(n.at)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="cl-pop-actions">
        {sync.signedOut ? (
          <button className="cl-btn primary" onClick={then(() => cloudActions.open('sign-in'))}>
            Sign in again
          </button>
        ) : (
          <button className="cl-btn" onClick={() => void cloudActions.syncNow()} disabled={sync.busy > 0}>
            Sync now
          </button>
        )}
        {notices.length > 0 && (
          <button className="cl-link" onClick={cloudActions.dismissNotices}>
            Clear
          </button>
        )}
        <span className="cl-grow" />
        <button className="cl-link" onClick={then(() => cloudActions.open('account'))}>
          Account…
        </button>
      </div>
    </div>
  )
}
