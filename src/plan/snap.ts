import type { Vec2 } from '../lib/geom'
import { closestOnSegment } from './geometry'
import type { Wall } from './model'

export type SnapKind = 'end' | 'wall' | 'angle' | 'align' | 'grid' | 'free'

export interface SnapResult {
  p: Vec2
  kind: SnapKind
  /** Dashed guide lines to draw (alignment with other points). */
  guides: [Vec2, Vec2][]
}

export interface SnapContext {
  walls: Wall[]
  /** Other points worth snapping to, e.g. the start of the chain being drawn. */
  points?: Vec2[]
  /** The previous point when drawing a line from it. */
  anchor?: Vec2 | null
  /** Snap distance in metres (a few screen pixels). */
  tol: number
  /** Turn snapping off (Shift held). */
  free?: boolean
}

const round = (v: number, step: number) => Math.round(v / step) * step

export function snap(raw: Vec2, ctx: SnapContext): SnapResult {
  if (ctx.free) return { p: [round(raw[0], 0.001), round(raw[1], 0.001)], kind: 'free', guides: [] }

  const points: Vec2[] = [...ctx.walls.flatMap(w => [w.a, w.b]), ...(ctx.points ?? [])]

  // 1. Existing points
  let best: Vec2 | null = null
  let bestD = ctx.tol
  for (const q of points) {
    const d = Math.hypot(q[0] - raw[0], q[1] - raw[1])
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  if (best) return { p: [best[0], best[1]], kind: 'end', guides: [] }

  // 2. Along 0/45/90° from the previous point, stopping on walls or in line with other points
  const a = ctx.anchor
  if (a) {
    const dx = raw[0] - a[0]
    const dy = raw[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (len > 1e-6) {
      const ang = Math.atan2(dy, dx)
      const step = Math.PI / 4
      const snapped = Math.round(ang / step) * step
      if (Math.abs(ang - snapped) < (6 * Math.PI) / 180) {
        const dir: Vec2 = [Math.cos(snapped), Math.sin(snapped)]
        const along = dx * dir[0] + dy * dir[1]
        let p: Vec2 = [a[0] + dir[0] * along, a[1] + dir[1] * along]
        // Stop on a wall the line crosses near the cursor.
        for (const w of ctx.walls) {
          const hit = rayHitsSegment(a, dir, w.a, w.b)
          if (hit !== null && Math.abs(hit - along) < ctx.tol && hit > 1e-6) {
            return { p: [a[0] + dir[0] * hit, a[1] + dir[1] * hit], kind: 'wall', guides: [] }
          }
        }
        // Line up with another point (same x or y), when the line is horizontal or vertical.
        const guides: [Vec2, Vec2][] = []
        if (Math.abs(dir[1]) < 1e-9 || Math.abs(dir[0]) < 1e-9) {
          const axis = Math.abs(dir[1]) < 1e-9 ? 0 : 1
          let bestAlign: Vec2 | null = null
          let bestAlignD = ctx.tol
          for (const q of points) {
            const d = Math.abs(q[axis] - p[axis])
            if (d < bestAlignD) {
              bestAlignD = d
              bestAlign = q
            }
          }
          if (bestAlign) {
            p = axis === 0 ? [bestAlign[0], p[1]] : [p[0], bestAlign[1]]
            guides.push([bestAlign, p])
            return { p, kind: 'align', guides }
          }
        }
        const l = round(along, 0.01)
        return { p: [a[0] + dir[0] * l, a[1] + dir[1] * l], kind: 'angle', guides }
      }
    }
  }

  // 3. Onto a wall's centreline
  let wallBest: Vec2 | null = null
  let wallD = ctx.tol
  for (const w of ctx.walls) {
    const c = closestOnSegment(raw, w.a, w.b)
    if (c.dist < wallD) {
      wallD = c.dist
      wallBest = c.point
    }
  }
  if (wallBest) return { p: wallBest, kind: 'wall', guides: [] }

  // 4. In line with other points horizontally and/or vertically
  let p: Vec2 = [raw[0], raw[1]]
  const guides: [Vec2, Vec2][] = []
  for (const axis of [0, 1] as const) {
    let bestQ: Vec2 | null = null
    let bestQD = ctx.tol
    for (const q of points) {
      const d = Math.abs(q[axis] - raw[axis])
      if (d < bestQD) {
        bestQD = d
        bestQ = q
      }
    }
    if (bestQ) {
      p = axis === 0 ? [bestQ[0], p[1]] : [p[0], bestQ[1]]
      guides.push([bestQ, p])
    }
  }
  if (guides.length) {
    for (const g of guides) g[1] = p
    return { p, kind: 'align', guides }
  }

  // 5. A 50 mm grid
  return { p: [round(raw[0], 0.05), round(raw[1], 0.05)], kind: 'grid', guides: [] }
}

/** Distance along the ray a + t*dir to segment pq, or null. */
function rayHitsSegment(a: Vec2, dir: Vec2, p: Vec2, q: Vec2): number | null {
  const e: Vec2 = [q[0] - p[0], q[1] - p[1]]
  const den = dir[0] * e[1] - dir[1] * e[0]
  if (Math.abs(den) < 1e-9) return null
  const ap: Vec2 = [p[0] - a[0], p[1] - a[1]]
  const t = (ap[0] * e[1] - ap[1] * e[0]) / den
  const s = (ap[0] * dir[1] - ap[1] * dir[0]) / den
  if (s < -1e-9 || s > 1 + 1e-9) return null
  return t
}
