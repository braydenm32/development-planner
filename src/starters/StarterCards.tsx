// "Start from a house": a row of cards, one for each starter, each with a little plan drawn from
// its own walls and what it has. On the start screen, in Getting started, and in Design (the
// empty plan's tip and Design › More › Start from a house). Picking one goes to ./flow.ts.

import { useId, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Vec2 } from '../lib/geom'
import { pointOnWall, sortedLevels, wallDir, type Plan } from '../plan/model'
import { Icon } from '../nav/icons'
import { useModal } from '../nav/useModal'
import { useSafety } from '../safety/store'
import { startFromHouse } from './flow'
import '../cloud/cloud.css'
import { factsLine, sizeLine, starterFacts } from './facts'
import { starters } from './houses'
import './starters.css'

/** The house's ground: its lowest level and any beside it (a split level), front at the bottom. */
export function StarterThumb({ plan, size = 132 }: { plan: Plan; size?: number }) {
  const { walls, gaps, box } = useMemo(() => {
    const low = sortedLevels(plan)[0]
    const shown = new Set(plan.levels.filter(l => l.elevation < low.elevation + low.height).map(l => l.id))
    const ws = plan.walls.filter(w => shown.has(w.level))
    const xs = ws.flatMap(w => [w.a[0], w.b[0]])
    const ys = ws.flatMap(w => [w.a[1], w.b[1]])
    const pad = 0.6
    const box = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad }
    const gaps = plan.openings.flatMap(o => {
      const w = ws.find(x => x.id === o.wall)
      if (!w) return []
      const d = wallDir(w)
      const c = pointOnWall(w, o.offset)
      const half = o.width / 2
      const a: Vec2 = [c[0] - d[0] * half, c[1] - d[1] * half]
      const b: Vec2 = [c[0] + d[0] * half, c[1] + d[1] * half]
      return [{ id: o.id, a, b, t: w.thickness, kind: o.kind }]
    })
    return { walls: ws, gaps, box }
  }, [plan])
  // y runs back from the street: flipped, so the front is at the bottom as on a printed plan.
  const Y = (y: number) => box.y + box.h - (y - box.y)
  const scale = Math.max(box.w, box.h)
  return (
    <svg className="sc-thumb" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} width={size} height={size} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {walls.map(w => (
        <line key={w.id} x1={w.a[0]} y1={Y(w.a[1])} x2={w.b[0]} y2={Y(w.b[1])} className="sc-wall" strokeWidth={Math.max(w.thickness, scale / 90)} />
      ))}
      {gaps.map(g => (
        <line key={g.id} x1={g.a[0]} y1={Y(g.a[1])} x2={g.b[0]} y2={Y(g.b[1])} className={`sc-gap sc-${g.kind}`} strokeWidth={Math.max(g.t, scale / 90) + 0.02} />
      ))}
    </svg>
  )
}

interface Props {
  onPick: (id: string) => void
  /** The heading, or none where the place around it has one. */
  title?: string | null
  /** A line under the heading on where the house goes. */
  note?: string
}

export function StarterCards({ onPick, title = 'Or start from a house', note }: Props) {
  const busy = useSafety(s => s.busy)
  const list = useMemo(() => starters().map(s => ({ ...s, facts: starterFacts(s.plan) })), [])
  return (
    <section className="starters" aria-label={title ?? 'Start from a house'}>
      {title && <h2 className="sc-title">{title}</h2>}
      {note && <p className="sc-note">{note}</p>}
      <ul className="sc-row">
        {list.map(s => (
          <li key={s.id}>
            <button type="button" className="sc-card" onClick={() => onPick(s.id)} disabled={busy} title={s.blurb}>
              <StarterThumb plan={s.plan} />
              <span className="sc-name">{s.name}</span>
              <span className="sc-facts">{factsLine(s.facts)}</span>
              <span className="sc-size">{sizeLine(s.facts)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The cards in a sheet over the plan, from the empty plan's tip. */
export function StarterSheet({ onClose }: { onClose: () => void }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  useModal(ref, true, onClose)
  // On the page itself, not inside the tip it opens from, so it covers the whole window.
  return createPortal(
    <div className="cloud-ui cl-scrim" onPointerDown={e => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="cl-sheet sc-sheet" role="dialog" aria-modal="true" aria-labelledby={id}>
        <header className="cl-head">
          <h2 id={id}>Start from a house</h2>
          <button className="cl-x" aria-label="Close" onClick={onClose} data-autofocus>
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="cl-body">
          <StarterCards
            title={null}
            note="A made-up starter plan, put in the middle of your block facing the street. Move it, turn it and change anything; Undo takes it away."
            onPick={pick => {
              onClose()
              void startFromHouse(pick)
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Design › More › Start from a house. */
export function StarterHousesSection() {
  return <StarterCards title={null} note="A made-up starter plan to change as you like. On an empty block it goes in the middle, facing the street; with a house drawn, you choose to replace it or add this one beside it. Undo takes it away." onPick={id => void startFromHouse(id)} />
}
