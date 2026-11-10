// The sketch layer on the plan, kept out of PlanEditor itself: the Sketch tool's drawing (lines,
// arcs, circles and curves), the sketch lines under the walls, the kept measurements over them, and
// picking and dragging either. PlanEditor hands this the pointer, clicks and keys and renders what
// it returns. Nothing here changes anything but the plan's `sketch` list.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Plan, SketchColour, SketchItem } from '../plan/model'
import type { SnapResult } from '../plan/snap'
import { usePlan, type Tool } from '../plan/store'
import { DRAW_SAGITTA, distanceToSketch, sketchCentre, sketchGuides, sketchPolyline, NO_GUIDES, type SnapGuides } from './geometry'
import { addSketch, moveSketch, moveSketchPoint, newSketch, sketchOf } from './ops'
import { colourOf, SKETCH_PAINT } from './colours'
import { useSketch, type SketchMode } from './store'
import './sketch.css'

/** How a point is snapped: PlanEditor's snapping, with the walls and the sketch it knows. */
export type SnapAt = (raw: Vec2, o: { anchor?: Vec2 | null; points?: Vec2[]; free: boolean }) => SnapResult

export interface SketchArgs {
  plan: Plan
  level: string
  tool: Tool
  /** The layer shows (the Key's switch, or a shared view's). */
  shown: boolean
  /** House frame to screen pixels, and pixels per metre. */
  S: (p: Vec2) => Vec2
  k: number
  snapAt: SnapAt
  /** The snapped pointer PlanEditor keeps, for the line being drawn to it. */
  cursor: SnapResult | null
  /** A phone in View: nothing can be drawn or moved. */
  viewOnly: boolean
  /** PlanEditor's dark label by the pointer, and a length written along a line. */
  tag: (at: Vec2, lines: string[]) => ReactNode
  dim: (a: Vec2, b: Vec2, offset: number, text: string, key: string, cls?: string, minPx?: number) => ReactNode
}

/** The snap points and lines of the sketch layer while it shows; none while it's hidden. */
export function useSketchGuides(plan: Plan, shown: boolean): SnapGuides {
  const items = plan.sketch
  return useMemo(() => (shown && items?.length ? sketchGuides(items) : NO_GUIDES), [items, shown])
}

const HINTS: Record<SketchMode, string> = {
  line: 'Click to start a sketch line, then each corner. Type a length in mm (and < and an angle, as in 3000<45) and press Enter. Double-click, Enter or Esc to finish. Sketch lines change nothing; everything snaps to them.',
  arc: 'Click where the arc starts, then where it ends, then a third point for how far it bulges.',
  circle: 'Click the centre, then a point on the circle (or type the radius in mm and press Enter).',
  curve: 'Click points for a smooth curve to pass through. Double-click, Enter or Esc to finish.',
}

/** What each kind is called on its card and in messages. */
export const SKETCH_NAMES: Record<SketchItem['kind'], string> = { line: 'Sketch line', arc: 'Sketch arc', circle: 'Sketch circle', curve: 'Sketch curve', measure: 'Measurement' }

const fmtMm = (m: number) => Math.round(m * 1000).toString()
const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1])
/** The CSS colours a sketch line is drawn in (sketch.css reads them). */
export const paintStyle = (c: SketchColour) => ({ '--sk': SKETCH_PAINT[c].hex, '--sk-strong': SKETCH_PAINT[c].strong }) as CSSProperties

/** A click this close to the last point (m) is the second click of a double-click, not a new point. */
const SAME_POINT = 0.005

/** Where a typed "length" or "length<angle" puts the next point from `a`: towards `toward`, or at the angle. */
export function typedPoint(a: Vec2, toward: Vec2, typed: string): Vec2 | null {
  const [lenText, angText] = typed.split('<')
  const len = parseFloat(lenText) / 1000
  if (!(len > 0)) return null
  let dir: Vec2
  if (angText !== undefined && angText !== '') {
    const t = (parseFloat(angText) * Math.PI) / 180
    if (!Number.isFinite(t)) return null
    dir = [Math.cos(t), Math.sin(t)]
  } else {
    const l = dist(a, toward)
    if (l < 1e-6) return null
    dir = [(toward[0] - a[0]) / l, (toward[1] - a[1]) / l]
  }
  return [a[0] + dir[0] * len, a[1] + dir[1] * len]
}

interface Draft {
  key: string
  /** Points clicked and not yet a sketch item: the first of a line or curve, an arc's ends, a circle's centre. */
  pts: Vec2[]
  /** The line or curve being drawn, once it has two points: it's in the plan, and grows with each click. */
  id: string | null
  typed: string
}

type SketchDrag = { id: string; index: number; both: boolean } | { id: string; from: SketchItem; start: Vec2 }

export function useSketchLayer(a: SketchArgs) {
  const { plan, level, tool, shown, S, k, snapAt, cursor, viewOnly, tag, dim } = a
  const mode = useSketch(s => s.mode)
  const colour = useSketch(s => s.colour)
  const selection = usePlan(s => s.selection)
  const extra = usePlan(s => s.extra)
  const active = !viewOnly && tool === 'sketch'
  const items = sketchOf(plan)
  const key = `${tool}|${level}|${mode}`
  const [draftState, setDraft] = useState<Draft>({ key, pts: [], id: null, typed: '' })
  const draft = draftState.key === key ? draftState : { key, pts: [], id: null, typed: '' }
  const growing = draft.id ? items.find(s => s.id === draft.id) : undefined
  // The points of what's being drawn: the item in the plan (so Undo shortens it), or the clicks so far.
  const drawn: Vec2[] = growing ? growing.pts : draft.id ? [] : draft.pts
  const dragRef = useRef<SketchDrag | null>(null)

  // Picking the Sketch tool (or Measure, which keeps what it measures) shows the layer, so what's drawn is seen.
  const setShown = useSketch(s => s.setShown)
  const keepMeasures = useSketch(s => s.keepMeasures)
  useEffect(() => {
    if (!viewOnly && !shown && (tool === 'sketch' || (tool === 'measure' && keepMeasures))) setShown(true)
  }, [tool, shown, viewOnly, keepMeasures, setShown])

  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const finish = () => setDraft({ key, pts: [], id: null, typed: '' })

  /** Put down a point of the line or curve: the first waits, the second makes the item, the rest add to it. */
  const addPoint = (p: Vec2) => {
    const last = drawn[drawn.length - 1]
    if (last && dist(last, p) < SAME_POINT) return
    const st = usePlan.getState()
    if (!drawn.length) return update({ pts: [p], id: null, typed: '' })
    const closes = drawn.length > 2 && dist(drawn[0], p) < 1e-3
    const at: Vec2 = closes ? [drawn[0][0], drawn[0][1]] : p
    if (!growing) {
      const item = newSketch(level, mode === 'curve' ? 'curve' : 'line', [drawn[0], at], colour)
      st.commit(pl => addSketch(pl, item))
      update({ pts: [], id: item.id, typed: '' })
    } else {
      st.commit(pl => ({ ...pl, sketch: sketchOf(pl).map(s => (s.id === growing.id ? { ...s, pts: [...s.pts, at] } : s)) }))
      update({ typed: '' })
    }
    if (closes) finish()
  }

  /** A click (or a typed point) with the Sketch tool. */
  const place = (p: Vec2) => {
    const st = usePlan.getState()
    if (mode === 'line' || mode === 'curve') return addPoint(p)
    if (mode === 'circle') {
      if (!draft.pts.length) return update({ pts: [p], typed: '' })
      if (dist(draft.pts[0], p) < 0.01) return
      st.commit(pl => addSketch(pl, newSketch(level, 'circle', [draft.pts[0], p], colour)))
      return finish()
    }
    // An arc: its start, its end, then a point on it for the bulge.
    if (draft.pts.length < 2) {
      if (draft.pts.length === 1 && dist(draft.pts[0], p) < 0.01) return
      return update({ pts: [...draft.pts, p], typed: '' })
    }
    const [s, e] = draft.pts
    st.commit(pl => addSketch(pl, newSketch(level, 'arc', [s, p, e], colour)))
    finish()
  }

  /** The anchor a point snaps square from: the last corner, or a circle's centre. */
  const anchor = (): Vec2 | null => (mode === 'arc' ? (draft.pts.length === 1 ? draft.pts[0] : null) : (drawn[drawn.length - 1] ?? null))

  const move = (world: Vec2, free: boolean): SnapResult => snapAt(world, { anchor: anchor(), points: drawn.slice(0, 1), free })

  /** A click on the plan: true when this took it. */
  const click = (world: Vec2, free: boolean): boolean => {
    if (!active) return false
    place(move(world, free).p)
    return true
  }

  const dblclick = (): boolean => {
    if (!active) return false
    if (mode === 'line' || mode === 'curve') finish()
    return true
  }

  /** Typed lengths, Enter and Esc while drawing. True when this took the key. */
  const key_ = (e: KeyboardEvent): boolean => {
    if (!active) return false
    const from = mode === 'circle' ? draft.pts[0] : mode === 'arc' ? undefined : drawn[drawn.length - 1]
    if (from && /^[0-9.]$/.test(e.key)) {
      update({ typed: (draft.typed + e.key).slice(0, 12) })
      return true
    }
    if (from && e.key === '<' && mode !== 'circle' && !draft.typed.includes('<') && draft.typed) {
      update({ typed: `${draft.typed}<` })
      return true
    }
    if (from && e.key === '-' && draft.typed.endsWith('<')) {
      update({ typed: `${draft.typed}-` })
      return true
    }
    if (e.key === 'Backspace' && draft.typed) {
      update({ typed: draft.typed.slice(0, -1) })
      return true
    }
    if (e.key === 'Enter') {
      if (from && draft.typed) {
        const p = typedPoint(from, cursor?.p ?? from, draft.typed)
        if (p) place(p)
        return true
      }
      if (drawn.length || draft.pts.length) {
        finish()
        return true
      }
      return false
    }
    if (e.key === 'Escape' && (drawn.length || draft.pts.length)) {
      finish()
      return true
    }
    return false
  }

  // ---- Picking and dragging (the Select tool) ----

  /** The sketch line or kept measurement under a point, nearest first, within a few pixels. */
  const hit = (world: Vec2): SketchItem | null => {
    if (!shown) return null
    let best: SketchItem | null = null
    let bestD = 6 / k
    for (const it of items) {
      const d = distanceToSketch(it, world)
      if (d < bestD) {
        bestD = d
        best = it
      }
    }
    return best
  }

  const single = !extra.length && selection?.type === 'sketch' ? items.find(s => s.id === selection.id) : undefined
  const handlesShow = !!single && shown && !viewOnly && tool === 'select'

  /** The handle of the selected item under a screen point: its index. */
  const handleAt = (sx: number, sy: number): number => (single && handlesShow ? single.pts.findIndex(p => Math.hypot(S(p)[0] - sx, S(p)[1] - sy) < 9) : -1)

  /** A press on a handle of the selected item starts dragging that point. */
  const grabHandle = (sx: number, sy: number): boolean => {
    const i = handleAt(sx, sy)
    if (!single || i < 0) return false
    const last = single.pts.length - 1
    // A line or curve that closes on itself keeps its two ends together.
    const both = (i === 0 || i === last) && single.kind !== 'arc' && single.kind !== 'circle' && last > 1 && dist(single.pts[0], single.pts[last]) < 1e-3
    usePlan.getState().beginGesture()
    dragRef.current = { id: single.id, index: i, both }
    return true
  }

  /** A press on an item (already selected by PlanEditor) starts moving it whole. */
  const grabItem = (id: string, world: Vec2) => {
    const from = items.find(s => s.id === id)
    if (!from) return
    usePlan.getState().beginGesture()
    dragRef.current = { id, from, start: world }
  }

  /** The pointer moving while dragging: the snapped point (for its marker), or null. */
  const drag = (world: Vec2, free: boolean): SnapResult | null => {
    const d = dragRef.current
    if (!d) return null
    const st = usePlan.getState()
    if ('index' in d) {
      const item = items.find(s => s.id === d.id)
      if (!item) return null
      const others = item.pts.filter((_, i) => i !== d.index)
      const s = snapAt(world, { points: others, free })
      st.preview(p => {
        let next = moveSketchPoint(p, d.id, d.index, s.p)
        if (d.both) next = moveSketchPoint(next, d.id, d.index === 0 ? item.pts.length - 1 : 0, s.p)
        return next
      })
      return s
    }
    const raw: Vec2 = [world[0] - d.start[0], world[1] - d.start[1]]
    const delta: Vec2 = free ? raw : [Math.round(raw[0] * 100) / 100, Math.round(raw[1] * 100) / 100]
    st.preview(p => moveSketch(p, d.id, delta, d.from))
    return null
  }

  const release = () => {
    dragRef.current = null
  }

  // ---- Drawing ----

  const isSel = (id: string) => (selection?.type === 'sketch' && selection.id === id) || extra.some(x => x.type === 'sketch' && x.id === id)
  const path = (pts: Vec2[]) => (pts.length ? `M${pts.map(p => S(p).map(n => n.toFixed(1)).join(' ')).join('L')}` : '')
  // Fine enough to look smooth at this zoom, without thousands of points zoomed out.
  const sagitta = Math.max(DRAW_SAGITTA / 4, 0.5 / k)

  const lines = items.filter(s => s.kind !== 'measure')
  const measures = items.filter(s => s.kind === 'measure')

  const under: ReactNode = shown ? (
    <g className="sketch-layer">
      {lines.map(s => (
        <path key={s.id} className={`sketch-line${isSel(s.id) ? ' selected' : ''}`} style={paintStyle(colourOf(s))} d={path(sketchPolyline(s, sagitta))} />
      ))}
    </g>
  ) : null

  /** A kept measurement: a dimension line with ticks at each point, each piece's length, and the total. */
  const measureMark = (m: SketchItem) => {
    const sel = isSel(m.id)
    const tick = 5
    const ticks = m.pts.map(p => {
      const [x, y] = S(p)
      return `M${(x - tick).toFixed(1)} ${(y + tick).toFixed(1)}L${(x + tick).toFixed(1)} ${(y - tick).toFixed(1)}`
    })
    const total = m.pts.slice(1).reduce((n, p, i) => n + dist(m.pts[i], p), 0)
    const end = S(m.pts[m.pts.length - 1])
    return (
      <g key={m.id} className={`kept-measure${sel ? ' selected' : ''}`}>
        <path className="kept-measure-line" d={path(m.pts)} />
        <path className="kept-measure-ticks" d={ticks.join('')} />
        {m.pts.slice(1).map((p, i) => dim(m.pts[i], p, 10 / k, fmtMm(dist(m.pts[i], p)), `${m.id}-${i}`, 'dim kept-measure-label', 30))}
        {m.pts.length > 2 && (
          <text className="kept-measure-total" x={end[0] + 8} y={end[1] - 8}>
            Total {fmtMm(total)}
          </text>
        )}
      </g>
    )
  }

  // What's being drawn with the tool, to the pointer.
  const preview = (() => {
    if (!active || !cursor) return null
    const c = cursor.p
    if (mode === 'circle') {
      if (!draft.pts.length) return null
      const centre = draft.pts[0]
      const on = draft.typed ? typedPoint(centre, c, draft.typed) : c
      if (!on || dist(centre, on) < 0.01) return null
      const r = dist(centre, on)
      return (
        <g className="sketch-draft" style={paintStyle(colour)}>
          <path className="sketch-line drawing" d={path(sketchPolyline({ kind: 'circle', pts: [centre, on] }, sagitta))} />
          <path className="sketch-radius" d={path([centre, on])} />
          {tag(on, [draft.typed ? `R ${draft.typed}▌ mm` : `R ${fmtMm(r)} mm`, `⌀ ${fmtMm(2 * r)} mm`])}
        </g>
      )
    }
    if (mode === 'arc') {
      if (!draft.pts.length) return null
      if (draft.pts.length === 1) {
        return (
          <g className="sketch-draft" style={paintStyle(colour)}>
            <path className="sketch-line drawing" d={path([draft.pts[0], c])} />
            {tag(c, [`${fmtMm(dist(draft.pts[0], c))} mm across`, 'Click where the arc ends'])}
          </g>
        )
      }
      const [s, e] = draft.pts
      const arc = { kind: 'arc' as const, pts: [s, c, e] }
      const centre = sketchCentre(arc)
      return (
        <g className="sketch-draft" style={paintStyle(colour)}>
          <path className="sketch-line drawing" d={path(sketchPolyline(arc, sagitta))} />
          {tag(c, [centre ? `R ${fmtMm(centre.r)} mm` : 'Straight', 'Click for the bulge'])}
        </g>
      )
    }
    const last = drawn[drawn.length - 1]
    if (!last) return null
    const to = draft.typed ? typedPoint(last, c, draft.typed) : c
    if (!to) return null
    const run = mode === 'curve' ? sketchPolyline({ kind: 'curve', pts: [...drawn, to] }, sagitta) : [last, to]
    const len = dist(last, to)
    const angle = ((Math.atan2(to[1] - last[1], to[0] - last[0]) * 180) / Math.PI + 360) % 360
    return (
      <g className="sketch-draft" style={paintStyle(colour)}>
        <path className="sketch-line drawing" d={path(run)} />
        {draft.pts.length > 0 && !growing && <circle className="sketch-start" cx={S(last)[0]} cy={S(last)[1]} r={3} />}
        {tag(to, [draft.typed ? `${draft.typed}▌ mm` : `${fmtMm(len)} mm  ${angle.toFixed(0)}°`])}
      </g>
    )
  })()

  const centreMark = (it: SketchItem) => {
    const c = sketchCentre(it)
    if (!c) return null
    const [x, y] = S(c.c)
    return <path key={`${it.id}-c`} className="sketch-centre" style={paintStyle(colourOf(it))} d={`M${x - 4} ${y}H${x + 4}M${x} ${y - 4}V${y + 4}`} />
  }

  const over: ReactNode = (
    <g className="sketch-over">
      {shown && measures.map(measureMark)}
      {shown && lines.filter(s => isSel(s.id) && (s.kind === 'arc' || s.kind === 'circle')).map(centreMark)}
      {single && handlesShow && single.pts.map((p, i) => <circle key={i} className="handle sketch-handle" style={single.kind === 'measure' ? undefined : paintStyle(colourOf(single))} cx={S(p)[0]} cy={S(p)[1]} r={5} />)}
      {preview}
    </g>
  )

  const hint = active ? HINTS[mode] : null

  return { active, move, click, dblclick, key: key_, hit, grabHandle, onHandle: (sx: number, sy: number) => handleAt(sx, sy) >= 0, grabItem, drag, release, under, over, hint, drawing: drawn.length > 0 || draft.pts.length > 0 }
}
