// A room's clear size, wall face to wall face: what a builder or a client asks for first
// ("is the garage 6 by 6?"). From the room's inside outline (roomShape's `inner`).

import type { Vec2 } from '../lib/geom'
import { planarFaces, roomShape } from './geometry'
import type { Plan, Room } from './model'

export interface RoomSize {
  /** Across and up the page with the house square on it (m); for a room on a skew, along its longest wall and across it. */
  w: number
  d: number
  /** A plain rectangle: the two numbers are its sides. Otherwise they're the most it spans each way. */
  rect: boolean
}

const SAME = 1e-4

/** The outline without doubled points or points along a straight side. */
function corners(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = []
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n]
    const q = pts[i]
    const r = pts[(i + 1) % n]
    const ax = q[0] - p[0]
    const ay = q[1] - p[1]
    const bx = r[0] - q[0]
    const by = r[1] - q[1]
    const la = Math.hypot(ax, ay)
    const lb = Math.hypot(bx, by)
    if (la < SAME) continue
    // Straight on (or a doubled point ahead, which its own turn drops): not a corner.
    if (lb >= SAME && Math.abs(ax * by - ay * bx) / (la * lb) < 1e-3 && ax * bx + ay * by > 0) continue
    out.push(q)
  }
  return out
}

/** The clear size of a room from its inside outline, or null when it has none. */
export function roomInsideSize(inner: Vec2[] | null | undefined): RoomSize | null {
  if (!inner || inner.length < 3) return null
  const c = corners(inner)
  if (c.length < 3) return null
  // Measured along the longest side, and square across it.
  let u: Vec2 = [1, 0]
  let longest = 0
  c.forEach((p, i) => {
    const q = c[(i + 1) % c.length]
    const l = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (l > longest + SAME) {
      longest = l
      u = [(q[0] - p[0]) / l, (q[1] - p[1]) / l]
    }
  })
  const along = c.map(p => p[0] * u[0] + p[1] * u[1])
  const across = c.map(p => -p[0] * u[1] + p[1] * u[0])
  const span = (v: number[]) => Math.max(...v) - Math.min(...v)
  const l = span(along)
  const x = span(across)
  if (l < SAME || x < SAME) return null
  const rect =
    c.length === 4 &&
    c.every((p, i) => {
      const q = c[(i + 1) % 4]
      const r = c[(i + 2) % 4]
      const dot = (q[0] - p[0]) * (r[0] - q[0]) + (q[1] - p[1]) * (r[1] - q[1])
      return Math.abs(dot) / (Math.hypot(q[0] - p[0], q[1] - p[1]) * Math.hypot(r[0] - q[0], r[1] - q[1])) < 1e-3
    })
  // Square to the house: across the page first, then up it. On a skew: the long way first.
  return Math.abs(u[0]) < 1e-3 ? { w: x, d: l, rect } : { w: l, d: x, rect }
}

/** "4810 × 7730 mm", in whole millimetres. */
export const roomSizeText = (s: RoomSize): string => `${Math.round(s.w * 1000)} × ${Math.round(s.d * 1000)} mm`

/** A room's clear size in a plan; null when its walls don't enclose it. */
export const roomInside = (plan: Plan, room: Room): RoomSize | null => roomInsideSize(roomShape(room, planarFaces(plan.walls.filter(w => w.level === room.level)))?.inner)
