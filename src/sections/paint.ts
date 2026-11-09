// How a section or an elevation is laid out and drawn, once, for the screen (svg.tsx) and the
// PDF (sheets.ts). The drawing code works in the output's own units with y running down the
// page; a Painter turns each line, shape and label into SVG or PDF.

import { rlText, type Box, type LevelMark, type Pt } from './common'
import type { ElevationDrawing } from './elevation'
import type { SectionDrawing } from './section'

export type Drawing = SectionDrawing | ElevationDrawing

/** Filled shapes, each with its own fill and edge. */
export type ShapeStyle =
  | 'earth'
  | 'cut'
  | 'fill'
  | 'slab'
  | 'framing'
  | 'pier'
  | 'wall-cut'
  | 'retaining'
  | 'roof-cut'
  | 'wall-face'
  | 'roof-face'
  | 'window'
  | 'door'
  | 'garage'
  | 'opening'
  | 'scale-dark'
  | 'scale-light'

/** Lines. */
export type LineStyle = 'natural' | 'finished' | 'ceiling' | 'level' | 'boundary' | 'dim' | 'axis' | 'roof-edge' | 'detail' | 'height'

export type Ink = 'ink' | 'muted' | 'accent' | 'boundary'

export interface TextStyle {
  size: number
  bold?: boolean
  anchor?: 'start' | 'middle' | 'end'
  /** Vertical placement of y: the baseline, or the middle of the letters. */
  middle?: boolean
  ink?: Ink
  /** Degrees anticlockwise. */
  angle?: number
}

export interface Painter {
  /** Type sizes, in output units. */
  size: { title: number; label: number; small: number }
  /** One output unit of spacing for gaps and ticks: a pixel on screen, about a third of a millimetre on paper. */
  unit: number
  shape(pts: Pt[], style: ShapeStyle): void
  line(pts: Pt[], style: LineStyle): void
  text(x: number, y: number, s: string, o: TextStyle): void
  measure(s: string, size: number, bold?: boolean): number
  /** False where the sheet already has a scale bar (the PDF's title block). */
  scaleBar?: boolean
}

/** Room round the drawing for its labels, in metres of the drawing: below the ground, and above for the labels there. */
const PAD_BELOW = 0.6
const PAD_ABOVE = 1.1

/** The drawing's extent across (m) and up (RL). */
export function extent(d: Drawing): { s0: number; s1: number; z0: number; z1: number } {
  return d.kind === 'section'
    ? { s0: 0, s1: d.length, z0: d.zMin - PAD_BELOW, z1: d.zMax + PAD_ABOVE }
    : { s0: d.s0, s1: d.s1, z0: d.zMin - PAD_BELOW, z1: d.zMax + PAD_ABOVE }
}

/** The margins round the drawn part: the title above, the RL labels on the left, the scale bar below. */
export function margins(p: Painter, d: Drawing): { top: number; left: number; bottom: number; right: number } {
  const labels = d.levels.map(m => levelText(m))
  const widest = Math.max(p.measure('RL 00.00', p.size.small), ...labels.map(t => p.measure(t, p.size.label, true)))
  return { top: p.size.title * 2.2, left: widest + p.unit * 16, bottom: p.size.label * 3.4, right: p.unit * 10 }
}

/** The whole drawing's size at `k` output units per metre. */
export function drawingSize(p: Painter, d: Drawing, k: number): { w: number; h: number } {
  const e = extent(d)
  const m = margins(p, d)
  return { w: m.left + m.right + (e.s1 - e.s0) * k, h: m.top + m.bottom + (e.z1 - e.z0) * k }
}

/** The scale (output units per metre) that fits the drawing in a width, and no taller than `maxH`. */
export function fitScale(p: Painter, d: Drawing, w: number, maxH: number): number {
  const e = extent(d)
  const m = margins(p, d)
  return Math.max(0.1, Math.min((w - m.left - m.right) / Math.max(e.s1 - e.s0, 1), (maxH - m.top - m.bottom) / Math.max(e.z1 - e.z0, 1)))
}

const levelText = (m: LevelMark) => `${m.text} ${rlText(m.rl)}`

/**
 * Move labels apart so none is nearer than `gap` to the next, keeping their order and staying as
 * close to where each wants to be as they can. Positions run down the page.
 */
export function spread(ys: number[], gap: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  // Clusters that overlap are centred on where their labels want to be.
  type Cluster = { ids: number[]; top: number; want: number }
  const clusters: Cluster[] = []
  for (const o of order) {
    clusters.push({ ids: [o.i], top: o.y, want: o.y })
    for (;;) {
      const n = clusters.length
      if (n < 2) break
      const a = clusters[n - 2]
      const b = clusters[n - 1]
      if (a.top + a.ids.length * gap <= b.top + 1e-9) break
      const ids = [...a.ids, ...b.ids]
      const want = (a.want * a.ids.length + b.want * b.ids.length) / ids.length
      clusters.splice(n - 2, 2, { ids, want, top: want - ((ids.length - 1) * gap) / 2 })
    }
  }
  const out = new Array<number>(ys.length)
  for (const c of clusters) c.ids.forEach((id, k) => (out[id] = c.top + k * gap))
  return out
}

/** A scale bar's length (m): a round number at least `min` output units long. */
export function barLength(k: number, min: number): number {
  return [0.5, 1, 2, 5, 10, 20, 50].find(l => l * k >= min) ?? 50
}

/**
 * Draw a section or elevation with its top left corner at (x, y) and `k` output units per metre.
 * Returns the size it took.
 */
export function paintDrawing(p: Painter, d: Drawing, x: number, y: number, k: number): { w: number; h: number } {
  const e = extent(d)
  const m = margins(p, d)
  const size = drawingSize(p, d, k)
  const left = x + m.left
  const top = y + m.top
  const X = (s: number) => left + (s - e.s0) * k
  const Y = (z: number) => top + (e.z1 - z) * k
  const P = (pt: Pt): Pt => [X(pt[0]), Y(pt[1])]
  const bottom = Y(e.z0)
  const u = p.unit
  const rect = (b: Box): Pt[] => [
    [X(b.s0), Y(b.z0)],
    [X(b.s1), Y(b.z0)],
    [X(b.s1), Y(b.z1)],
    [X(b.s0), Y(b.z1)],
  ]
  // At least a hairline wide, so thin posts still show at small scales.
  const post = (b: Box): Pt[] => {
    const c = (X(b.s0) + X(b.s1)) / 2
    const w = Math.max(X(b.s1) - X(b.s0), u * 1.6) / 2
    return [
      [c - w, Y(b.z0)],
      [c + w, Y(b.z0)],
      [c + w, Y(b.z1)],
      [c - w, Y(b.z1)],
    ]
  }

  // The ground: earth under the finished ground, and in a section the cut and fill between the two.
  for (const run of d.finished) if (run.length > 1) p.shape([...run.map(P), [X(run[run.length - 1][0]), bottom], [X(run[0][0]), bottom]], 'earth')

  if (d.kind === 'section') {
    d.finished.forEach((fin, r) => {
      const nat = d.natural[r]
      if (!nat || nat.length !== fin.length) return
      const band = (upper: (i: number) => number, lower: (i: number) => number): Pt[] => [
        ...fin.map((q, i): Pt => [X(q[0]), Y(upper(i))]),
        ...[...fin.keys()].reverse().map((i): Pt => [X(fin[i][0]), Y(lower(i))]),
      ]
      if (fin.some((q, i) => nat[i][1] - q[1] > 0.01)) p.shape(band(i => Math.max(nat[i][1], fin[i][1]), i => fin[i][1]), 'cut')
      if (fin.some((q, i) => q[1] - nat[i][1] > 0.01)) p.shape(band(i => fin[i][1], i => Math.min(nat[i][1], fin[i][1])), 'fill')
    })
    for (const run of d.finished) p.line(run.map(P), 'finished')
    for (const b of d.piers) p.shape(post(b), 'pier')
    for (const b of d.framing) p.shape(rect(b), 'framing')
    for (const b of d.slabs) p.shape(rect(b), 'slab')
    for (const b of d.retaining) p.shape(rect(b), 'retaining')
    for (const f of d.floors) for (const [s0, s1] of f.spans) p.line([P([s0, f.ceiling]), P([s1, f.ceiling])], 'ceiling')
    for (const b of d.walls) p.shape(rect(b), 'wall-cut')
    for (const r of d.roofs) p.shape(r.map(P), 'roof-cut')
    floorNotes(p, d, X, Y, k)
  } else {
    for (const b of d.piers) p.shape(post(b), 'pier')
    for (const s of d.shapes) {
      if (s.kind === 'wall') {
        p.shape(s.pts.map(P), 'wall-face')
        for (const o of s.openings) opening(p, o.kind, rect(o.box), k)
      } else {
        for (const t of s.tris) p.shape(t.map(P), 'roof-face')
        for (const [a, b] of s.edges) p.line([P(a), P(b)], 'roof-edge')
      }
    }
    // The ground in front hides the building below it.
    for (const run of d.finished) if (run.length > 1) p.shape([...run.map(P), [X(run[run.length - 1][0]), bottom], [X(run[0][0]), bottom]], 'earth')
    for (const run of d.finished) p.line(run.map(P), 'finished')
  }
  for (const run of d.natural) p.line(run.map(P), 'natural')

  // Boundaries the section crosses, with the natural ground there.
  if (d.kind === 'section') {
    for (const b of d.boundaries) {
      const bx = X(b.s)
      p.line(
        [
          [bx, Y(b.rl - 0.4)],
          [bx, top + p.size.small * 2.6],
        ],
        'boundary',
      )
      const anchor = b.s < (e.s0 + e.s1) / 2 ? 'start' : 'end'
      const tx = bx + (anchor === 'start' ? u * 3 : -u * 3)
      p.text(tx, top + p.size.small * 1.1, 'Boundary', { size: p.size.small, anchor, ink: 'boundary', bold: true })
      p.text(tx, top + p.size.small * 2.3, `RL ${rlText(b.rl)}`, { size: p.size.small, anchor, ink: 'boundary' })
    }
  }

  if (d.kind === 'elevation' && d.height) heightMark(p, d.height, X, Y, left, x + size.w)
  levelMarks(p, d, X, Y, left, top, bottom, k)

  // Title, which way it looks, and the scale bar (unless the sheet has its own).
  p.text(x, y + p.size.title, d.title, { size: p.size.title, bold: true })
  const sub = d.kind === 'section' ? `Looking ${d.looking}` : `Seen from the ${d.side}`
  p.text(x + p.measure(d.title, p.size.title, true) + u * 8, y + p.size.title, sub, { size: p.size.label, ink: 'muted' })
  // Which way each side points, with an arrow drawn (not typed, so the PDF's font needn't have it).
  const by = bottom + p.size.label * 1.4
  const ay = by - p.size.small * 0.35
  const aw = u * 9
  const ah = u * 2.5
  const right = X(e.s1)
  p.line([[left + aw, ay], [left, ay]], 'axis')
  p.line([[left + ah, ay - ah], [left, ay], [left + ah, ay + ah]], 'axis')
  p.text(left + aw + u * 3, by, d.ends[0], { size: p.size.small, ink: 'muted' })
  p.line([[right - aw, ay], [right, ay]], 'axis')
  p.line([[right - ah, ay - ah], [right, ay], [right - ah, ay + ah]], 'axis')
  p.text(right - aw - u * 3, by, d.ends[1], { size: p.size.small, ink: 'muted', anchor: 'end' })
  if (p.scaleBar === false) return size
  const L = barLength(k, u * 60)
  const bw = L * k
  const bx = (left + X(e.s1)) / 2 - bw / 2
  const bh = Math.max(u * 3, p.size.small * 0.45)
  const bt = bottom + p.size.label * 0.6
  for (let i = 0; i < 5; i++) {
    p.shape(
      [
        [bx + (bw * i) / 5, bt],
        [bx + (bw * (i + 1)) / 5, bt],
        [bx + (bw * (i + 1)) / 5, bt + bh],
        [bx + (bw * i) / 5, bt + bh],
      ],
      i % 2 ? 'scale-light' : 'scale-dark',
    )
  }
  p.text(bx, bt + bh + p.size.small * 1.15, '0', { size: p.size.small, anchor: 'middle', ink: 'muted' })
  p.text(bx + bw, bt + bh + p.size.small * 1.15, `${L} m`, { size: p.size.small, anchor: 'middle', ink: 'muted' })
  return size
}

/** A window, door or other opening on a wall's face. */
function opening(p: Painter, kind: string, r: Pt[], k: number) {
  const [x0, y1] = r[0]
  const [x1, y0] = r[2]
  const style: ShapeStyle = kind === 'window' ? 'window' : kind === 'door' ? 'door' : kind === 'garage' ? 'garage' : 'opening'
  p.shape(r, style)
  if (kind === 'window' && x1 - x0 > 1.3 * k) p.line([[(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1]], 'detail')
  if (kind === 'garage') for (let y = y0 + 0.5 * k; y < y1 - 0.1 * k; y += 0.5 * k) p.line([[x0, y], [x1, y]], 'detail')
}

/** Each floor's name and its floor-to-ceiling height, inside the first span the cut makes through it. */
function floorNotes(p: Painter, d: SectionDrawing, X: (s: number) => number, Y: (z: number) => number, k: number) {
  const u = p.unit
  for (const f of d.floors) {
    const span = f.spans.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a))
    const w = (span[1] - span[0]) * k
    const h = Y(f.rl) - Y(f.ceiling)
    const name = f.name
    const ceiling = `${Math.round((f.ceiling - f.rl) * 1000)}`
    if (w < p.measure(name, p.size.small) + p.measure(ceiling, p.size.small) + u * 30 || h < p.size.small * 3) continue
    const x0 = X(span[0]) + Math.max(0.45 * k, u * 6)
    // Under the ceiling, where the ground outside (cut into the slope) never runs through it.
    p.text(x0, Y(f.ceiling) + p.size.small + u * 4, name, { size: p.size.small, ink: 'muted' })
    // The floor to ceiling height, dimensioned by the far wall.
    const dx = X(span[1]) - Math.max(0.6 * k, u * 8)
    const t = u * 3
    p.line([[dx, Y(f.rl)], [dx, Y(f.ceiling)]], 'dim')
    for (const yy of [Y(f.rl), Y(f.ceiling)]) p.line([[dx - t, yy + t], [dx + t, yy - t]], 'dim')
    p.text(dx - u * 4, (Y(f.rl) + Y(f.ceiling)) / 2, ceiling, { size: p.size.small, anchor: 'end', middle: true, ink: 'muted' })
  }
}

/** The house's highest point above the natural ground, dimensioned down to the ground under it. */
function heightMark(p: Painter, h: NonNullable<ElevationDrawing['height']>, X: (s: number) => number, Y: (z: number) => number, minX: number, maxX: number) {
  const u = p.unit
  const hx = X(h.s)
  const yt = Y(h.top)
  const yb = Y(h.ground)
  const t = u * 3.5
  p.line([[hx, yt], [hx, yb]], 'height')
  for (const yy of [yt, yb]) p.line([[hx - t, yy + t], [hx + t, yy - t]], 'height')
  p.line([[hx - u * 9, yb], [hx + u * 9, yb]], 'height')
  const text = `${h.value.toFixed(2)} m above natural ground`
  const tw = p.measure(text, p.size.small, true)
  // Above the top, kept inside the drawing.
  const tx = Math.max(minX + tw / 2, Math.min(hx, maxX - tw / 2))
  p.text(tx, yt - u * 6, text, { size: p.size.small, anchor: 'middle', ink: 'accent', bold: true })
}

/** RLs on the left: an axis with whole metres, and each floor and the top of the roof on it. */
function levelMarks(p: Painter, d: Drawing, X: (s: number) => number, Y: (z: number) => number, left: number, top: number, bottom: number, k: number) {
  const u = p.unit
  const ax = left - u * 6
  p.line(
    [
      [ax, top],
      [ax, bottom],
    ],
    'axis',
  )
  const e = extent(d)
  const gap = p.size.label * 1.25
  const marks = d.levels
  const want = marks.map(m => Y(m.rl))
  const at = spread(want, gap)
  marks.forEach((m, i) => {
    // A dashed line from the axis to where the level is drawn.
    p.line(
      [
        [ax, want[i]],
        [Math.max(X(m.at ?? e.s0), ax + u * 6), want[i]],
      ],
      'level',
    )
    p.line(
      [
        [ax - u * 4, want[i]],
        [ax, want[i]],
      ],
      'axis',
    )
    if (Math.abs(at[i] - want[i]) > 0.5) p.line([[ax - u * 4, want[i]], [ax - u * 7, at[i]]], 'axis')
    p.text(ax - u * 8, at[i], levelText(m), { size: p.size.label, anchor: 'end', middle: true, bold: m.text === 'FFL' })
  })
  // Whole metres (or every 2 or 5 m when they'd crowd), clear of the level labels.
  const step = [0.5, 1, 2, 5, 10].find(s => s * k >= p.size.small * 2.2) ?? 10
  for (let z = Math.ceil(e.z0 / step) * step; z <= e.z1 + 1e-9; z += step) {
    const yy = Y(z)
    p.line(
      [
        [ax - u * 3, yy],
        [ax, yy],
      ],
      'axis',
    )
    if (yy < top + p.size.small || yy > bottom - p.size.small * 0.3 || at.some(a => Math.abs(a - yy) < gap * 0.9)) continue
    p.text(ax - u * 5, yy, step < 1 ? z.toFixed(1) : z.toFixed(0), { size: p.size.small, anchor: 'end', middle: true, ink: 'muted' })
  }
}
