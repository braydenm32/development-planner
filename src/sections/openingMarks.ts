// The marks an elevation draws on a door or window to say how it opens, as drafters do: a dashed
// triangle whose point is at the hinge (a hinged door, each leaf of a pair, an awning sash hinged
// at its top), an arrow the way a slider moves, the frame and meeting stiles or rails of glazed
// kinds, folds on a bifold, ribs on a garage door and the sill under a window. Lines only, in the
// output's own units with y down the page, so the screen and the PDF draw them the same way.

import type { Pt } from './common'
import type { ElevationOpening } from './elevation'
import { bifoldPanels } from '../plan/openingDetail'
import type { LineStyle } from './paint'

export interface Mark {
  pts: Pt[]
  style: LineStyle
}

/**
 * The marks on an opening drawn from x0 to x1 across and y0 (its head) to y1 (its foot, or sill)
 * down, at `k` output units per metre.
 */
export function openingMarks(o: Pick<ElevationOpening, 'kind' | 'style' | 'hinge' | 'box'>, x0: number, x1: number, y0: number, y1: number, k: number): Mark[] {
  const out: Mark[] = []
  const line = (style: LineStyle, ...pts: Pt[]) => out.push({ pts, style })
  const w = x1 - x0
  const h = y1 - y0
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  const f = Math.min(0.05 * k, w / 8, h / 8)
  const left = o.hinge === 'left'
  /** An arrow from a to b, its head at b. */
  const arrow = (a: Pt, b: Pt) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const ux = (b[0] - a[0]) / len
    const uy = (b[1] - a[1]) / len
    const s = Math.min(0.12 * k, len / 3)
    line('detail', a, b)
    line('detail', [b[0] - ux * s - uy * s * 0.5, b[1] - uy * s + ux * s * 0.5], b, [b[0] - ux * s + uy * s * 0.5, b[1] - uy * s - ux * s * 0.5])
  }
  /** A frame's inside edge, inset f. */
  const inner = (a: number, b: number, c: number, d: number) => line('detail', [a + f, c + f], [b - f, c + f], [b - f, d - f], [a + f, d - f], [a + f, c + f])
  /** The dashed triangle on a leaf or sash, its point at the hinge side's middle: 'l', 'r' or 't'. */
  const swing = (a: number, b: number, c: number, d: number, at: 'l' | 'r' | 't') => {
    if (at === 't') line('swing', [a + f, d - f], [(a + b) / 2, c + f], [b - f, d - f])
    else if (at === 'l') line('swing', [b - f, c + f], [a + f, (c + d) / 2], [b - f, d - f])
    else line('swing', [a + f, c + f], [b - f, (c + d) / 2], [a + f, d - f])
  }

  if (o.kind === 'garage') {
    for (let y = y0 + 0.5 * k; y < y1 - 0.1 * k; y += 0.5 * k) line('detail', [x0, y], [x1, y])
    return out
  }
  if (o.kind === 'opening' || w < 4 * f || h < 4 * f) return out

  if (o.kind === 'window') {
    // The sill, a little wider than the opening.
    const sx = Math.min(0.04 * k, w / 10)
    line('detail', [x0 - sx, y1 + f * 0.6], [x1 + sx, y1 + f * 0.6])
    if (o.style === undefined) {
      // A window of no kind is drawn as it always was: a mullion when it's wide.
      if (w > 1.3 * k) line('detail', [mx, y0], [mx, y1])
      return out
    }
    inner(x0, x1, y0, y1)
    if (o.style === 'sliding') {
      // Two sashes meeting in the middle; the one away from the fixed side slides towards it.
      line('detail', [mx, y0 + f], [mx, y1 - f])
      const a: Pt = left ? [x1 - w * 0.12, my] : [x0 + w * 0.12, my]
      const b: Pt = left ? [mx + w * 0.08, my] : [mx - w * 0.08, my]
      arrow(a, b)
    } else if (o.style === 'double-hung') {
      // The meeting rail, and the lower sash slides up.
      line('detail', [x0 + f, my], [x1 - f, my])
      arrow([mx, y1 - h * 0.12], [mx, my + h * 0.1])
    } else if (o.style === 'awning') {
      swing(x0, x1, y0, y1, 't')
    }
    return out
  }

  // Doors: a door with no kind is a hinged one.
  const style = o.style ?? 'hinged'
  if (style === 'hinged') {
    swing(x0, x1, y0, y1, left ? 'l' : 'r')
  } else if (style === 'double') {
    inner(x0, mx, y0, y1)
    inner(mx, x1, y0, y1)
    swing(x0, mx, y0, y1, 'l')
    swing(mx, x1, y0, y1, 'r')
  } else if (style === 'sliding') {
    inner(x0, x1, y0, y1)
    line('detail', [mx, y0 + f], [mx, y1 - f])
    const a: Pt = left ? [x1 - w * 0.12, my] : [x0 + w * 0.12, my]
    const b: Pt = left ? [mx + w * 0.08, my] : [mx - w * 0.08, my]
    arrow(a, b)
  } else {
    // Bifold: its panels, each with the point of its triangle at the fold it turns on, zigzagging.
    const n = bifoldPanels(o.box.s1 - o.box.s0)
    const p = w / n
    for (let i = 0; i < n; i++) {
      const a = x0 + i * p
      if (i) line('detail', [a, y0], [a, y1])
      // Counted from the fold side: the first turns on the jamb, the next on the fold they share.
      const fromHinge = left ? i : n - 1 - i
      const toward = fromHinge % 2 === 0 ? (left ? 'l' : 'r') : left ? 'r' : 'l'
      swing(a, a + p, y0, y1, toward)
    }
  }
  return out
}
