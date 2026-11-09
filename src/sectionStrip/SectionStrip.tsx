// The live section strip under the plan (Design and Earthworks): a cut through the house and the
// ground at the plan's own scale, lined up under it and following its pan and zoom. Each level is a
// band down its left side: a click draws on that level, and a drag up or down moves its floor (the
// stairs that join it re-count as it goes). A roof's eaves line drags too, snapping to another
// level's ceiling or another roof's roofline. On a phone it's a viewer: nothing drags.
//
// The drawing is the same one Design › Sections makes (sections/section.ts, painted by
// sections/paint.ts); this file lays it out on the strip and handles the drags.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { Icon } from '../nav/icons'
import { paintSectionBody, spread } from '../sections/paint'
import { svgPainter } from '../sections/svgPainter'
import { sectionDrawing } from '../sections/section'
import { rlText } from '../sections/common'
import { floorRL, levelById, sortedLevels, type Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import type { Earth } from '../plan/useEarthworks'
import { draggedRL, heightRange, moveLevel, placeEaves, roofCuts, snapEaves, stairsOnLevel, stripFrame, topRL, type StripFrame } from './geometry'
import { FOLDED_H, MAX_H, MIN_H, PHONE_H, setStripHeight, setStripOpen, useStrip, type Cut } from './store'
import '../sections/sections.css'
import './strip.css'

/** Height of the strip's heading (px). */
const HEAD_H = FOLDED_H
/** Gap between level bands down the left (px). */
const BAND_GAP = 30

export interface SectionStripProps {
  plan: Plan
  survey: Survey
  terrain: Terrain
  earth?: Earth | null
  /** House frame to the plan's screen (px), and its scale (px per m). */
  S: (p: Vec2) => Vec2
  k: number
  /** Width of the plan (px). */
  width: number
  /** What floats over the plan's left and right edges (px): the strip's own controls keep clear of them. */
  left: number
  right: number
  cut: Cut
  /** The cut is the one along the house, not one that's been moved. */
  alongHouse: boolean
  /** Put the cut back along the house. */
  onReset: () => void
  /** Turn the plan so the cut runs across it (shown when it doesn't). */
  onLineUp: () => void
  /** Levels and eaves can be dragged (a computer, in Design or Earthworks); otherwise it's a viewer. */
  editable: boolean
  phone: boolean
}

type Drag =
  | { kind: 'level'; id: string; y: number; rl: number; start: Plan; moved: boolean; top: number }
  | { kind: 'eaves'; id: string; y: number; rl: number; start: Plan; moved: boolean; top: number }
  | { kind: 'pan'; y: number; pan: number }
  | { kind: 'size'; y: number; h: number }

/** What a drag says beside the pointer. */
interface Bubble {
  x: number
  y: number
  lines: string[]
  /** A dashed line across the strip at this RL: where the eaves snapped to. */
  guide?: number
}

const signed = (m: number) => `${m >= 0 ? '+' : '−'}${Math.abs(m).toFixed(2)} m`

export function SectionStrip(props: SectionStripProps) {
  const { plan, survey, terrain, earth, S, k, width, left, right, cut, alongHouse, onReset, onLineUp, editable, phone } = props
  const open = useStrip(s => s.open)
  const stored = useStrip(s => s.height)
  const height = !open ? FOLDED_H : phone ? PHONE_H : stored
  const level = usePlan(s => s.activeLevel)
  const frame: StripFrame = stripFrame(cut, S, k)
  const oriented = frame.cut
  // The drawing changes with the plan and the cut, never with the pan or zoom.
  const ax = oriented.a[0]
  const ay = oriented.a[1]
  const bx = oriented.b[0]
  const by = oriented.b[1]
  const grid = earth?.result.grid
  const drawing = useMemo(
    () => sectionDrawing({ id: 'strip', label: 'S', a: [ax, ay], b: [bx, by] }, { plan, survey, terrain, finished: grid }),
    [plan, survey, terrain, grid, ax, ay, bx, by],
  )
  const roofs = useMemo(() => roofCuts(plan, { a: [ax, ay], b: [bx, by] }), [plan, ax, ay, bx, by])

  // How far the drawing's been dragged up or down (m), on the level drawn on: a new level brings it back to the middle.
  const [panned, setPanned] = useState({ level: '', by: 0 })
  const [bubble, setBubble] = useState<Bubble | null>(null)
  const drag = useRef<Drag | null>(null)
  /** What's being dragged, for the styles: a level band or a roof's eave by its id. */
  const [dragging, setDragging] = useState<{ kind: Drag['kind']; id?: string } | null>(null)
  /** While a level or an eave is dragged the drawing holds still, so it stays under the pointer: the RL at its top. */
  const [hold, setHold] = useState<number | null>(null)
  const pan = panned.level === level ? panned.by : 0
  const setPan = (by: number) => setPanned({ level, by })

  // Tell what floats at the foot of the plan how tall the strip is, so it sits above it (the
  // toasts outside the shell read it from the body), as the phone's peek sheet does.
  const box = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const main = box.current?.closest<HTMLElement>('.shell-main')
    const targets = [main, document.body].filter((x): x is HTMLElement => !!x)
    for (const t of targets) t.style.setProperty('--section-strip-h', `${height}px`)
    return () => {
      for (const t of targets) t.style.removeProperty('--section-strip-h')
    }
  }, [height])

  const bodyH = Math.max(0, height - HEAD_H)
  const range = heightRange(drawing)
  const activeRL = floorRL(plan, level)
  const activeH = levelById(plan, level)?.height ?? 2.7
  const zTop = hold ?? topRL(range, activeRL + activeH / 2, bodyH - 20, k, pan) + 14 / k
  const X = (s: number) => frame.x0 + s * k
  const Y = (z: number) => (zTop - z) * k

  const painted = useMemo(() => {
    if (!open || bodyH <= 0) return null
    const p = svgPainter(true)
    paintSectionBody(p, drawing, s => frame.x0 + s * k, z => (zTop - z) * k, bodyH, k)
    return p.els
    // The painter reads only these.
  }, [open, bodyH, drawing, frame.x0, k, zTop])

  // ---- Level bands ----
  const levels = sortedLevels(plan)
  const bandYs = spread(
    levels.map(l => Math.min(bodyH - 16, Math.max(16, Y(floorRL(plan, l.id))))),
    BAND_GAP,
  )
  const bandX = Math.max(8, left + 8)

  const st = usePlan.getState
  const start = (e: ReactPointerEvent<Element>, d: Drag) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = d
    setDragging({ kind: d.kind, id: 'id' in d ? d.id : undefined })
    if (d.kind === 'level' || d.kind === 'eaves') setHold(d.top)
  }
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onMove = (e: ReactPointerEvent<Element>) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y
    if (d.kind === 'pan') {
      setPan(d.pan + dy / k)
      return
    }
    if (d.kind === 'size') {
      const most = Math.min(MAX_H, (box.current?.parentElement?.clientHeight ?? 900) - 160)
      setStripHeight(Math.max(MIN_H, Math.min(most, d.h - dy)), false)
      return
    }
    if (!d.moved && Math.abs(dy) < 3) return
    if (!d.moved) {
      d.moved = true
      st().beginGesture()
    }
    const at = local(e)
    if (d.kind === 'level') {
      const rl = draggedRL(d.rl, dy, k)
      st().preview(() => moveLevel(d.start, d.id, rl))
      const name = levelById(d.start, d.id)?.name ?? 'Level'
      const now = st().plan ?? d.start
      setBubble({ x: at.x, y: at.y, lines: [`${name} · floor RL ${rlText(rl)} (${signed(rl - d.rl)})`, ...stairsOnLevel(now, d.id)] })
    } else {
      const roof = d.start.roofs.find(r => r.id === d.id)
      if (!roof) return
      const landing = snapEaves(d.start, roof, d.rl - dy / k, k)
      st().preview(() => placeEaves(d.start, d.id, landing))
      const cutRoof = roofs.find(r => r.id === d.id)
      const lines = [`${cutRoof?.name ?? 'Roof'} · eaves RL ${rlText(d.rl)} → ${rlText(landing.rl)} (${signed(landing.rl - d.rl)})`]
      if (landing.target) lines.push(`Lines up with the ${landing.target.label}${landing.target.key.startsWith('roof:') ? ', at its pitch' : ''}`)
      else if (landing.own) lines.push('Back on its own walls')
      setBubble({ x: at.x, y: at.y, lines, guide: landing.target || landing.own ? landing.rl : undefined })
    }
  }

  const finish = (cancel: boolean) => {
    const d = drag.current
    drag.current = null
    setDragging(null)
    setHold(null)
    setBubble(null)
    if (!d) return
    if (d.kind === 'size') {
      setStripHeight(useStrip.getState().height)
      return
    }
    if (d.kind === 'pan' || !d.moved) return
    if (cancel) st().preview(() => d.start)
    st().endGesture()
  }

  const onUp = (e: ReactPointerEvent<Element>) => {
    const d = drag.current
    if (d?.kind === 'level' && !d.moved) {
      // A click: draw on that level.
      st().setActiveLevel(d.id)
    }
    finish(false)
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  // Esc puts a drag back where it started.
  useEffect(() => {
    if (!dragging) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      finish(true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  /** Arrow keys on a band move its floor 10 mm (100 mm with Shift), as one Undo step for a run of presses. */
  const bandKey = (e: ReactKeyboardEvent, id: string) => {
    if (!editable || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const step = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.1 : 0.01)
    st().nudge(`strip-level:${id}`, p => moveLevel(p, id, Math.round((floorRL(p, id) + step) * 100) / 100))
  }

  const ends = drawing.ends
  const showDrag = editable && open

  let body: ReactNode = null
  if (open && bodyH > 0) {
    body = (
      <div className="sstrip-body" style={{ height: bodyH }}>
        <svg
          className="sstrip-svg"
          width={width}
          height={bodyH}
          onPointerDown={e => start(e, { kind: 'pan', y: e.clientY, pan })}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => finish(true)}
          onWheel={e => setPan(pan + e.deltaY / Math.max(k, 1) / 4)}
          role="img"
          aria-label={`Section through the house, ${ends[0]} to ${ends[1]}`}
        >
          {/* Each level's floor, faintly across the strip; the one being drawn on in the accent colour. */}
          {levels.map(l => {
            const y = Y(floorRL(plan, l.id))
            return <line key={l.id} className={`sstrip-level${l.id === level ? ' on' : ''}`} x1={0} x2={width} y1={y} y2={y} />
          })}
          {painted}
          {/* The level being drawn on, lit where the cut passes through it. */}
          {drawing.floors
            .filter(f => f.level === level)
            .flatMap(f => f.spans.map(([s0, s1], i) => <rect key={`${f.level}-${i}`} className="sstrip-on" x={X(s0)} y={Y(f.ceiling)} width={(s1 - s0) * k} height={(f.ceiling - f.rl) * k} />))}
          {/* Boundaries the cut crosses. */}
          {drawing.boundaries.map((b, i) => (
            <g key={i} className="sstrip-boundary">
              <line x1={X(b.s)} x2={X(b.s)} y1={Y(b.rl - 0.4)} y2={4} />
              <text x={X(b.s) + (b.s < frame.len / 2 ? 4 : -4)} y={14} textAnchor={b.s < frame.len / 2 ? 'start' : 'end'}>
                Boundary
              </text>
            </g>
          ))}
          {bubble?.guide !== undefined && <line className="sstrip-guide" x1={0} x2={width} y1={Y(bubble.guide)} y2={Y(bubble.guide)} />}
          {/* Each roof's eaves line, to drag up or down. */}
          {showDrag &&
            roofs.map(r => {
              const y = Y(r.eaves)
              const x0 = X(r.s0)
              const x1 = X(r.s1)
              const mid = (x0 + x1) / 2
              return (
                <g
                  key={r.id}
                  className={`sstrip-eaves${dragging?.kind === 'eaves' && dragging.id === r.id ? ' on' : ''}`}
                  onPointerDown={e => start(e, { kind: 'eaves', id: r.id, y: e.clientY, rl: r.eaves, start: st().plan!, moved: false, top: zTop })}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                >
                  <title>{`${r.name}: eaves RL ${rlText(r.eaves)}. Drag to raise or lower it; it snaps to another level's ceiling or roofline.`}</title>
                  <line className="hit" x1={x0} x2={x1} y1={y} y2={y} />
                  <line className="eave" x1={x0} x2={x1} y1={y} y2={y} />
                  <circle cx={mid} cy={y} r={5} />
                </g>
              )
            })}
        </svg>
        {/* The levels down the left: a click draws on one, a drag moves its floor. */}
        <div className="sstrip-bands" role="group" aria-label="Levels">
          {levels.map((l, i) => {
            const rl = floorRL(plan, l.id)
            const y = bandYs[i]
            return (
              <button
                key={l.id}
                type="button"
                className={`sstrip-band${l.id === level ? ' on' : ''}${editable ? ' drags' : ''}`}
                style={{ left: bandX, top: y - 13 }}
                aria-pressed={l.id === level}
                title={editable ? `Click to draw on ${l.name}. Drag up or down to move its floor (arrow keys too).` : `Show ${l.name} on the plan`}
                onPointerDown={e => (editable ? start(e, { kind: 'level', id: l.id, y: e.clientY, rl, start: st().plan!, moved: false, top: zTop }) : e.stopPropagation())}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onClick={e => {
                  // A drag or a press handled by the pointer already; keys (Enter, Space) land here.
                  if (e.detail === 0 || !editable) st().setActiveLevel(l.id)
                }}
                onKeyDown={e => bandKey(e, l.id)}
              >
                {editable && <span className="grip" aria-hidden="true" />}
                <span className="name">{l.name}</span>
                <span className="rl">{rlText(rl)}</span>
              </button>
            )
          })}
        </div>
        {bubble && (
          <div className="sstrip-bubble" style={{ left: Math.max(4, Math.min(bubble.x + 18, width - 430)), top: Math.max(4, Math.min(bubble.y - 18, bodyH - 70)) }} role="status">
            {bubble.lines.map((t, i) => (
              <div key={i} className={i ? 'muted' : undefined}>
                {t}
              </div>
            ))}
          </div>
        )}
        {!frame.linedUp && (
          <p className="sstrip-tilt" style={{ left: bandX + 150 }}>
            The cut runs at an angle on the plan, so the section is centred under it.{' '}
            <button type="button" className="link" onClick={onLineUp}>
              Turn the plan to line them up
            </button>
          </p>
        )}
      </div>
    )
  }

  return (
    <section ref={box} className={`sstrip${open ? '' : ' folded'}${phone ? ' phone' : ''}${dragging ? ` dragging-${dragging.kind}` : ''}`} style={{ height }} aria-label="Live section">
      {open && !phone && (
        <div
          className="sstrip-grab"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the section"
          aria-valuemin={MIN_H}
          aria-valuemax={MAX_H}
          aria-valuenow={height}
          tabIndex={0}
          onPointerDown={e => start(e, { kind: 'size', y: e.clientY, h: height })}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onKeyDown={e => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              setStripHeight(height + (e.key === 'ArrowUp' ? 20 : -20))
            }
          }}
        />
      )}
      <header className="sstrip-head" style={{ paddingLeft: Math.max(12, left + 4), paddingRight: Math.max(12, right + 4) }}>
        <h2>Section</h2>
        <span className="muted ends">
          {ends[0]} → {ends[1]}
        </span>
        {open && !phone && (
          <ul className="sstrip-key" aria-label="Key">
            <li>
              <i className="sec-swatch cut" /> Cut
            </li>
            <li>
              <i className="sec-swatch fill" /> Fill
            </li>
            <li>
              <svg width="20" height="8" aria-hidden="true">
                <path className="sec-l sec-l-natural" d="M1 4H19" />
              </svg>
              Natural ground
            </li>
          </ul>
        )}
        <span className="grow" />
        {open && editable && <span className="muted hint">Click a level to draw on it · drag it to move its floor · drag an eave to snap</span>}
        {!alongHouse && (
          <button type="button" className="plain small" onClick={onReset} title="Put the cut back through the middle of the house, along it">
            Along the house
          </button>
        )}
        <button type="button" className="plain small fold" onClick={() => setStripOpen(!open)} aria-expanded={open}>
          <Icon name={open ? 'chevD' : 'chevU'} size={14} /> {open ? 'Fold away' : 'Show the section'}
        </button>
      </header>
      {body}
    </section>
  )
}
