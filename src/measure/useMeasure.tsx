// The Measure and Note tools on the plan, kept out of PlanEditor itself. PlanEditor hands this the
// pointer, clicks and keys while one of the two tools is picked, and renders what it returns:
// `over` inside the plan's SVG (the ruler line, and every note on the floor), `html` beside it
// (the readout, and the box a note is typed in).
//
// Measure: click a point, click another; the plan shows the flat distance, the distance along the
// ground and the height between the two, from the survey's ground (the same ground as the RL readout).
// Note: click empty plan to add a short label, click a note to change or delete it.

import { useRef, useState, type ReactNode } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import type { Plan, PlanNote } from '../plan/model'
import { addNote, cleanNote, deleteNote, newNote, notesOf, updateNote } from '../plan/notes'
import { snap } from '../plan/snap'
import { usePlan, type Tool } from '../plan/store'
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
  /** A phone in View: nothing can be drawn. */
  viewOnly: boolean
  /** The plan's size in pixels, to keep the note box on screen. */
  size: { w: number; h: number }
}

/** Pixels per character of a note's label, and the room round it, for finding the note under a click. */
const CHAR_PX = 6.6
const NOTE_PAD = 10

export function useMeasureNotes(a: MeasureArgs) {
  const { plan, level, tool, survey, terrain, S, walls, tol, viewOnly, size } = a
  const active = !viewOnly && (tool === 'measure' || tool === 'note')
  // What is drawn or typed belongs to one tool on one floor; switching either drops it.
  const key = `${tool}|${level}`
  const [pts, setPts] = useState<{ key: string; pts: Vec2[] }>({ key: '', pts: [] })
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
  const notes = notesOf(plan).filter(n => n.level === level)

  // Leaving the tool drops the ruler's points (adjusted while rendering, as React advises, not in an effect).
  if (tool !== 'measure' && pts.pts.length) setPts({ key: '', pts: [] })

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

  const move = (world: Vec2, free: boolean) => {
    if (tool !== 'measure') return
    setCursor(snap(world, { walls, tol, free }).p)
  }

  /** A click on the plan: true when this took it. */
  const click = (world: Vec2, free: boolean): boolean => {
    if (!active) return false
    if (tool === 'measure') {
      const p = snap(world, { walls, tol, free }).p
      // A third click starts a new ruler.
      setPts({ key, pts: placed.length >= 2 ? [p] : [...placed, p] })
      return true
    }
    const hit = noteAt(world)
    if (hit) setEditing({ key, id: hit.id, at: hit.at, text: hit.text })
    else setEditing({ key, id: null, at: world, text: '' })
    return true
  }

  /** Esc ends the tool. True when this took the key. */
  const onKey = (e: KeyboardEvent): boolean => {
    if (!active) return false
    if (e.key === 'Escape') {
      setPts({ key: '', pts: [] })
      setEditing(null)
      usePlan.getState().setTool('select')
      return true
    }
    return false
  }

  // ---- drawing ----

  const end = placed.length === 2 ? placed[1] : placed.length === 1 ? cursor : null
  const m = placed.length && end ? measure(placed[0], end, plan.placement, survey, terrain.grid) : null
  const txt = m ? measureText(m) : null

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
      {tool === 'measure' && placed.length > 0 && end && (
        <g className="measure-line">
          <path d={`M${S(placed[0]).join(' ')}L${S(end).join(' ')}`} className={placed.length === 2 ? 'done' : 'draft'} />
          {[placed[0], ...(placed.length === 2 ? [placed[1]] : [])].map((p, i) => (
            <circle key={i} cx={S(p)[0]} cy={S(p)[1]} r={4.5} />
          ))}
          {m && <text x={(S(placed[0])[0] + S(end)[0]) / 2} y={(S(placed[0])[1] + S(end)[1]) / 2 - 8} textAnchor="middle">{txt!.flat}</text>}
        </g>
      )}
      {tool === 'measure' && placed.length === 0 && cursor && <circle className="measure-cursor" cx={S(cursor)[0]} cy={S(cursor)[1]} r={4} />}
    </g>
  )

  const hint = tool === 'measure' && !m ? 'Click a start point on the plan.' : null

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
              <button className="plain small" onClick={() => setPts({ key: '', pts: [] })}>
                Clear
              </button>
            </>
          ) : (
            <span className="muted">{hint} Esc finishes.</span>
          )}
        </div>
      )}
      {edit && <NoteBox edit={edit} at={((p): Vec2 => [Math.max(8, Math.min(p[0], size.w - 300)), Math.max(8, Math.min(p[1], size.h - 60))])(S(edit.at))} onText={text => setEditing({ ...edit, text })} onDone={finish} />}
    </>
  )

  return { active, move, click, key: onKey, over, html }
}
