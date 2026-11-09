// Design › Sections: the section lines drawn across the plan and the house's four elevations,
// one drawing at a time in the panel, and all of them large on demand. The drawings come from
// sections.ts and elevation.ts; the lines are kept with the plan, under its undo.

import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../nav/icons'
import { tabRoute } from '../nav/route'
import { navigate, useRouter } from '../nav/router'
import { canEdit, usePhone, usePhoneMode } from '../phone/device'
import { usePlan } from '../plan/store'
import { useLoaded, type Loaded } from '../shell/useSite'
import { Waiting } from '../shell/tabs/Waiting'
import { DrawingSvg } from './DrawingSvg'
import { elevationDrawing, SIDES } from './elevation'
import { flipSection, removeSection, sectionName, sectionsOf } from './lines'
import type { Drawing } from './paint'
import { sectionDrawing } from './section'
import { beginSectionLine, SECTION_KEY } from './SectionMarks'
import { showDrawing, showLarge, stopSectionLine, useSections, type Shown } from './store'
import './sections.css'

/** Every drawing of the house: its sections, then its four elevations. */
function useDrawings(d: Loaded): Drawing[] {
  const { plan, survey, terrain, earth } = d
  return useMemo(() => {
    const input = { plan, survey, terrain, finished: earth?.result.grid }
    return [...sectionsOf(plan).map(l => sectionDrawing(l, input)), ...SIDES.map(s => elevationDrawing(s, input))]
  }, [plan, survey, terrain, earth])
}

const keyOf = (s: Shown) => (s.kind === 'section' ? s.id : s.side)
const shownOf = (d: Drawing): Shown => (d.kind === 'section' ? { kind: 'section', id: d.id } : { kind: 'elevation', side: d.side })
/** Short names for the chips: "A–A", "North". */
const chipName = (d: Drawing) => (d.kind === 'section' ? d.title.replace('Section ', '') : d.title.replace(' elevation', ''))

/** The drawing to show: the one picked, or the first section, or the north elevation. */
function useShown(drawings: Drawing[]): Drawing {
  const shown = useSections(s => s.shown)
  const key = shown && keyOf(shown)
  return drawings.find(x => x.id === key) ?? drawings.find(x => x.kind === 'section') ?? drawings.find(x => x.id === 'north')!
}

export function SectionsTab() {
  const d = useLoaded()
  return d ? <Sections d={d} /> : <Waiting />
}

function Picks({ drawings, on }: { drawings: Drawing[]; on: Drawing }) {
  const sections = drawings.filter(x => x.kind === 'section')
  const elevations = drawings.filter(x => x.kind === 'elevation')
  const chip = (x: Drawing) => (
    <button key={x.id} className={x.id === on.id ? 'on' : ''} aria-pressed={x.id === on.id} onClick={() => showDrawing(shownOf(x))}>
      {chipName(x)}
    </button>
  )
  return (
    <div className="sec-picks-wrap">
      {sections.length > 0 && (
        <div className="sec-picks" role="group" aria-label="Sections">
          {sections.map(chip)}
        </div>
      )}
      <div className="sec-picks" role="group" aria-label="Elevations">
        {elevations.map(chip)}
      </div>
    </div>
  )
}

function Sections({ d }: { d: Loaded }) {
  const drawings = useDrawings(d)
  const shown = useShown(drawings)
  const drawing = useSections(s => s.drawing)
  const large = useSections(s => s.large)
  const phone = usePhone()
  const editing = canEdit(phone, usePhoneMode(s => s.mode))
  const lines = sectionsOf(d.plan)
  const line = shown.kind === 'section' ? lines.find(l => l.id === shown.id) : undefined
  const commit = usePlan(s => s.commit)

  // Leaving the tab puts the line being drawn down.
  useEffect(() => () => stopSectionLine(), [])

  return (
    <div className="sec-panel">
      <Picks drawings={drawings} on={shown} />
      <figure className="sec-figure">
        {shown.kind === 'elevation' && !shown.any ? (
          <p className="muted small sec-empty">Draw some walls to see the elevations.</p>
        ) : (
          <button className="sec-open" onClick={() => showLarge(true)} aria-label={`Open ${shown.title} large`} title="Open large">
            <DrawingSvg drawing={shown} maxHeight={phone ? 200 : 300} compact />
          </button>
        )}
      </figure>
      <div className="row sec-actions">
        <button className="secondary" onClick={() => showLarge(true)}>
          <Icon name="fitBlock" size={15} /> Open large
        </button>
        {line && editing && (
          <>
            <button className="secondary" onClick={() => commit(p => flipSection(p, line.id))} title="Look the other way along the line">
              <Icon name="rotate" size={15} /> Flip
            </button>
            <button
              className="secondary"
              onClick={() => {
                commit(p => removeSection(p, line.id))
                showDrawing({ kind: 'elevation', side: 'north' })
              }}
            >
              <Icon name="x" size={15} /> Delete {line.label}–{line.label}
            </button>
          </>
        )}
      </div>
      <Key drawing={shown} />

      <h3>Section lines</h3>
      {drawing ? (
        <div className="sec-drawing-now">
          <p className="small">{drawing.a ? 'Now click where the section ends.' : 'Click on the plan where the section starts, then where it ends.'}</p>
          <button className="secondary" onClick={stopSectionLine}>
            Stop
          </button>
        </div>
      ) : editing ? (
        <>
          <p className="muted small">{lines.length ? `${lines.map(sectionName).join(', ')}. ` : ''}Draw a line across the plan where you want to cut through the house and the ground; on a slope, run it down the fall.</p>
          <div className="row">
            <button className="secondary" onClick={beginSectionLine}>
              Draw a section line <kbd>{SECTION_KEY}</kbd>
            </button>
          </div>
        </>
      ) : (
        <p className="muted small">Tap Edit at the top to draw a section line.</p>
      )}
      <p className="muted small">
        Sections and elevations print as extra sheets in the{' '}
        <button className="link" onClick={() => navigate(tabRoute(useRouter.getState().route, 'share', 'plans'))}>
          PDF plans
        </button>
        , at 1:100 on A3 (1:200 where they don’t fit).
      </p>
      {large && <Large drawings={drawings} shown={shown} />}
    </div>
  )
}

/** What the lines and colours mean, under the drawing. */
function Key({ drawing }: { drawing: Drawing }) {
  const cutFill = drawing.kind === 'section' && drawing.natural.some((r, i) => r.some((p, j) => Math.abs(p[1] - (drawing.finished[i]?.[j]?.[1] ?? p[1])) > 0.01))
  return (
    <ul className="sec-key">
      <li>
        <svg width="26" height="8" aria-hidden="true">
          <path className="sec-l sec-l-finished" d="M1 4H25" />
        </svg>
        Finished ground
      </li>
      <li>
        <svg width="26" height="8" aria-hidden="true">
          <path className="sec-l sec-l-natural" d="M1 4H25" />
        </svg>
        Natural ground
      </li>
      {cutFill && (
        <li>
          <i className="sec-swatch cut" /> Cut <i className="sec-swatch fill" /> Fill
        </li>
      )}
      {drawing.kind === 'elevation' && drawing.height && (
        <li>
          <svg width="26" height="8" aria-hidden="true">
            <path className="sec-l sec-l-height" d="M1 4H25" />
          </svg>
          Highest point above natural ground, as Checks measures it
        </li>
      )}
    </ul>
  )
}

/** Every drawing, large, over the app; Esc or the cross closes it. */
function Large({ drawings, shown }: { drawings: Drawing[]; shown: Drawing }) {
  const ref = useRef<HTMLDivElement>(null)
  const phone = usePhone()
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        showLarge(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      before?.focus?.()
    }
  }, [])
  const h = typeof window === 'undefined' ? 600 : window.innerHeight
  return createPortal(
    <div className="sec-scrim" onPointerDown={e => e.target === e.currentTarget && showLarge(false)}>
      <div ref={ref} className={`sec-large${phone ? ' phone' : ''}`} role="dialog" aria-modal="true" aria-label="Sections and elevations" tabIndex={-1}>
        <header>
          <h2>Sections and elevations</h2>
          <button className="sec-x" onClick={() => showLarge(false)} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </header>
        <Picks drawings={drawings} on={shown} />
        <div className="sec-large-body">
          {shown.kind === 'elevation' && !shown.any ? (
            <p className="muted">Draw some walls to see the elevations.</p>
          ) : (
            <DrawingSvg drawing={shown} maxHeight={Math.max(260, h - (phone ? 210 : 230))} minWidth={phone ? 720 : 0} />
          )}
        </div>
        <Key drawing={shown} />
      </div>
    </div>,
    document.body,
  )
}
