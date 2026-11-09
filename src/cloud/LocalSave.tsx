// Where the work is saved, said plainly while not signed in: "Saved in this browser · 2:14 pm" in
// the top bar and the project menu, with a gentle word that it's only on this device (sign in to
// save it to the cloud, or download a backup project file). Signed in, the sync chip says it
// instead. ⌘S / Ctrl+S (saveNow, in ./saveState.ts) saves now and says where.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Icon } from '../nav/icons'
import { useProjects } from '../projects/session'
import { localSaveLook, type LocalSaveLook } from './saveState'
import { cloudActions, useCloud } from './state'
import './cloud.css'

function useLocalSave(): LocalSaveLook | null {
  const phase = useCloud(s => s.phase)
  const p = useProjects()
  // The time shown moves on from "2:14 pm" to "8 Nov" at midnight; a minute's tick is plenty.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return localSaveLook({ phase, saved: p.current?.updated ?? null, saveError: p.saveError, memoryOnly: p.memoryOnly, persisted: p.persisted }, now)
}

/** The top bar's quiet word on saving, while not signed in. Tap for where it is and what to do. */
export function LocalSaveChip({ onDownload }: { onDownload: () => void }) {
  const look = useLocalSave()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  if (!look) return null
  return (
    <div ref={wrap} className={`cloud-ui cl-chip-wrap cl-in-shell ls-wrap ${look.tone}`}>
      <button
        className={`cl-chip ls-chip ${look.tone}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${look.label}${look.at ? ` at ${look.at}` : ''}`}
        title={look.detail}
        onClick={() => setOpen(!open)}
      >
        <Icon name={look.icon} size={15} />
        <span className="ls-label">{look.label}</span>
        {look.at && (
          <span className="ls-at">
            <span className="ls-label" aria-hidden="true">
              {' '}
              ·{' '}
            </span>
            {look.at}
          </span>
        )}
      </button>
      {open && <SavePop wrap={wrap} look={look} onDownload={onDownload} onClose={() => setOpen(false)} />}
    </div>
  )
}

function SavePop({ wrap, look, onDownload, onClose }: { wrap: RefObject<HTMLDivElement | null>; look: LocalSaveLook; onDownload: () => void; onClose: () => void }) {
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
    <div ref={pop} className="cl-pop" role="dialog" aria-label="Where your work is saved">
      <div className={`cl-status ${look.tone}`}>
        <Icon name={look.icon} size={18} />
        <p>{look.detail}</p>
      </div>
      <div className="cl-pop-actions">
        {look.signIn && (
          <button className="cl-btn primary" onClick={then(() => cloudActions.open('sign-in'))}>
            Sign in
          </button>
        )}
        <button className="cl-btn" onClick={then(onDownload)}>
          <Icon name="download" size={16} />
          Download a backup
        </button>
      </div>
    </div>
  )
}

/**
 * The project menu's line on saving (the top bar has no room for it on a phone), with a backup to
 * download. The nudge to sign in is the menu's cloud item, just below it.
 */
export function LocalSaveLine({ onDownload }: { onDownload: () => void }) {
  const look = useLocalSave()
  if (!look) return null
  return (
    <div data-item="save-state" className={`cloud-ui ls-line ${look.tone}`} role="status">
      <span className="ls-line-head">
        <Icon name={look.icon} size={15} />
        <b>{look.label}</b>
        {look.at && <span> · {look.at}</span>}
      </span>
      <span className="ls-line-text">
        {look.tone === 'warn' ? look.detail : 'Only on this device.'}{' '}
        <button className="cl-link" onClick={onDownload}>
          Download a backup
        </button>
      </span>
    </div>
  )
}
