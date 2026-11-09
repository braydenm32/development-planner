// "Key numbers": a small sheet at the bottom of the plan and the 3D view on a phone. A tap,
// or a pull up, opens the Overview with every number. Each number comes from the same helper,
// in the same format, as the strip and the Overview (CALM 8).

import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { RAMP_CSS } from '../lib/colors'
import type { SiteStats } from '../lib/terrain'
import { Icon } from '../nav/icons'
import { m2, netText } from '../shell/format'
import type { KeyNumbers } from '../shell/useKeyNumbers'

/** How far up a pull has to go before letting go opens every number, in px. */
export const PULL_TO_OPEN = 48

interface Props {
  numbers: KeyNumbers
  stats: SiteStats
  /** The sheet's heading ("Key numbers"). */
  title: string
  /** One line, while editing (the tools need the height) or with the phone turned sideways. */
  slim?: boolean
  onOpen: () => void
  /** Its height as it changes, so the plan and the 3D camera can keep clear of it. */
  onHeight?: (h: number) => void
  /** Easements and tree zones the plan reaches into (Site features' amber warnings). */
  checks?: number
  /** A shared view: there's no Site features to send the viewer to, so the line says what they are instead. */
  readOnly?: boolean
}

export function PeekSheet({ numbers: n, stats, title, slim = false, onOpen, onHeight, checks = 0, readOnly = false }: Props) {
  const [pull, setPull] = useState(0)
  const start = useRef<{ y: number; id: number } | null>(null)
  const moved = useRef(false)
  const ref = useRef<HTMLDivElement>(null)

  // Tell what floats on the canvas how tall the sheet is, so it stays clear; the body gets it too,
  // for the toasts that live outside the shell (src/safety).
  useLayoutEffect(() => {
    const el = ref.current
    const shell = el?.closest<HTMLElement>('.app-shell')
    if (!el || !shell || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const h = Math.round(el.getBoundingClientRect().height)
      shell.style.setProperty('--peek-size', `${h}px`)
      document.body.style.setProperty('--peek-size', `${h}px`)
      onHeight?.(h)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      shell.style.removeProperty('--peek-size')
      document.body.style.removeProperty('--peek-size')
    }
  }, [onHeight])

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    start.current = { y: e.clientY, id: e.pointerId }
    moved.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    const dy = e.clientY - s.y
    if (Math.abs(dy) > 6) moved.current = true
    // The sheet follows the finger up, and resists going down.
    setPull(dy < 0 ? Math.min(-dy, 160) : -Math.min(dy, 40) * 0.3)
  }
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current
    start.current = null
    if (!s || s.id !== e.pointerId) return
    const pulled = s.y - e.clientY
    setPull(0)
    if (!moved.current || pulled >= PULL_TO_OPEN) onOpen()
  }

  const roof = n.roof ? `${n.roof.height.toFixed(2)} m above ground` : 'No roof yet'
  // Easements and tree zones first (Site › Features says which), then the balance, then batters.
  const checkText = readOnly ? `${checks} to check: easements and tree zones` : `${checks} to check in Site features`
  const status =
    checks > 0 ? (
      <span className="chip warn">
        <i className="dot" /> {checkText}
      </span>
    ) : n.earth?.outOfBalance ? (
      <span className="chip attn">
        <Icon name="warn" size={14} /> Out of balance · {netText(n.earth.net)}
      </span>
    ) : n.batters ? (
      <span className="chip warn">
        <i className="dot" /> Batters cross {n.batters}
      </span>
    ) : null
  const warn = !!status
  const warnTitle = checks > 0 ? checkText : n.earth?.outOfBalance ? `Out of balance · ${netText(n.earth.net)}` : `Batters cross ${n.batters}`
  return (
    <div
      ref={ref}
      className={`peek-sheet${slim ? ' slim' : ''}${warn ? ' warned' : ''}${pull ? ' pulling' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${title}: key numbers. Open every number`}
      style={pull ? { transform: `translateY(${-pull}px)` } : undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        start.current = null
        setPull(0)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="sheet-grab" aria-hidden="true" />
      <div className="peek-line" aria-hidden={!slim}>
        {warn && <i className="peek-dot" title={warnTitle} />}
        <span>
          Floor <b>{n.floorArea !== null ? m2(n.floorArea) : '–'}</b>
        </span>
        <span>
          FFL <b>RL {n.ffl.toFixed(2)}</b>
        </span>
        {n.roof && (
          <span>
            Roof <b>{n.roof.height.toFixed(2)} m</b>
          </span>
        )}
        <Icon name="chevU" size={16} />
      </div>
      <div className="peek-head">
        <h2>{title}</h2>
        <span className="muted">
          Pull up for every number <Icon name="chevU" size={14} />
        </span>
      </div>
      <dl className="peek-numbers">
        <div>
          <dt>Floor</dt>
          <dd>{n.floorArea !== null ? m2(n.floorArea) : '–'}</dd>
        </div>
        <div>
          <dt>FFL</dt>
          <dd>RL {n.ffl.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Roof</dt>
          <dd>{roof}</dd>
        </div>
      </dl>
      {/* One line of status at most, so the plan keeps its room: the first that applies. */}
      {status && <div className="peek-status">{status}</div>}
      <div className="peek-range" aria-label={`Ground from RL ${stats.minRL.toFixed(2)} to RL ${stats.maxRL.toFixed(2)}`}>
        <span>RL {stats.minRL.toFixed(2)}</span>
        <i style={{ background: RAMP_CSS.replace('to top', 'to right') }} />
        <span>RL {stats.maxRL.toFixed(2)}</span>
      </div>
    </div>
  )
}
