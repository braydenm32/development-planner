// The quiet "Offline" word in the top bar while there's no connection: tap it for what still
// works (everything you draw, and saving on this device) and what waits for the connection.

import { useEffect, useRef, useState } from 'react'
import { useCloud } from '../cloud/state'
import { Icon } from '../nav/icons'
import { useOnline } from './state'
import '../cloud/cloud.css'
import './offline.css'

export const OFFLINE_DETAIL =
  'You’re offline. Everything you draw, check and print still works, and your work keeps saving on this device. Signing in, cloud saves, share links, comments and the NSW map need a connection, and come back when it does.'

export function OfflineChip() {
  const online = useOnline()
  // Signed in, the sync chip already says Offline once it has found out.
  const syncSays = useCloud(s => s.phase === 'signed-in' && s.sync.offline)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      wrap.current?.querySelector<HTMLElement>('.cl-chip')?.focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc, true)
    }
  }, [open])
  if (online || syncSays) return null
  return (
    <div ref={wrap} className="cloud-ui cl-chip-wrap cl-in-shell of-chip-wrap">
      <button className="cl-chip muted of-chip" aria-haspopup="dialog" aria-expanded={open} aria-label="Offline" title={OFFLINE_DETAIL} onClick={() => setOpen(!open)}>
        <Icon name="cloudOff" size={16} />
        <span className="cl-chip-label">Offline</span>
      </button>
      {open && (
        <div className="cl-pop" role="dialog" aria-label="Offline" data-overlay>
          <div className="cl-status muted">
            <Icon name="cloudOff" size={18} />
            <p>{OFFLINE_DETAIL}</p>
          </div>
        </div>
      )}
    </div>
  )
}
