// A garage door: a wide opening with an overhead door that doesn't swing. The plan canvas and the
// PDF draw it the same way, from here: a jamb at each side and the door's panel as a dashed line
// across the opening. In 3D the panel closes the opening.

import type { Vec2 } from '../lib/geom'
import { pointOnWall, wallDir, type Opening, type Wall } from './model'

/** How thick the door panel is drawn in 3D (m). */
export const GARAGE_PANEL = 0.05

export interface GarageDoorSymbol {
  /** Across the wall at each side of the opening. */
  jambs: [Vec2, Vec2][]
  /** The door, along the middle of the wall: drawn dashed. */
  panel: [Vec2, Vec2]
}

/**
 * The plan symbol from the opening's two ends on the wall's centreline (`p0`, `p1`), the wall's
 * unit normal `n`, and half the wall's thickness.
 */
export function garageDoorSymbol(p0: Vec2, p1: Vec2, n: Vec2, halfThickness: number): GarageDoorSymbol {
  const at = (p: Vec2, s: number): Vec2 => [p[0] + n[0] * s, p[1] + n[1] * s]
  return {
    jambs: [
      [at(p0, -halfThickness), at(p0, halfThickness)],
      [at(p1, -halfThickness), at(p1, halfThickness)],
    ],
    panel: [p0, p1],
  }
}

/** The door panel's footprint in the house frame, for 3D: the opening's width, GARAGE_PANEL thick, on the wall's centreline. */
export function garagePanelFootprint(w: Pick<Wall, 'a' | 'b'>, o: Pick<Opening, 'offset' | 'width'>): Vec2[] {
  const d = wallDir(w)
  const h = GARAGE_PANEL / 2
  const n: Vec2 = [-d[1] * h, d[0] * h]
  const c0 = pointOnWall(w, o.offset - o.width / 2)
  const c1 = pointOnWall(w, o.offset + o.width / 2)
  return [
    [c0[0] - n[0], c0[1] - n[1]],
    [c1[0] - n[0], c1[1] - n[1]],
    [c1[0] + n[0], c1[1] + n[1]],
    [c0[0] + n[0], c0[1] + n[1]],
  ]
}
