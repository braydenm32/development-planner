// The Wall tool's Rectangle room, kept out of PlanEditor itself (as the sketch layer and the
// section lines are): drag from one corner to the opposite one, or click each, and four walls
// and their room are drawn as one undo step. After the first corner, a typed "4000x3000" and
// Enter sets the size exactly. PlanEditor hands it presses, clicks and keys, and renders `over`.

import { useState, type ReactNode } from 'react'
import type { Vec2 } from '../lib/geom'
import { MIN_RECT_SIDE, rectangleWalls, roomsMadeNote, typedRectangle } from '../plan/autoRooms'
import type { Plan } from '../plan/model'
import type { SnapResult } from '../plan/snap'
import { usePlan, type Tool } from '../plan/store'
import { setWallMode, useWallMode } from '../plan/wallMode'

export interface RectRoomArgs {
  level: string
  tool: Tool
  /** House frame to screen pixels. */
  S: (p: Vec2) => Vec2
  snapAt: (raw: Vec2, o: { free: boolean }) => SnapResult
  /** Where the pointer is, snapped. */
  cursor: SnapResult | null
  /** A phone in View: nothing is drawn. */
  viewOnly: boolean
  /** A phone: its hints talk of taps. */
  phone: boolean
  path: (pts: Vec2[]) => string
  tag: (at: Vec2, lines: string[]) => ReactNode
  dim: (a: Vec2, b: Vec2, offset: number, key: string) => ReactNode
  /** A rectangle's walls went in: `before` is the plan without them. */
  made: (before: Plan) => void
}

const HINT = {
  start: 'Drag from one corner of the room to the opposite one, or click each: four walls and their room in one go. Shift turns off snapping.',
  next: 'Click the opposite corner, or type width x depth in mm (4000x3000) and press Enter. Esc starts again.',
  // A finger pans, so on a phone it's two taps.
  phoneStart: 'Tap one corner of the room, then the opposite one: four walls and their room in one go.',
  phoneNext: 'Tap the opposite corner.',
}

export function useRectRoom({ level, tool, S, snapAt, cursor, viewOnly, phone, path, tag, dim, made }: RectRoomArgs) {
  const mode = useWallMode(s => s.mode)
  const thickness = usePlan(s => s.wallStyle.thickness)
  const active = tool === 'wall' && mode === 'rect' && !viewOnly
  // The corner put down, and what's typed for the size: dropped with the tool, the level or the mode.
  const key = `${active}|${level}`
  const [state, setState] = useState<{ key: string; from: Vec2 | null; pressed: boolean; typed: string }>({ key, from: null, pressed: false, typed: '' })
  const { from, pressed, typed } = state.key === key ? state : { from: null, pressed: false, typed: '' }
  const set = (patch: Partial<{ from: Vec2 | null; pressed: boolean; typed: string }>) => setState({ key, from, pressed, typed, ...patch })

  // Width is the side that runs across the screen, however the plan is turned.
  const across = (() => {
    const o = S([0, 0])
    const x = S([1, 0])
    return Math.abs(x[0] - o[0]) >= Math.abs(x[1] - o[1]) ? 0 : 1
  })()

  /** The opposite corner: as typed, else at the pointer. */
  const farCorner = (toward: Vec2 | null): Vec2 | null => {
    if (!from) return null
    if (typed) return toward ? typedRectangle(typed, from, toward, across) : null
    return toward
  }

  const draw = (a: Vec2, c: Vec2) => {
    const st = usePlan.getState()
    const before = st.plan
    if (!before) return
    if (Math.abs(c[0] - a[0]) < MIN_RECT_SIDE || Math.abs(c[1] - a[1]) < MIN_RECT_SIDE) {
      st.notify('That’s too small for a room: each side needs to be 300 mm or more.')
      set({ from: null, pressed: false, typed: '' })
      return
    }
    st.commit(p => rectangleWalls(p, level, a, c, st.wallStyle))
    const after = usePlan.getState().plan!
    set({ from: null, pressed: false, typed: '' })
    if (after === before) {
      st.notify('Those walls are all there already, so nothing was drawn.')
      return
    }
    st.notify(roomsMadeNote(before, after))
    made(before)
  }

  /** A mouse press where a rectangle can start: it's a drag to the opposite corner, or a click that puts the first one down. */
  const down = (world: Vec2, e: { button: number; pointerType: string; shiftKey: boolean }): boolean => {
    if (!active || from || e.button !== 0 || e.pointerType === 'touch') return false
    set({ from: snapAt(world, { free: e.shiftKey }).p, pressed: true })
    return true
  }

  /** The press ends: a drag draws the rectangle, and a click leaves its first corner down. */
  const up = (world: Vec2, dragged: boolean, free: boolean) => {
    if (!from) return
    if (dragged) draw(from, snapAt(world, { free }).p)
    else {
      set({ pressed: false })
      usePlan.getState().notify(null)
    }
  }

  /** A click or tap: the first corner, then the opposite one. True when it was used. */
  const click = (world: Vec2, free: boolean): boolean => {
    if (!active) return false
    const p = snapAt(world, { free }).p
    if (!from) {
      set({ from: p })
      usePlan.getState().notify(null)
      return true
    }
    const far = farCorner(p)
    if (far) draw(from, far)
    return true
  }

  /** Keys: W and Shift+W pick how the Wall tool draws; with a corner down, the typed size, Enter and Esc. True when used. */
  const onKey = (e: KeyboardEvent): boolean => {
    if (viewOnly || e.ctrlKey || e.metaKey || e.altKey) return false
    // The plan's own keys then pick the Wall tool.
    if (e.key.toLowerCase() === 'w') setWallMode(e.shiftKey ? 'rect' : 'line')
    if (!active || !from || pressed) return false
    if (/^[0-9.]$/.test(e.key) || ((e.key === 'x' || e.key === 'X' || e.key === '*' || e.key === '×') && typed && !/[x×*]/i.test(typed))) {
      set({ typed: (typed + e.key.toLowerCase()).slice(0, 15) })
      return true
    }
    if (e.key === 'Backspace' && typed) {
      set({ typed: typed.slice(0, -1) })
      return true
    }
    if (e.key === 'Enter' && typed) {
      const far = farCorner(cursor?.p ?? [from[0] + 1, from[1] + 1])
      if (far) draw(from, far)
      else usePlan.getState().notify('Type the width, an x, then the depth, in mm (4000x3000), and press Enter.')
      return true
    }
    if (e.key === 'Escape') {
      set({ from: null, typed: '' })
      return true
    }
    return false
  }

  const far = active ? farCorner(cursor?.p ?? null) : null
  const over = (() => {
    if (!from || !far) return null
    const w = Math.abs(far[0] - from[0])
    const d = Math.abs(far[1] - from[1])
    if (w < 0.01 || d < 0.01) return null
    const x0 = Math.min(from[0], far[0])
    const x1 = Math.max(from[0], far[0])
    const y0 = Math.min(from[1], far[1])
    const y1 = Math.max(from[1], far[1])
    const h = thickness / 2
    const ring = (g: number): Vec2[] => [
      [x0 - g, y0 - g],
      [x1 + g, y0 - g],
      [x1 + g, y1 + g],
      [x0 - g, y1 + g],
    ]
    const hollow = x1 - x0 > thickness && y1 - y0 > thickness
    const mm = (m: number) => Math.round(m * 1000).toString()
    const size = across === 0 ? `${mm(w)} × ${mm(d)} mm` : `${mm(d)} × ${mm(w)} mm`
    const inside = Math.max(w - thickness, 0) * Math.max(d - thickness, 0)
    return (
      <g className="rect-room-preview">
        <path className="wall preview" fillRule="evenodd" d={`${path(ring(h))}${hollow ? path(ring(-h)) : ''}`} />
        {!typed && dim([x0, y0], [x1, y0], 0, 'rect-w')}
        {!typed && dim([x1, y0], [x1, y1], 0, 'rect-d')}
        {tag(far, [typed ? `${typed.replace(/[x*]/, ' × ')}▌ mm` : size, `${inside.toFixed(1)} m² inside the walls`])}
      </g>
    )
  })()
  // The size being typed shows before it's complete, too.
  const typing = active && from && typed && !far && cursor ? tag(cursor.p, [`${typed.replace(/[x*]/, ' × ')}▌ mm`, 'width x depth, then Enter']) : null

  // With a finger there's no pointer to follow: the corner tapped shows until the second tap.
  const corner = active && from && !far ? <circle className="chain" cx={S(from)[0]} cy={S(from)[1]} r={5} /> : null

  return { active, down, up, click, key: onKey, over: over ?? typing ?? corner, hint: active ? (phone ? (from ? HINT.phoneNext : HINT.phoneStart) : from ? HINT.next : HINT.start) : null }
}
