import type { Vec2 } from '../lib/geom'
import type { VPath } from './pdfVector'

/**
 * Line work from a drawing, tidied into the shapes a reader can reason about. Many CAD
 * PDFs draw every line as loose short strokes (circles as dozens of chords, dashed lines as
 * separate dashes), so strokes that meet end to end are joined into chains first; then
 * chains are sorted into circles, straight runs and dashed runs.
 */
export interface Chain {
  pts: Vec2[]
  closed: boolean
  /** Style the chain was drawn in: colour and width (points). */
  stroke: string
  width: number
  length: number
}

export interface Circle {
  c: Vec2
  r: number
}

/** A straight line drawn as a row of dashes. */
export interface DashedRun {
  a: Vec2
  b: Vec2
  dashes: number
  /** Average dash length and gap (points). */
  dash: number
  gap: number
  stroke: string
  width: number
}

export interface Linework {
  chains: Chain[]
  circles: Circle[]
  dashed: DashedRun[]
  /** Straight pieces of the chains, for finding the line a label sits beside. */
  segments: { a: Vec2; b: Vec2; chain: number }[]
}

const keyOf = (p: Vec2, q: number) => `${Math.round(p[0] / q)},${Math.round(p[1] / q)}`
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1])

function polyLength(pts: Vec2[], closed: boolean): number {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i])
  if (closed && pts.length > 2) L += dist(pts[pts.length - 1], pts[0])
  return L
}

/** Join strokes of one style that meet end to end into longer chains, breaking at forks. */
export function chainPaths(paths: VPath[], tol = 0.05): Chain[] {
  const out: Chain[] = []
  const byStyle = new Map<string, VPath[]>()
  for (const p of paths) {
    if (!p.stroke) continue
    const k = `${p.stroke}|${p.width.toFixed(2)}`
    const list = byStyle.get(k)
    if (list) list.push(p)
    else byStyle.set(k, [p])
  }
  for (const [style, list] of byStyle) {
    const [stroke, w] = style.split('|')
    const width = Number(w)
    // Closed shapes drawn in one go stay as they are.
    const open: Vec2[][] = []
    for (const p of list) {
      if (p.closed && p.pts.length >= 3) out.push({ pts: p.pts, closed: true, stroke, width, length: polyLength(p.pts, true) })
      else open.push(p.pts)
    }
    // Every stroke is a list of points; ends meet when they round to the same key.
    const ends = new Map<string, number[]>()
    const addEnd = (k: string, i: number) => {
      const l = ends.get(k)
      if (l) l.push(i)
      else ends.set(k, [i])
    }
    const keys = open.map(pts => [keyOf(pts[0], tol), keyOf(pts[pts.length - 1], tol)] as [string, string])
    keys.forEach(([a, b], i) => {
      addEnd(a, i)
      addEnd(b, i)
    })
    const used = new Uint8Array(open.length)
    // The other stroke at an end shared by exactly two strokes.
    const next = (k: string, from: number) => {
      const l = ends.get(k)
      if (!l || l.length !== 2) return undefined
      return l[0] === from ? l[1] : l[0]
    }
    for (let i = 0; i < open.length; i++) {
      if (used[i] || open[i].length < 2) continue
      used[i] = 1
      let pts = [...open[i]]
      let [head, tail] = keys[i]
      let headIdx = i
      let tailIdx = i
      // Grow forwards from the tail, then backwards from the head.
      for (;;) {
        const j = next(tail, tailIdx)
        if (j === undefined || used[j]) break
        used[j] = 1
        const fwd = keys[j][0] === tail
        pts = [...pts, ...(fwd ? open[j] : [...open[j]].reverse()).slice(1)]
        tail = fwd ? keys[j][1] : keys[j][0]
        tailIdx = j
      }
      for (;;) {
        const j = next(head, headIdx)
        if (j === undefined || used[j]) break
        used[j] = 1
        const back = keys[j][1] === head
        pts = [...(back ? open[j] : [...open[j]].reverse()).slice(0, -1), ...pts]
        head = back ? keys[j][0] : keys[j][1]
        headIdx = j
      }
      const closed = pts.length > 3 && head === tail
      if (closed) pts.pop()
      out.push({ pts, closed, stroke, width, length: polyLength(pts, closed) })
    }
  }
  return out
}


/** A closed chain that is round enough to be a circle (a tree trunk, a manhole). */
export function asCircle(ch: Chain): Circle | null {
  if (!ch.closed || ch.pts.length < 8) return null
  const n = ch.pts.length
  const c: Vec2 = [ch.pts.reduce((s, p) => s + p[0], 0) / n, ch.pts.reduce((s, p) => s + p[1], 0) / n]
  const rs = ch.pts.map(p => dist(p, c))
  const r = rs.reduce((s, x) => s + x, 0) / n
  if (r <= 0) return null
  const spread = Math.max(...rs.map(x => Math.abs(x - r)))
  return spread < r * 0.12 ? { c, r } : null
}

/**
 * Straight lines drawn as dashes: short straight strokes lying on one line with regular
 * gaps between them, joined into one run per line.
 */
export function findDashedRuns(chains: Chain[], maxDash = 12): DashedRun[] {
  interface Piece {
    a: Vec2
    b: Vec2
    len: number
    ang: number
    stroke: string
    width: number
  }
  const pieces: Piece[] = []
  for (const ch of chains) {
    if (ch.closed || ch.length > maxDash || ch.length < 0.4) continue
    const a = ch.pts[0]
    const b = ch.pts[ch.pts.length - 1]
    const len = dist(a, b)
    // straight only
    if (len < ch.length * 0.98) continue
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0])
    if (ang < 0) ang += Math.PI
    if (ang >= Math.PI - 1e-9) ang -= Math.PI
    pieces.push({ a, b, len, ang, stroke: ch.stroke, width: ch.width })
  }
  // Pieces on one line share their direction and their offset from the page origin.
  const lines = new Map<string, Piece[]>()
  for (const p of pieces) {
    const n: Vec2 = [-Math.sin(p.ang), Math.cos(p.ang)]
    const off = ((p.a[0] + p.b[0]) / 2) * n[0] + ((p.a[1] + p.b[1]) / 2) * n[1]
    const k = `${p.stroke}|${p.width.toFixed(2)}|${Math.round(p.ang / 0.01)}|${Math.round(off / 0.6)}`
    const l = lines.get(k)
    if (l) l.push(p)
    else lines.set(k, [p])
  }
  const runs: DashedRun[] = []
  for (const list of lines.values()) {
    if (list.length < 3) continue
    const d: Vec2 = [Math.cos(list[0].ang), Math.sin(list[0].ang)]
    const along = (p: Vec2) => p[0] * d[0] + p[1] * d[1]
    const sorted = list
      .map(p => {
        const s0 = along(p.a)
        const s1 = along(p.b)
        return { p, s0: Math.min(s0, s1), s1: Math.max(s0, s1) }
      })
      .sort((x, y) => x.s0 - y.s0)
    // Split where a gap is much longer than the dashes either side of it.
    let cur: typeof sorted = []
    const flush = () => {
      if (cur.length >= 3) {
        const gaps = cur.slice(1).map((x, i) => x.s0 - cur[i].s1)
        const dash = cur.reduce((s, x) => s + (x.s1 - x.s0), 0) / cur.length
        const gap = gaps.reduce((s, g) => s + g, 0) / gaps.length
        if (gap > 0.2) {
          const first = cur[0].p
          const last = cur[cur.length - 1].p
          const a = along(first.a) <= along(first.b) ? first.a : first.b
          const b = along(last.a) >= along(last.b) ? last.a : last.b
          runs.push({ a, b, dashes: cur.length, dash, gap, stroke: first.stroke, width: first.width })
        }
      }
      cur = []
    }
    for (const x of sorted) {
      const prev = cur[cur.length - 1]
      if (prev) {
        const gap = x.s0 - prev.s1
        const dashLen = Math.max(prev.s1 - prev.s0, x.s1 - x.s0)
        if (gap < -0.05 || gap > Math.max(dashLen * 2.5, 3)) flush()
      }
      cur.push(x)
    }
    flush()
  }
  return runs
}

export function analyseLinework(paths: VPath[]): Linework {
  const chains = chainPaths(paths)
  const circles: Circle[] = []
  for (const ch of chains) {
    const c = asCircle(ch)
    if (c) circles.push(c)
  }
  const segments: Linework['segments'] = []
  chains.forEach((ch, i) => {
    for (let k = 1; k < ch.pts.length; k++) segments.push({ a: ch.pts[k - 1], b: ch.pts[k], chain: i })
    if (ch.closed) segments.push({ a: ch.pts[ch.pts.length - 1], b: ch.pts[0], chain: i })
  })
  return { chains, circles, dashed: [...findDashedRuns(chains), ...patternDashes(paths)], segments }
}

/** Lines drawn with a dash pattern, rather than as separate dashes: each straight piece is a run. */
function patternDashes(paths: VPath[]): DashedRun[] {
  const runs: DashedRun[] = []
  for (const p of paths) {
    if (!p.stroke || !p.dash.some(d => d > 0)) continue
    const dash = p.dash[0]
    const gap = p.dash[1] ?? p.dash[0]
    const n = p.closed ? p.pts.length : p.pts.length - 1
    for (let i = 0; i < n; i++) {
      const a = p.pts[i]
      const b = p.pts[(i + 1) % p.pts.length]
      const L = dist(a, b)
      if (L < 2) continue
      runs.push({ a, b, dashes: Math.max(1, Math.round(L / Math.max(dash + gap, 1e-6))), dash, gap, stroke: p.stroke, width: p.width })
    }
  }
  return runs
}
