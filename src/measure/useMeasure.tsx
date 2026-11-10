// The Measure and Note tools on the plan, kept out of PlanEditor itself. PlanEditor hands this the
// pointer, clicks and keys while one of the two tools is picked, and renders what it returns:
// `over` inside the plan's SVG (the ruler line, and every note on the floor), `html` beside it
// (the readout, and the box a note is typed in).
//
// Measure: click a point, then another, and on for a chain; the card shows the flat distance, the
// distance along the ground and the height for the last piece, from the survey's ground (the same
// ground as the RL readout), and the running total. Double-click, Enter or Esc finishes it; with
// "Keep measurements" on (the default) it stays on the plan as a dimension line (src/sketch) until
// it's deleted. Leaving the tool or the floor finishes it too.
// Note: click empty plan to add a short label, click a note to change or delete it.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import type { Plan, PlanNote } from '../plan/model'
import { addNote, cleanNote, deleteNote, newNote, notesOf, updateNote } from '../plan/notes'
import { snap, type Guides } from '../plan/snap'
import { usePlan, type Tool } from '../plan/store'
import { addSketch, newSketch } from '../sketch/ops'
import { useSketch } from '../sketch/store'
import { measure, measureText } from './measure'
import { NoteBox, type Editing } from './NoteBox'
import './measure.css'

export interface MeasureArgs {
  plan: Plan
  level: string
  tool: Tool
  survey: Survey
  terrain: Terrain
  /** House frame to screen pixels. */
  S: (p: Vec2) => Vec2
  /** The walls on this floor, which a measured point snaps to the ends of. */
  walls: Plan['walls']
  /** Snap distance in metres. */
  tol: number
  /** The sketch layer's snap points and lines. */
  guides: Guides
  /** A phone in View: nothing can be drawn. */
  viewOnly: boolean
  /** The plan's size in pixels, to keep the note box on screen. */
  size: { w: number; h: number }
}

/** The ruler's points on one tool and floor; `done` when finished and not kept, shown until the next click. */
interface Ruler {
  key: string
  pts: Vec2[]
  done?: boolean
}

/** Pixels per character of a note's label, and the room round it, for finding the note under a click. */
const CHAR_PX = 6.6
const NOTE_PAD = 10

export function useMeasureNotes(a: MeasureArgs) {
  const { plan, level, tool, survey, terrain, S, walls, tol, guides, viewOnly, size } = a
  const active = !viewOnly && (tool === 'measure' || tool === 'note')
  // What is drawn or typed belongs to one tool on one floor; switching either drops it.
  const key = `${tool}|${level}`
  // `done`: finished and not kept (Keep measurements off), so it stays shown until the next click.
  const [pts, setPtsState] = useState<Ruler>({ key: '', pts: [] })
  // The same, for finishing it as the tool or floor changes (an effect's clean-up sees no newer state).
  const ptsRef = useRef<Ruler>(pts)
  const setPts = (v: Ruler) => {
    ptsRef.current = v
    setPtsState(v)
  }
  const keep = useSketch(s => s.keepMeasures)
  /** The measurement just kept, for the card's numbers, until the next click. */
  const [kept, setKept] = useState<{ key: string; pts: Vec2[] } | null>(null)
  const [cursor, setCursor] = useState<Vec2 | null>(null)
  const [editState, setEditState] = useState<Editing | null>(null)
  // The box being typed in, also kept here so a blur that arrives as the box closes can't save it twice.
  const editRef = useRef<Editing | null>(null)
  const setEditing = (e: Editing | null) => {
    editRef.current = e
    setEditState(e)
  }
  const edit = editState && editState.key === key ? editState : null
  const placed = pts.key === key ? pts.pts : []
  const done = pts.key === key && !!pts.done
  const notes = notesOf(plan).filter(n => n.level === level)

  /**
   * Finish the measurement being made: kept on the plan (one undo step) when it has two points and
   * Keep measurements is on, else left showing until the next click.
   */
  const finishMeasure = (from: Ruler = ptsRef.current) => {
    const ps = from.pts
    if (from.done || ps.length < 2) return
    if (useSketch.getState().keepMeasures) {
      const lvl = from.key.split('|')[1]
      usePlan.getState().commit(p => addSketch(p, newSketch(lvl, 'measure', ps)))
      setKept({ key: from.key, pts: ps })
      setPts({ key: from.key, pts: [] })
    } else setPts({ ...from, done: true })
  }
  /** Keep the one showing, with Keep measurements off. */
  const keepThis = () => {
    const ps = ptsRef.current.pts
    if (ps.length < 2) return
    usePlan.getState().commit(p => addSketch(p, newSketch(level, 'measure', ps)))
    setKept({ key, pts: ps })
    setPts({ key, pts: [] })
  }
  // Leaving the tool or the floor finishes it (kept, when that's on), then drops it: the clean-up
  // runs as the key changes, so coming back starts afresh.
  useEffect(
    () => () => {
      finishMeasure()
      setPts({ key: '', pts: [] })
      setKept(null)
    },
    // Once for each tool and floor; finishMeasure reads the latest points from its ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  const noteAt = (world: Vec2): PlanNote | undefined => {
    const [px, py] = S(world)
    return [...notes].reverse().find(n => {
      const [x, y] = S(n.at)
      return px >= x - NOTE_PAD && px <= x + NOTE_PAD + n.text.length * CHAR_PX && Math.abs(py - y) <= NOTE_PAD
    })
  }

  const finish = (save: boolean) => {
    const e = editRef.current
    setEditing(null)
    if (!e || !save) return
    const text = cleanNote(e.text)
    const st = usePlan.getState()
    if (e.id === null) {
      if (text) st.commit(p => addNote(p, newNote(e.key.split('|')[1], e.at, text)))
    } else if (!text) st.commit(p => deleteNote(p, e.id!))
    else if (text !== notesOf(st.plan!).find(n => n.id === e.id)?.text) st.commit(p => updateNote(p, e.id!, { text }))
  }

  const snapped = (world: Vec2, free: boolean) => snap(world, { walls, tol, free, guides, anchor: done ? null : (placed.at(-1) ?? null), points: placed.slice(0, 1) }).p

  const move = (world: Vec2, free: boolean) => {
    if (tool !== 'measure') return
    setCursor(snapped(world, free))
  }

  /** A click on the plan: true when this took it. */
  const click = (world: Vec2, free: boolean): boolean => {
    if (!active) return false
    if (tool === 'measure') {
      const p = snapped(world, free)
      const last = placed.at(-1)
      // The second click of a double-click lands on the point just put down.
      if (!done && last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.005) return true
      // Each click adds a piece; once one is finished, a click starts the next.
      setKept(null)
      setPts({ key, pts: done ? [p] : [...placed, p] })
      return true
    }
    const hit = noteAt(world)
    if (hit) setEditing({ key, id: hit.id, at: hit.at, text: hit.text })
    else setEditing({ key, id: null, at: world, text: '' })
    return true
  }

  /** A double-click finishes the measurement. True when this took it. */
  const dblclick = (): boolean => {
    if (!active || tool !== 'measure') return false
    finishMeasure()
    return true
  }

  /** Enter finishes the measurement; Esc finishes it and ends the tool. True when this took the key. */
  const onKey = (e: KeyboardEvent): boolean => {
    if (!active) return false
    if (e.key === 'Enter' && tool === 'measure' && placed.length >= 2 && !done) {
      finishMeasure()
      return true
    }
    if (e.key === 'Escape') {
      finishMeasure()
      setPts({ key: '', pts: [] })
      setEditing(null)
      usePlan.getState().setTool('select')
      return true
    }
    return false
  }

  // ---- drawing ----

  // The chain so far, and on to the pointer while it's still being made (or the one just kept).
  const shownPts = kept && kept.key === key && !placed.length ? kept.pts : placed
  const live = !done && placed.length > 0 && cursor ? [...placed, cursor] : shownPts
  const from = live.length >= 2 ? live[live.length - 2] : null
  const end = live.length >= 2 ? live[live.length - 1] : null
  const m = from && end ? measure(from, end, plan.placement, survey, terrain.grid) : null
  const txt = m ? measureText(m) : null
  const total = live.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - live[i][0], p[1] - live[i][1]), 0)
  const mm = (n: number) => `${Math.round(n * 1000)} mm`
  const drawnLine = tool === 'measure' && placed.length > 0 ? live : []

  const over: ReactNode = (
    <g className="measure-layer">
      {notes.map(n => {
        const [x, y] = S(n.at)
        const open = edit?.id === n.id
        return (
          <g key={n.id} className={`plan-note${open ? ' open' : ''}`}>
            <circle cx={x} cy={y} r={3.5} />
            <text x={x + 8} y={y + 4}>{n.text}</text>
          </g>
        )
      })}
      {drawnLine.length > 1 && (
        <g className="measure-line">
          <path d={`M${drawnLine.map(p => S(p).join(' ')).join('L')}`} className={done ? 'done' : 'draft'} />
          {placed.map((p, i) => (
            <circle key={i} cx={S(p)[0]} cy={S(p)[1]} r={4.5} />
          ))}
          {drawnLine.slice(1).map((p, i) => {
            const q = drawnLine[i]
            return (
              <text key={i} x={(S(q)[0] + S(p)[0]) / 2} y={(S(q)[1] + S(p)[1]) / 2 - 8} textAnchor="middle">
                {mm(Math.hypot(p[0] - q[0], p[1] - q[1]))}
              </text>
            )
          })}
        </g>
      )}
      {tool === 'measure' && placed.length === 0 && cursor && <circle className="measure-cursor" cx={S(cursor)[0]} cy={S(cursor)[1]} r={4} />}
    </g>
  )

  const hint = tool === 'measure' && !m ? (placed.length ? 'Click the next point.' : 'Click a start point on the plan, then each point after it.') : null

  const html: ReactNode = (
    <>
      {tool === 'measure' && !viewOnly && (
        <div className="measure-card" role="status" aria-live="polite">
          {m && txt ? (
            <>
              <span>
                Flat <b>{txt.flat}</b>
              </span>
              <span>
                Along the ground <b>{txt.sloped}</b>
              </span>
              <span>
                Height <b>{txt.rise}</b>
              </span>
              {m.rlA !== null && m.rlB !== null && (
                <span className="muted">
                  Ground RL {m.rlA.toFixed(2)} → {m.rlB.toFixed(2)}
                </span>
              )}
              {live.length > 2 && (
                <span>
                  Total <b>{mm(total)}</b>
                </span>
              )}
              {!keep && placed.length >= 2 && (
                <button className="secondary small" onClick={keepThis}>
                  Keep
                </button>
              )}
              {placed.length > 0 && (
                <button className="plain small" onClick={() => setPts({ key: '', pts: [] })}>
                  Clear
                </button>
              )}
            </>
          ) : (
            <span className="muted">{hint} Esc finishes.</span>
          )}
          <label className="check measure-keep">
            <input type="checkbox" checked={keep} onChange={e => useSketch.getState().setKeepMeasures(e.target.checked)} />
            Keep measurements
          </label>
        </div>
      )}
      {edit && <NoteBox edit={edit} at={((p): Vec2 => [Math.max(8, Math.min(p[0], size.w - 300)), Math.max(8, Math.min(p[1], size.h - 60))])(S(edit.at))} onText={text => setEditing({ ...edit, text })} onDone={finish} />}
    </>
  )

  return { active, move, click, dblclick, key: onKey, over, html }
}
