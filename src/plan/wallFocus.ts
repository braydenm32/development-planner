// A retaining wall pointed at from a list: the row under the pointer lights its wall on the plan,
// a tap on a phone row zooms the plan to it, and the ground a wall's height changes is lit while
// its height box has focus.

import { create } from 'zustand'
import type { Vec2 } from '../lib/geom'
import type { Wall } from './model'

interface WallFocus {
  /** The wall whose row is under the pointer. */
  hover: string | null
  /** The ground a wall changes, lit while its height box has focus: grid squares' lower-left corners, survey local frame. */
  changed: { cells: Vec2[]; cell: number } | null
  /** Points for the plan to fit, once per token. */
  zoom: { pts: Vec2[]; token: number } | null
}

export const useWallFocus = create<WallFocus>(() => ({ hover: null, changed: null, zoom: null }))

export const showChanged = (changed: WallFocus['changed']) => useWallFocus.setState({ changed })

export const hoverWall = (id: string | null) => {
  if (useWallFocus.getState().hover !== id) useWallFocus.setState({ hover: id })
}

/** How much room to leave round a wall the plan zooms to (m). */
const ROOM = 4

/** Fit the plan to a wall, with some ground round it to see where it is. */
export function zoomToWall(w: Pick<Wall, 'a' | 'b'>) {
  const xs = [w.a[0], w.b[0]]
  const ys = [w.a[1], w.b[1]]
  const pts: Vec2[] = [
    [Math.min(...xs) - ROOM, Math.min(...ys) - ROOM],
    [Math.max(...xs) + ROOM, Math.max(...ys) + ROOM],
  ]
  useWallFocus.setState(s => ({ zoom: { pts, token: (s.zoom?.token ?? 0) + 1 } }))
}
