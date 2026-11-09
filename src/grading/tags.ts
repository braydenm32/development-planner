// Where each suggested wall's tag goes on the screen: beside its line, over the batter side, and
// clear of the tags already placed, so neighbouring walls' tags don't sit on each other.

import type { Vec2 } from '../lib/geom'
import { wallText } from './suggest'

/** The tag's label, and its width (px) with and without its Add and Dismiss buttons. */
export function tagSize(height: number, buttons: boolean) {
  const label = `${wallText(height)} wall?`
  const w = label.length * 6.4 + 30
  return { label, w, total: w + (buttons ? 64 : 0) }
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/**
 * The middle of each tag's label, in screen pixels: along its line from the middle out towards the
 * ends, on the batter side first and then the other, the first spot that's free; where none is,
 * the spot that overlaps the others least.
 */
export function placeTags(lines: { A: Vec2; B: Vec2; height: number }[], buttons: boolean): Vec2[] {
  const placed: Box[] = []
  return lines.map(({ A, B, height }) => {
    const { w, total } = tagSize(height, buttons)
    const dx = B[0] - A[0]
    const dy = B[1] - A[1]
    const l = Math.hypot(dx, dy) || 1
    // The levelled ground is on the left of a→b on the site; on the screen (y down) that's the right.
    const n: Vec2 = [-dy / l, dx / l]
    const box = (c: Vec2): Box => ({ x0: c[0] - w / 2 - 2, y0: c[1] - 12, x1: c[0] - w / 2 + total + 2, y1: c[1] + 12 })
    // The first spot clear of every tag so far; failing that, the one that overlaps least.
    let best: Vec2 | null = null
    let least = Infinity
    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8, 0.05, 0.95]) {
      for (const side of [1, -1]) {
        for (const off of [16, 40, 64]) {
          const c: Vec2 = [A[0] + dx * t + n[0] * off * side, A[1] + dy * t + n[1] * off * side]
          const b = box(c)
          const hit = placed.reduce((sum, p) => sum + (overlaps(p, b) ? (Math.min(p.x1, b.x1) - Math.max(p.x0, b.x0)) * (Math.min(p.y1, b.y1) - Math.max(p.y0, b.y0)) : 0), 0)
          if (hit < least) {
            least = hit
            best = c
          }
          if (!hit) break
        }
        if (!least) break
      }
      if (!least) break
    }
    const at = best ?? [(A[0] + B[0]) / 2 + n[0] * 16, (A[1] + B[1]) / 2 + n[1] * 16]
    placed.push(box(at))
    return at
  })
}
