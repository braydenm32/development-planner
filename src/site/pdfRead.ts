import { clipPolygonToRect, pointInPolygon, type Vec2 } from '../lib/geom'
import { analyseLinework, type Chain, type DashedRun, type Linework } from './linework'
import { featureId, withDefaults, type FeatureType, type ServiceKind, type SiteFeature } from './model'
import type { VectorPage, VText } from './pdfVector'

/**
 * Reading site features off a vector drawing such as a detail survey: the words on it,
 * where they sit, and the line work next to them. What it finds is offered as groups
 * ("6 trees in the tree schedule", "4 labels mention a fence") that the user adds with one
 * tap; what it can't place, he traces.
 *
 * Everything here works in page points (y up). Features come out in page points too, and
 * are moved onto the survey with the drawing's line-up when they are added.
 */
export interface FoundGroup {
  id: string
  type: FeatureType
  title: string
  /** A few lines saying what is in the group. */
  detail: string[]
  /** Ready to add, in page points. Empty when the labels were found but their shapes weren't. */
  features: SiteFeature[]
  /** Where the labels sit on the page, to point them out on the plan. */
  marks: Vec2[]
  /** Some labels had no shape next to them that could be read: trace those. */
  traceHint?: string
}

export interface ReadOptions {
  /** Metres on the ground per page point, from the line-up (or the stated scale). */
  metresPerPoint: number
  /** The survey boundary in page points, when lined up: decides what is on the neighbour's land. */
  boundary?: Vec2[]
}

/** A run of words on one baseline. */
export interface TextLine {
  str: string
  /** Start of the baseline, and its middle. */
  at: Vec2
  mid: Vec2
  size: number
  angle: number
  width: number
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1])
const NUM = /^-?\d+(?:\.\d+)?$/

/** Join words that sit on one baseline with no more than a short space between them. */
export function textLines(texts: VText[]): TextLine[] {
  const rad = (t: VText) => (t.angle * Math.PI) / 180
  const items = [...texts].sort((a, b) => a.angle - b.angle || b.y - a.y || a.x - b.x)
  const used = new Uint8Array(items.length)
  const out: TextLine[] = []
  for (let i = 0; i < items.length; i++) {
    if (used[i]) continue
    used[i] = 1
    const t = items[i]
    const d: Vec2 = [Math.cos(rad(t)), Math.sin(rad(t))]
    let str = t.str
    let end: Vec2 = [t.x + d[0] * t.width, t.y + d[1] * t.width]
    for (;;) {
      // the nearest word that starts just after this line ends, on the same baseline
      let best = -1
      let bestGap = Infinity
      for (let j = 0; j < items.length; j++) {
        if (used[j]) continue
        const u = items[j]
        if (Math.abs(u.angle - t.angle) > 2 || Math.abs(u.size - t.size) > t.size * 0.2) continue
        const vx = u.x - end[0]
        const vy = u.y - end[1]
        const along = vx * d[0] + vy * d[1]
        const across = -vx * d[1] + vy * d[0]
        if (Math.abs(across) > t.size * 0.3 || along < -t.size * 0.3 || along > t.size * 0.5) continue
        if (along < bestGap) {
          bestGap = along
          best = j
        }
      }
      if (best < 0) break
      used[best] = 1
      const u = items[best]
      str += (bestGap > t.size * 0.12 && !str.endsWith(' ') ? ' ' : '') + u.str
      end = [u.x + d[0] * u.width, u.y + d[1] * u.width]
    }
    const width = dist([t.x, t.y], end)
    out.push({
      str,
      at: [t.x, t.y],
      mid: [t.x + d[0] * (width / 2) - d[1] * t.size * 0.35, t.y + d[1] * (width / 2) + d[0] * t.size * 0.35],
      size: t.size,
      angle: t.angle,
      width,
    })
  }
  return out
}

// ---------------------------------------------------------------------------

interface Ctx {
  page: VectorPage
  lines: TextLine[]
  /** Short labels on the drawing itself, not notes or title-block paragraphs. */
  labels: TextLine[]
  lw: Linework
  /** Long straight pieces, merged where they continue one another. */
  straights: { a: Vec2; b: Vec2; width: number; dashed: boolean }[]
  mpp: number
  boundary?: Vec2[]
  /** Lines already used by a detector, so a later one doesn't offer them again. */
  taken: Set<TextLine>
  /** Circles a label has already been given. */
  usedCircles: Set<object>
}

const onPage = (p: Vec2, page: VectorPage) => p[0] >= 0 && p[1] >= 0 && p[0] <= page.width && p[1] <= page.height

/** Find what a vector drawing says about the site. */
export function readDrawing(page: VectorPage, opts: ReadOptions): FoundGroup[] {
  const lines = textLines(page.texts)
  const lw = analyseLinework(page.paths)
  const ctx: Ctx = {
    page,
    lines,
    labels: lines.filter(l => l.str.length <= 40 && onPage(l.mid, page)),
    lw,
    straights: straightPieces(lw, page),
    mpp: opts.metresPerPoint,
    boundary: opts.boundary,
    taken: new Set(),
    usedCircles: new Set(),
  }
  const groups: FoundGroup[] = []
  const add = (g: FoundGroup | null | (FoundGroup | null)[]) => {
    for (const x of Array.isArray(g) ? g : [g]) if (x && (x.features.length || x.marks.length)) groups.push(x)
  }
  add(treeSchedule(ctx))
  add(treeLabels(ctx))
  add(easements(ctx))
  add(lotOutsideBoundary(ctx))
  add(fences(ctx))
  add(kerbs(ctx))
  add(services(ctx))
  add(buildings(ctx))
  add(paving(ctx))
  // Drawings run line work past the sheet edge and let the page cut it off: so does this.
  const rect = { minX: 0, minY: 0, maxX: page.width, maxY: page.height }
  for (const g of groups) {
    // Except the lot itself: its outline is the title's, and runs on past the sheet to the street.
    if (g.id === 'lot-outside') continue
    g.features = g.features.flatMap(f => {
      if (f.geom.kind === 'point') return onPage(f.geom.at, page) ? [f] : []
      if (f.geom.kind === 'area') {
        const pts = clipPolygonToRect(f.geom.pts, rect)
        return pts.length >= 3 ? [{ ...f, geom: { kind: 'area' as const, pts } }] : []
      }
      const pts = clipLine(f.geom.pts, rect)
      return pts ? [{ ...f, geom: { kind: 'line' as const, pts } }] : []
    })
  }
  return groups
}

/** The longest run of a polyline inside a rectangle. */
function clipLine(pts: Vec2[], r: { minX: number; minY: number; maxX: number; maxY: number }): Vec2[] | null {
  const runs: Vec2[][] = []
  let cur: Vec2[] = []
  for (let i = 1; i < pts.length; i++) {
    const seg = clipSegment(pts[i - 1], pts[i], r)
    if (!seg) {
      if (cur.length > 1) runs.push(cur)
      cur = []
      continue
    }
    if (!cur.length || dist(cur[cur.length - 1], seg[0]) > 1e-6) {
      if (cur.length > 1) runs.push(cur)
      cur = [seg[0]]
    }
    cur.push(seg[1])
  }
  if (cur.length > 1) runs.push(cur)
  const len = (q: Vec2[]) => q.slice(1).reduce((s, p, i) => s + dist(q[i], p), 0)
  const best = runs.sort((a, b) => len(b) - len(a))[0]
  return best && len(best) > 1e-6 ? best : null
}

/** Liang–Barsky: the part of a segment inside a rectangle. */
function clipSegment(a: Vec2, b: Vec2, r: { minX: number; minY: number; maxX: number; maxY: number }): [Vec2, Vec2] | null {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  for (const [p, q] of [
    [-dx, a[0] - r.minX],
    [dx, r.maxX - a[0]],
    [-dy, a[1] - r.minY],
    [dy, r.maxY - a[1]],
  ]) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return null
  }
  return [
    [a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1],
  ]
}

/** Straight strokes longer than a couple of millimetres on the page, as segments. */
function straightPieces(lw: Linework, page: VectorPage): Ctx['straights'] {
  const out: Ctx['straights'] = []
  for (const s of lw.segments) {
    if (dist(s.a, s.b) < 6) continue
    if (!onPage(s.a, page) && !onPage(s.b, page)) continue
    out.push({ a: s.a, b: s.b, width: lw.chains[s.chain].width, dashed: false })
  }
  for (const d of lw.dashed) out.push({ a: d.a, b: d.b, width: d.width, dashed: true })
  return out
}

function segDist(p: Vec2, a: Vec2, b: Vec2): { d: number; t: number } {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
  return { d: dist(p, [a[0] + dx * t, a[1] + dy * t]), t }
}

const angleBetween = (deg: number, a: Vec2, b: Vec2) => {
  const s = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
  const d = Math.abs((((s - deg) % 180) + 180) % 180)
  return Math.min(d, 180 - d)
}

/**
 * The line a label is written along: the nearest long straight stroke running the same
 * way as the words, carried on through strokes that continue it.
 */
function lineBeside(ctx: Ctx, l: TextLine, reach: number, dashed?: boolean): Vec2[] | null {
  let best = null as { a: Vec2; b: Vec2; d: number } | null
  for (const s of ctx.straights) {
    if (dashed !== undefined && s.dashed !== dashed) continue
    if (angleBetween(l.angle, s.a, s.b) > 8) continue
    const { d, t } = segDist(l.mid, s.a, s.b)
    if (t <= 0 || t >= 1 || d > reach) continue
    if (!best || d < best.d) best = { a: s.a, b: s.b, d }
  }
  if (!best) return null
  return extendStraight(ctx, best.a, best.b)
}

/** Carry a straight stroke on through strokes that continue it in line (across short breaks, where words cut it), to its full length. */
function extendStraight(ctx: Ctx, a0: Vec2, b0: Vec2, bridge = 12): Vec2[] {
  let a = a0
  let b = b0
  const dir: Vec2 = [(b[0] - a[0]) / dist(a, b), (b[1] - a[1]) / dist(a, b)]
  const off = (p: Vec2) => Math.abs((p[0] - a0[0]) * dir[1] - (p[1] - a0[1]) * dir[0])
  for (let round = 0; round < 50; round++) {
    let grown = false
    for (const s of ctx.straights) {
      if (off(s.a) > 0.6 || off(s.b) > 0.6) continue
      for (const [p, q] of [
        [s.a, s.b],
        [s.b, s.a],
      ] as [Vec2, Vec2][]) {
        if (dist(p, b) < bridge && dist(q, a) > dist(b, a) + 0.5) {
          b = q
          grown = true
        } else if (dist(p, a) < bridge && dist(q, b) > dist(a, b) + 0.5) {
          a = q
          grown = true
        }
      }
    }
    if (!grown) break
  }
  return [a, b]
}

/**
 * The middle of the nearest small symbol to a point: a closed outline, or a cluster of short
 * strokes drawn close together (a tree's cloud of arcs, a pit's box).
 */
function symbolNear(ctx: Ctx, p: Vec2, reach: number, maxSize: number): Vec2 | null {
  type Box = { minX: number; minY: number; maxX: number; maxY: number }
  const boxes: Box[] = []
  for (const ch of ctx.lw.chains) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const q of ch.pts) {
      minX = Math.min(minX, q[0])
      minY = Math.min(minY, q[1])
      maxX = Math.max(maxX, q[0])
      maxY = Math.max(maxY, q[1])
    }
    if (Math.max(maxX - minX, maxY - minY) > maxSize) continue
    // Symbols are closed outlines or strokes drawn from short pieces (arcs); long straight strokes are line work.
    if (!ch.closed) {
      if (ch.pts.length < 3) continue
      let longest = 0
      for (let k = 1; k < ch.pts.length; k++) longest = Math.max(longest, dist(ch.pts[k - 1], ch.pts[k]))
      if (longest > 4) continue
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    if (Math.hypot(cx - p[0], cy - p[1]) > reach + maxSize) continue
    boxes.push({ minX, minY, maxX, maxY })
  }
  // Join boxes that touch into clusters.
  const parent = boxes.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const gap = 1.5
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.minX - gap <= b.maxX && b.minX - gap <= a.maxX && a.minY - gap <= b.maxY && b.minY - gap <= a.maxY) parent[find(i)] = find(j)
    }
  const clusters = new Map<number, Box>()
  boxes.forEach((b, i) => {
    const r = find(i)
    const c = clusters.get(r)
    clusters.set(r, c ? { minX: Math.min(c.minX, b.minX), minY: Math.min(c.minY, b.minY), maxX: Math.max(c.maxX, b.maxX), maxY: Math.max(c.maxY, b.maxY) } : { ...b })
  })
  let best = null as { c: Vec2; d: number } | null
  for (const b of clusters.values()) {
    const size = Math.max(b.maxX - b.minX, b.maxY - b.minY)
    if (size < 2.5 || size > maxSize) continue
    const c: Vec2 = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]
    const d = dist(p, c)
    if (d < reach && (!best || d < best.d)) best = { c, d }
  }
  return best ? best.c : null
}


/** How far a point is from the box a label's letters fill. */
function boxDist(p: Vec2, l: TextLine): number {
  const t = (l.angle * Math.PI) / 180
  const dx = p[0] - l.at[0]
  const dy = p[1] - l.at[1]
  const u = dx * Math.cos(t) + dy * Math.sin(t)
  const v = -dx * Math.sin(t) + dy * Math.cos(t)
  return Math.hypot(Math.max(0, -u, u - l.width), Math.max(0, -v, v - l.size * 0.75))
}

/** The nearest circle to a label's letters, within reach, leaving circles another label has claimed. */
function circleByLabel(ctx: Ctx, l: TextLine, reach: number, maxR: number) {
  let best = null as { c: Vec2; r: number; d: number; ref: object } | null
  for (const c of ctx.lw.circles) {
    if (c.r > maxR || ctx.usedCircles.has(c)) continue
    const d = boxDist(c.c, l) - c.r
    if (d < reach && (!best || d < best.d)) best = { c: c.c, r: c.r, d, ref: c }
  }
  return best
}

const claim = (ctx: Ctx, found: { ref: object } | null) => {
  if (found) ctx.usedCircles.add(found.ref)
}

const points = (m: number, ctx: Ctx) => m / ctx.mpp

const isOutside = (ctx: Ctx, p: Vec2) => (ctx.boundary && ctx.boundary.length >= 3 ? !pointInPolygon(p[0], p[1], ctx.boundary) : false)

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

// ---- Trees -----------------------------------------------------------------

/** A tree schedule: a heading, a header row naming the columns, then rows of numbers. */
function treeSchedule(ctx: Ctx): FoundGroup | null {
  const items = ctx.page.texts
  const header = ctx.lines.find(l => /\b(no|tree)\.?\b/i.test(l.str) && /\b(he|ht|height|h)\.?\b/i.test(l.str) && /(sp|spread|canopy)/i.test(l.str))
  if (!header) return null
  // Columns from the header's words: where each one starts.
  const words = items.filter(t => Math.abs(t.y - header.at[1]) < header.size * 0.3 && t.x >= header.at[0] - 1 && t.x <= header.at[0] + header.width + 1)
  type Col = 'no' | 'height' | 'spread' | 'trunk'
  const cols: { col: Col; x: number }[] = []
  const classify = (w: string): Col | null =>
    /^(no|tree|#|id)/i.test(w) ? 'no' : /^(he|ht|height|h\b)/i.test(w) ? 'height' : /^(sp|spread|canopy|c\b)/i.test(w) ? 'spread' : /^(tr|trunk|dbh|dia|girth|d\b)/i.test(w) ? 'trunk' : null
  for (const w of words) {
    // A header that is one item: split it into words and estimate where each starts.
    const parts = w.str.split(/\s+/)
    let x = w.x
    const per = w.width / Math.max(w.str.length, 1)
    for (const part of parts) {
      const col = classify(part)
      if (col && !cols.some(c => c.col === col)) cols.push({ col, x })
      x += (part.length + 1) * per
    }
  }
  if (!cols.some(c => c.col === 'no')) return null
  // Rows: numbers below the header, grouped by baseline, each number given the column it starts nearest.
  const below = items.filter(t => NUM.test(t.str) && t.y < header.at[1] - header.size * 0.5 && t.y > header.at[1] - header.size * 40 && t.x >= header.at[0] - header.size && t.x <= header.at[0] + header.width + header.size * 2)
  const rows = new Map<number, VText[]>()
  for (const t of below) {
    const key = [...rows.keys()].find(k => Math.abs(k - t.y) < header.size * 0.4)
    if (key === undefined) rows.set(t.y, [t])
    else rows.get(key)!.push(t)
  }
  const trees: { ref: string; height?: number; spread?: number; trunk?: number; y: number }[] = []
  const sortedRows = [...rows.entries()].sort((a, b) => b[0] - a[0])
  let lastY = header.at[1]
  for (const [y, cells] of sortedRows) {
    if (lastY - y > header.size * 2.2) break // the table has ended
    lastY = y
    const row: Partial<Record<Col, number>> & { ref?: string } = {}
    for (const c of cells) {
      const col = cols.reduce((a, b) => (Math.abs(b.x - c.x) < Math.abs(a.x - c.x) ? b : a))
      if (col.col === 'no') row.ref = c.str
      else row[col.col] = Number(c.str)
    }
    if (row.ref) trees.push({ ref: row.ref, height: row.height, spread: row.spread, trunk: row.trunk, y })
  }
  if (!trees.length) return null
  const tableBox = { minY: lastY - header.size, maxY: header.at[1] + header.size * 3, minX: header.at[0] - header.size * 2, maxX: header.at[0] + header.width + header.size * 3 }
  const inTable = (p: Vec2) => p[0] >= tableBox.minX && p[0] <= tableBox.maxX && p[1] >= tableBox.minY && p[1] <= tableBox.maxY
  for (const l of ctx.lines) if (inTable(l.at) || l === header) ctx.taken.add(l)
  const heading = ctx.lines.find(l => /tree\s*schedule/i.test(l.str))
  if (heading) ctx.taken.add(heading)

  const features: SiteFeature[] = []
  const marks: Vec2[] = []
  const missing: string[] = []
  for (const t of trees) {
    // The tree's number on the drawing, beside its trunk circle.
    const tags = ctx.labels.filter(l => l.str === t.ref && !inTable(l.at) && !ctx.taken.has(l))
    let best = null as { at: Vec2; tag: TextLine; d: number } | null
    for (const tag of tags) {
      const c = circleByLabel(ctx, tag, tag.size * 2, tag.size * 2)
      const d = c ? c.d : Infinity
      if (c && (!best || d < best.d)) best = { at: c.c, tag, d }
    }
    if (best) claim(ctx, circleByLabel(ctx, best.tag, best.tag.size * 2, best.tag.size * 2))
    if (!best && tags.length === 1) best = { at: tags[0].mid, tag: tags[0], d: 0 }
    if (!best) {
      missing.push(t.ref)
      continue
    }
    ctx.taken.add(best.tag)
    marks.push(best.at)
    features.push(
      withDefaults({
        id: featureId(),
        type: 'tree',
        source: 'pdf',
        geom: { kind: 'point', at: best.at },
        label: `T${t.ref}`,
        trunk: t.trunk !== undefined ? (t.trunk > 5 ? t.trunk / 1000 : t.trunk) : undefined,
        canopy: t.spread,
        height: t.height,
        neighbour: isOutside(ctx, best.at) || undefined,
      }),
    )
  }
  const fmt = (v: number | undefined, d = 1) => (v === undefined ? '?' : Number(v.toFixed(d)).toString())
  return {
    id: 'tree-schedule',
    type: 'tree',
    title: `${plural(trees.length, 'tree')} in the tree schedule`,
    detail: features.map(f => `${f.label}: trunk Ø ${fmt(f.trunk, 2)} m, spread ${fmt(f.canopy)} m, ${fmt(f.height)} m high`),
    features,
    marks,
    traceHint: missing.length ? `Tree${missing.length > 1 ? 's' : ''} ${missing.join(', ')} couldn't be found on the drawing; trace ${missing.length > 1 ? 'them' : 'it'}.` : undefined,
  }
}

/** Other trees the drawing names ("Planted tree", "Tree to be removed"). */
function treeLabels(ctx: Ctx): FoundGroup | null {
  const hits = ctx.labels.filter(l => !ctx.taken.has(l) && /\btrees?\b|\bshrub\b|\bpalm\b/i.test(l.str))
  if (!hits.length) return null
  // "Planted" on one line and "tree" on the next are one label.
  const groups: TextLine[][] = []
  for (const h of hits) {
    const partner = ctx.labels.find(o => o !== h && !ctx.taken.has(o) && Math.abs(o.at[0] - h.at[0]) < h.size && o.at[1] > h.at[1] && o.at[1] - h.at[1] < h.size * 1.6)
    groups.push(partner ? [partner, h] : [h])
    ctx.taken.add(h)
    if (partner) ctx.taken.add(partner)
  }
  const features: SiteFeature[] = []
  const marks: Vec2[] = []
  for (const g of groups) {
    const last = g[g.length - 1]
    const label = g.map(l => l.str).join(' ')
    const at = symbolNear(ctx, last.mid, last.size * 5, points(8, ctx)) ?? last.mid
    marks.push(at)
    features.push(
      withDefaults({
        id: featureId(),
        type: 'tree',
        source: 'pdf',
        geom: { kind: 'point', at },
        label: sentence(label),
        canopy: 3,
        trunk: 0.15,
        height: 4,
        neighbour: isOutside(ctx, at) || undefined,
      }),
    )
  }
  const outside = features.filter(f => f.neighbour).length
  return {
    id: 'tree-labels',
    type: 'tree',
    title: `${plural(groups.length, 'label')} ${groups.length === 1 ? 'mentions' : 'mention'} a tree`,
    detail: [
      ...[...new Set(features.map(f => f.label!))].map(s => `“${s}”`),
      ...(outside ? [`${outside} outside the block`] : []),
      'Their sizes are guesses: set them once added.',
    ],
    features,
    marks,
  }
}

// ---- The lot on title, past the survey boundary ----------------------------------

/**
 * A battle-axe lot's access handle: part of the lot on the title that the survey's site
 * boundary leaves out. The drawing's lot outline is the heavy line round the stated lot area
 * ("512.3 m²"); whatever of it lies outside the survey boundary is offered as its own area,
 * so it shows on the plan without changing the site area.
 */
function lotOutsideBoundary(ctx: Ctx): FoundGroup | null {
  const B = ctx.boundary
  if (!B || B.length < 3) return null
  const areaLabel = ctx.lines.find(l => /^\d+(?:\.\d+)?\s*m(?:²|2)$/.test(l.str) && onPage(l.mid, ctx.page))
  const probe: Vec2 = areaLabel ? areaLabel.mid : centroid(B)
  const widest = Math.max(...ctx.lw.chains.map(c => c.width))
  let lot = null as Vec2[] | null
  let lotArea = Infinity
  for (const ch of ctx.lw.chains) {
    if (ch.pts.length < 4 || ch.length < 100 || ch.width < widest * 0.6) continue
    if (!pointInPolygon(probe[0], probe[1], ch.pts)) continue
    // Most of the survey boundary should sit on or inside it.
    const inside = B.filter(p => pointInPolygon(p[0], p[1], ch.pts) || ch.pts.some((q, i) => segDist(p, q, ch.pts[(i + 1) % ch.pts.length]).d < 1.5)).length
    if (inside < B.length * 0.75) continue
    const a = Math.abs(ringArea(ch.pts))
    if (a < lotArea) {
      lot = ch.pts
      lotArea = a
    }
  }
  if (!lot) return null
  const parts = outsideParts(lot, B, 1).filter(p => p.length >= 3 && Math.abs(ringArea(p)) * ctx.mpp * ctx.mpp >= 5)
  if (!parts.length) return null
  const features = parts.map(pts => {
    const narrow = narrowWidth(pts)
    const handle = narrow * ctx.mpp < 8 && Math.abs(ringArea(pts)) / Math.max(narrow * narrow, 1e-9) > 3
    return withDefaults({
      id: featureId(),
      type: 'other' as const,
      source: 'pdf' as const,
      geom: { kind: 'area' as const, pts },
      label: handle ? 'Access handle' : 'Lot outside the site boundary',
      purpose: 'Part of the lot on the title, outside the site area',
    })
  })
  const m2 = parts.reduce((s, p) => s + Math.abs(ringArea(p)), 0) * ctx.mpp * ctx.mpp
  return {
    id: 'lot-outside',
    type: 'other',
    title: features.some(f => f.label === 'Access handle') ? 'An access handle outside the site boundary' : 'Part of the lot outside the site boundary',
    detail: [`${m2.toFixed(0)} m² of the lot on the drawing lies past the survey boundary. The site area stays as surveyed.`],
    features,
    marks: parts.map(centroid),
  }
}

function centroid(pts: Vec2[]): Vec2 {
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
}

/**
 * The pieces of polygon P that lie outside polygon B, for shapes that mostly share their
 * edges (a lot and the part of it a survey covers). Each run of P's outline outside B is
 * closed back along B's outline, the shorter way round.
 */
export function outsideParts(P: Vec2[], B: Vec2[], tol: number): Vec2[][] {
  const onB = (p: Vec2) => B.some((q, i) => segDist(p, q, B[(i + 1) % B.length]).d < tol)
  const outside = (p: Vec2) => !onB(p) && !pointInPolygon(p[0], p[1], B)
  // P's outline with every crossing of B's outline added as a vertex.
  const ring: { p: Vec2; out: boolean }[] = []
  for (let i = 0; i < P.length; i++) {
    const a = P[i]
    const b = P[(i + 1) % P.length]
    const cuts: { t: number; p: Vec2 }[] = []
    for (let j = 0; j < B.length; j++) {
      const x = crossing(a, b, B[j], B[(j + 1) % B.length])
      if (x) cuts.push(x)
    }
    cuts.sort((u, v) => u.t - v.t)
    ring.push({ p: a, out: outside(a) })
    for (const c of cuts) ring.push({ p: c.p, out: false })
  }
  // Edges between consecutive points are outside when their middle is.
  const n = ring.length
  const edgeOut = ring.map((r, i) => {
    const q = ring[(i + 1) % n].p
    return outside([(r.p[0] + q[0]) / 2, (r.p[1] + q[1]) / 2])
  })
  if (edgeOut.every(Boolean) || !edgeOut.some(Boolean)) return []
  // Start just after an inside edge so runs don't wrap.
  const start = edgeOut.findIndex((o, i) => !o && edgeOut[(i + 1) % n])
  const parts: Vec2[][] = []
  let run: Vec2[] = []
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n
    if (edgeOut[i]) {
      if (!run.length) run.push(ring[i].p)
      run.push(ring[(i + 1) % n].p)
    } else if (run.length) {
      parts.push(closeAlong(run, B))
      run = []
    }
  }
  if (run.length) parts.push(closeAlong(run, B))
  return parts.filter(p => p.length >= 3)
}

/** Close a run that leaves B and comes back, by B's outline from where it returns to where it left. */
function closeAlong(run: Vec2[], B: Vec2[]): Vec2[] {
  const at = (p: Vec2) => {
    let best = { i: 0, t: 0, d: Infinity }
    B.forEach((q, i) => {
      const r = segDist(p, q, B[(i + 1) % B.length])
      if (r.d < best.d) best = { i, t: r.t, d: r.d }
    })
    return best
  }
  const from = at(run[run.length - 1])
  const to = at(run[0])
  const n = B.length
  const walk = (dir: 1 | -1): Vec2[] => {
    const out: Vec2[] = []
    if (from.i === to.i && (dir === 1 ? to.t >= from.t : to.t <= from.t)) return out
    let i = dir === 1 ? (from.i + 1) % n : from.i
    for (let guard = 0; guard <= n; guard++) {
      out.push(B[i])
      const edge = dir === 1 ? i : (i - 1 + n) % n
      if (edge === to.i) break
      i = (i + dir + n) % n
    }
    return out
  }
  const len = (pts: Vec2[]) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0)
  const a = walk(1)
  const b = walk(-1)
  const via = len([run[run.length - 1], ...a, run[0]]) <= len([run[run.length - 1], ...b, run[0]]) ? a : b
  return [...run, ...via]
}

function crossing(a: Vec2, b: Vec2, c: Vec2, d: Vec2): { t: number; p: Vec2 } | null {
  const r: Vec2 = [b[0] - a[0], b[1] - a[1]]
  const q: Vec2 = [d[0] - c[0], d[1] - c[1]]
  const den = r[0] * q[1] - r[1] * q[0]
  if (Math.abs(den) < 1e-12) return null
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
  if (t <= 1e-9 || t >= 1 - 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null
  return { t, p: [a[0] + r[0] * t, a[1] + r[1] * t] }
}

// ---- Easements ---------------------------------------------------------------

interface LegendEntry {
  letter: string
  text: string
  width?: number
  line: TextLine
}

/** "(C) EASEMENT FOR DRAINAGE OF WATER 1.5 WIDE." and any lines that carry it on. */
function easementLegend(ctx: Ctx): LegendEntry[] {
  const out: LegendEntry[] = []
  const start = /^\(?([A-Z]{1,2}\d?)\)\s+(.*)$/
  for (const l of ctx.lines) {
    const m = start.exec(l.str)
    if (!m || !/easement|right of|carriageway|drainage|services|restriction|way\b|support|access/i.test(l.str)) continue
    let text = m[2]
    ctx.taken.add(l)
    // Continuation lines: just below, indented, not starting with a letter in brackets.
    let prev = l
    for (;;) {
      const next = ctx.lines.find(
        o => !ctx.taken.has(o) && Math.abs(o.angle - l.angle) < 2 && o.at[1] < prev.at[1] && prev.at[1] - o.at[1] < l.size * 1.5 && o.at[0] > l.at[0] - 1 && o.at[0] < l.at[0] + l.size * 4 && !start.test(o.str),
      )
      if (!next) break
      text += ` ${next.str}`
      ctx.taken.add(next)
      prev = next
    }
    const w = /(\d+(?:\.\d+)?)\s*(?:m\b|metres?\b)?\s*wide/i.exec(text)
    out.push({ letter: m[1], text: text.replace(/\s+/g, ' ').replace(/\.$/, ''), width: w ? Number(w[1]) : undefined, line: l })
  }
  for (const h of ctx.lines) if (/^easements?:?$/i.test(h.str)) ctx.taken.add(h)
  return out
}

function easements(ctx: Ctx): FoundGroup | null {
  const legend = easementLegend(ctx)
  // Letters in brackets on the drawing, alone or several on one label: "(A) (C)".
  const markers: { letter: string; at: Vec2; line: TextLine }[] = []
  for (const l of ctx.labels) {
    if (ctx.taken.has(l) || !/^(\([A-Z]{1,2}\d?\)\s*)+$/.test(l.str)) continue
    const letters = [...l.str.matchAll(/\(([A-Z]{1,2}\d?)\)/g)].map(m => m[1])
    if (!legend.length && !letters.length) continue
    const per = l.width / Math.max(letters.length, 1)
    const d: Vec2 = [Math.cos((l.angle * Math.PI) / 180), Math.sin((l.angle * Math.PI) / 180)]
    letters.forEach((letter, i) => {
      const s = per * (i + 0.5)
      markers.push({ letter, at: [l.at[0] + d[0] * s - d[1] * l.size * 0.35, l.at[1] + d[1] * s + d[0] * l.size * 0.35], line: l })
    })
    ctx.taken.add(l)
  }
  if (!legend.length && !markers.length) return null

  const features: SiteFeature[] = []
  const placed = new Set<string>()
  const letters = legend.length ? legend.map(e => e.letter) : [...new Set(markers.map(m => m.letter))]
  for (const letter of letters) {
    const entry = legend.find(e => e.letter === letter)
    const purpose = entry ? sentence(entry.text) : undefined
    for (const m of markers.filter(x => x.letter === letter)) {
      const strip = easementStrip(ctx, m.at, entry?.width)
      if (!strip) continue
      // The same strip read from a second marker: keep one.
      if (features.some(f => f.label === `(${letter})` && f.geom.kind === 'area' && pointInPolygon(m.at[0], m.at[1], f.geom.pts))) continue
      placed.add(letter)
      features.push({ id: featureId(), type: 'easement', source: 'pdf', geom: { kind: 'area', pts: strip }, label: `(${letter})`, purpose, width: entry?.width })
    }
  }
  const unplaced = letters.filter(l => !placed.has(l))
  return {
    id: 'easements',
    type: 'easement',
    title: legend.length ? `${plural(legend.length, 'easement')} in the legend` : `${plural(markers.length, 'easement letter')} on the drawing`,
    detail: legend.length
      ? legend.map(e => `(${e.letter}) ${sentence(e.text)}${placed.has(e.letter) ? '' : ' (not placed)'}`)
      : [`${[...new Set(markers.map(m => `(${m.letter})`))].join(' ')} with no legend`],
    features,
    marks: markers.map(m => m.at),
    traceHint: unplaced.length ? `${unplaced.map(l => `(${l})`).join(', ')} ${unplaced.length > 1 ? 'have' : 'has'} no clear edges on the drawing: trace ${unplaced.length > 1 ? 'them' : 'it'}.` : undefined,
  }
}

/**
 * The strip an easement letter sits in. A closed outline round the letter about the stated
 * width across wins; otherwise the nearest dashed edge, and either a parallel edge on the
 * letter's other side or the stated width towards the letter.
 */
function easementStrip(ctx: Ctx, at: Vec2, width?: number): Vec2[] | null {
  const w = width !== undefined ? points(width, ctx) : undefined
  // 1. A closed outline round the letter.
  let bestRing = null as { pts: Vec2[]; area: number } | null
  for (const ch of ctx.lw.chains) {
    if (!ch.closed || ch.pts.length < 4 || ch.pts.length > 12) continue
    if (!pointInPolygon(at[0], at[1], ch.pts)) continue
    const across = narrowWidth(ch.pts)
    if (w !== undefined ? Math.abs(across - w) > w * 0.4 : across > points(6, ctx)) continue
    const area = Math.abs(ringArea(ch.pts))
    if (!bestRing || area < bestRing.area) bestRing = { pts: ch.pts, area }
  }
  if (bestRing) return bestRing.pts
  // 2. The nearest dashed edge running past the letter.
  const reach = w !== undefined ? w * 1.5 : points(5, ctx)
  let edge = null as { a: Vec2; b: Vec2; d: number } | null
  for (const r of ctx.lw.dashed) {
    const { d, t } = segDist(at, r.a, r.b)
    if (t <= 0 || t >= 1 || d > reach) continue
    if (!edge || d < edge.d) edge = { a: r.a, b: r.b, d }
  }
  if (!edge) return null
  const [a, b] = collinearDashes(ctx.lw.dashed, edge.a, edge.b, ctx.page)
  const L = dist(a, b)
  const dir: Vec2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
  let n: Vec2 = [-dir[1], dir[0]]
  const side = (at[0] - a[0]) * n[0] + (at[1] - a[1]) * n[1]
  if (side < 0) n = [-n[0], -n[1]]
  // A parallel edge (dashed or solid) beyond the letter, about the stated width away.
  let across: number | null = null
  for (const s of ctx.straights) {
    if (angleBetween((Math.atan2(dir[1], dir[0]) * 180) / Math.PI, s.a, s.b) > 3) continue
    const mid: Vec2 = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]
    const off = (mid[0] - a[0]) * n[0] + (mid[1] - a[1]) * n[1]
    if (off <= Math.abs(side) + 0.5) continue
    const { t } = segDist(at, s.a, s.b)
    if (t <= 0 || t >= 1) continue
    if (w !== undefined && Math.abs(off - w) > w * 0.35) continue
    if (w === undefined && off > reach * 2) continue
    if (across === null || off < across) across = off
  }
  const depth = across ?? w
  if (depth === undefined) return null
  const strip: Vec2[] = [a, b, [b[0] + n[0] * depth, b[1] + n[1] * depth], [a[0] + n[0] * depth, a[1] + n[1] * depth]]
  const kept = clipPolygonToRect(strip, { minX: 0, minY: 0, maxX: ctx.page.width, maxY: ctx.page.height })
  return kept.length >= 3 ? kept : null
}

/** A dashed run carried on across short breaks (where a label interrupts it), within the page. */
function collinearDashes(runs: DashedRun[], a0: Vec2, b0: Vec2, page: VectorPage): [Vec2, Vec2] {
  const L = dist(a0, b0)
  const dir: Vec2 = [(b0[0] - a0[0]) / L, (b0[1] - a0[1]) / L]
  const along = (p: Vec2) => (p[0] - a0[0]) * dir[0] + (p[1] - a0[1]) * dir[1]
  const off = (p: Vec2) => Math.abs((p[0] - a0[0]) * dir[1] - (p[1] - a0[1]) * dir[0])
  let s0 = 0
  let s1 = L
  const same = runs.filter(r => off(r.a) < 0.8 && off(r.b) < 0.8).map(r => [Math.min(along(r.a), along(r.b)), Math.max(along(r.a), along(r.b))] as [number, number])
  same.sort((x, y) => x[0] - y[0])
  for (let round = 0; round < 3; round++) {
    for (const [r0, r1] of same) {
      const gap = 40
      if (r1 > s1 && r0 < s1 + gap) s1 = r1
      if (r0 < s0 && r1 > s0 - gap) s0 = r0
    }
  }
  // Keep to the page: drawings run line work past the sheet edge and let it be cut off.
  const clampS = (s: number) => {
    const p: Vec2 = [a0[0] + dir[0] * s, a0[1] + dir[1] * s]
    return onPage(p, page)
  }
  while (s0 < 0 && !clampS(s0)) s0 = Math.min(0, s0 + 2)
  while (s1 > L && !clampS(s1)) s1 = Math.max(L, s1 - 2)
  return [
    [a0[0] + dir[0] * s0, a0[1] + dir[1] * s0],
    [a0[0] + dir[0] * s1, a0[1] + dir[1] * s1],
  ]
}

function ringArea(pts: Vec2[]): number {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
  return a / 2
}

/** How wide a shape is across its narrowest direction (over its edges' directions). */
function narrowWidth(pts: Vec2[]): number {
  let best = Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const L = dist(a, b)
    if (L < 1e-6) continue
    let lo = Infinity
    let hi = -Infinity
    for (const p of pts) {
      const o = ((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / L
      lo = Math.min(lo, o)
      hi = Math.max(hi, o)
    }
    best = Math.min(best, hi - lo)
  }
  return best
}

// ---- Lines named by a label: fences, kerbs ------------------------------------

function labelledLines(ctx: Ctx, test: RegExp, type: FeatureType, extra: Partial<SiteFeature> = {}, exclude?: RegExp) {
  const hits = ctx.labels.filter(l => !ctx.taken.has(l) && test.test(l.str) && !(exclude && exclude.test(l.str)))
  const features: SiteFeature[] = []
  const marks: Vec2[] = []
  let unplaced = 0
  for (const l of hits) {
    ctx.taken.add(l)
    marks.push(l.mid)
    const line = lineBeside(ctx, l, l.size * 2.5)
    if (!line) {
      unplaced++
      continue
    }
    // Labels along one line give one feature, as long as both reach.
    const same = features.find(f => f.geom.kind === 'line' && collinear(f.geom.pts, line))
    if (same && same.geom.kind === 'line') {
      same.geom = { kind: 'line', pts: span([...same.geom.pts, ...line]) }
      if (same.label !== sentence(l.str)) same.label = `${same.label}, ${sentence(l.str)}`
      continue
    }
    features.push(withDefaults({ id: featureId(), type, source: 'pdf', geom: { kind: 'line', pts: line }, label: sentence(l.str), ...extra }))
  }
  return { hits, features, marks, unplaced }
}

/** Two straight lines on one line (within a point). */
function collinear(p: Vec2[], q: Vec2[]): boolean {
  const [a, b] = [p[0], p[p.length - 1]]
  const L = dist(a, b)
  if (L < 1e-6) return false
  const off = (x: Vec2) => Math.abs((x[0] - a[0]) * (b[1] - a[1]) - (x[1] - a[1]) * (b[0] - a[0])) / L
  return off(q[0]) < 0.8 && off(q[q.length - 1]) < 0.8
}

/** The two points furthest apart along the line through some collinear points. */
function span(pts: Vec2[]): Vec2[] {
  const a = pts[0]
  const b = pts[pts.length - 1]
  const L = dist(a, b) || 1
  const d: Vec2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
  const s = (p: Vec2) => (p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]
  let lo = pts[0]
  let hi = pts[0]
  for (const p of pts) {
    if (s(p) < s(lo)) lo = p
    if (s(p) > s(hi)) hi = p
  }
  return [lo, hi]
}

function fences(ctx: Ctx): FoundGroup | null {
  const r = labelledLines(ctx, /\b(fence|fencing|colorbond|colourbond|paling|chain ?wire|pool fence|post (and|&) wire|timber fence|brick fence)\b/i, 'fence')
  if (!r.hits.length) return null
  const names = [...new Set(r.hits.map(h => sentence(h.str)))]
  return {
    id: 'fences',
    type: 'fence',
    title: `${plural(r.hits.length, 'label')} ${r.hits.length === 1 ? 'mentions' : 'mention'} a fence`,
    detail: [names.map(n => `“${n}”`).join(', '), `${plural(r.features.length, 'fence line')} found beside them`],
    features: r.features,
    marks: r.marks,
    traceHint: r.unplaced ? `${plural(r.unplaced, 'label')} had no line beside ${r.unplaced > 1 ? 'them' : 'it'}: trace those fences.` : undefined,
  }
}

function kerbs(ctx: Ctx): FoundGroup | null {
  const r = labelledLines(ctx, /\b(kerb|k\s*&\s*g|edge of (bitumen|seal|road)|footpath|back of kerb)\b/i, 'kerb', { edge: 'kerb' })
  const tk = ctx.labels.filter(l => !ctx.taken.has(l) && /^(TK|TOK|BK)\s*:?\s*\d/i.test(l.str))
  for (const l of tk) ctx.taken.add(l)
  if (!r.hits.length && !tk.length) return null
  return {
    id: 'kerbs',
    type: 'kerb',
    title: r.hits.length ? `${plural(r.hits.length, 'label')} ${r.hits.length === 1 ? 'mentions' : 'mention'} the kerb` : `${plural(tk.length, 'top of kerb level')}`,
    detail: [...(tk.length ? [`${plural(tk.length, 'top of kerb level')}`] : []), `${plural(r.features.length, 'kerb line')} found`],
    features: r.features,
    marks: [...r.marks, ...tk.map(l => l.mid)],
    traceHint: !r.features.length ? 'Trace the kerb along the top of kerb levels.' : undefined,
  }
}

// ---- Services ------------------------------------------------------------------

const SERVICE_WORDS: { kind: ServiceKind; test: RegExp; name: string }[] = [
  { kind: 'sewer', test: /\b(SMH|S\.?M\.?H|sewer|SMS|IO|IP|inspection|sewer man ?hole|S\.?M\.?S)\b/i, name: 'sewer' },
  { kind: 'stormwater', test: /\b(RCP|stormwater|storm water|SWP|inv\.? pit|pit|grate|GP|kerb inlet|KIP|headwall|drain|PVC|uPVC)\b/i, name: 'stormwater' },
  { kind: 'water', test: /\b(hyd|hydrant|water|WM|water meter|SV|stop valve|meter)\b/i, name: 'water' },
  { kind: 'gas', test: /\b(gas|GM|gas meter)\b/i, name: 'gas' },
  { kind: 'power', test: /\b(power|pole|elec|electricity|pillar|LP|light pole|O\/H|overhead|transformer)\b/i, name: 'power' },
  { kind: 'telecom', test: /\b(telstra|NBN|comms|telecom|tel|optic|pit T)\b/i, name: 'telecom' },
]

function services(ctx: Ctx): FoundGroup[] {
  const byKind = new Map<ServiceKind, { features: SiteFeature[]; marks: Vec2[]; names: string[]; unplaced: number }>()
  const many = /\//
  // Labels closest to a symbol choose first, so two labels don't share one manhole.
  const order = ctx.labels
    .filter(l => !ctx.taken.has(l) && SERVICE_WORDS.some(s => s.test.test(l.str)))
    .map(l => ({ l, d: circleByLabel(ctx, l, l.size * 2.5, l.size * 1.2)?.d ?? Infinity }))
    .sort((a, b) => a.d - b.d)
    .map(x => x.l)
  for (const l of order) {
    if (ctx.taken.has(l)) continue
    const kinds = SERVICE_WORDS.filter(s => s.test.test(l.str))
    if (!kinds.length) continue
    // "Water/Gas/Comms/& Electricity conduits" names several: keep it as one line of the first.
    const kind = kinds[0].kind
    ctx.taken.add(l)
    // A two-line label ("Grated" / "Pit").
    const under = ctx.labels.find(o => !ctx.taken.has(o) && Math.abs(o.at[0] - l.at[0]) < l.size * 2 && l.at[1] - o.at[1] > 0 && l.at[1] - o.at[1] < l.size * 1.5 && o.str.length < 30)
    if (under && !/\d/.test(under.str)) ctx.taken.add(under)
    const label = sentence(under && !/\d/.test(under.str) ? `${l.str} ${under.str}` : l.str)
    const g = byKind.get(kind) ?? { features: [], marks: [], names: [], unplaced: 0 }
    byKind.set(kind, g)
    g.marks.push(l.mid)
    g.names.push(label)
    const pipe = /\b\d+\s*(mm)?\s*Ø?\s*(RCP|PVC|uPVC|VC|DI|CI|HDPE)\b|Ø\s*\d+|\d+\s*Ø|conduit/i.test(l.str)
    const lineish = pipe || (Math.abs(l.angle) > 10 && Math.abs(l.angle) < 170) || many.test(l.str)
    if (lineish) {
      const line = lineBeside(ctx, l, l.size * 1.6)
      if (line) {
        g.features.push(withDefaults({ id: featureId(), type: 'service', service: kind, source: 'pdf', geom: { kind: 'line', pts: line }, label }))
        continue
      }
    }
    // Pits and manholes are drawn as small circles or squares by the label.
    const c = circleByLabel(ctx, l, l.size * 2.5, l.size * 1.2)
    claim(ctx, c)
    const at = c ? c.c : symbolNear(ctx, l.mid, l.size * 2.5, l.size * 2)
    if (at) g.features.push(withDefaults({ id: featureId(), type: 'service', service: kind, source: 'pdf', geom: { kind: 'point', at }, label }))
    else g.unplaced++
  }
  const groups: FoundGroup[] = []
  for (const s of SERVICE_WORDS) {
    const g = byKind.get(s.kind)
    if (!g) continue
    const counts = new Map<string, number>()
    for (const n of g.names) counts.set(n, (counts.get(n) ?? 0) + 1)
    groups.push({
      id: `services-${s.kind}`,
      type: 'service',
      title: `${plural(g.names.length, 'label')} for ${s.name}`,
      detail: [[...counts].map(([n, c]) => (c > 1 ? `${c} × “${n}”` : `“${n}”`)).join(', ')],
      features: g.features,
      marks: g.marks,
      traceHint: g.unplaced ? `${plural(g.unplaced, 'label')} had no symbol beside ${g.unplaced > 1 ? 'them' : 'it'}: trace ${g.unplaced > 1 ? 'them' : 'it'}.` : undefined,
    })
  }
  return groups
}

// ---- Buildings -----------------------------------------------------------------

const LEVEL_NAME = /^(GFL|DFL|FFL|FL|RL|Ridge|Gutter|Eave|Eaves|Roof|Floor|Lower|Upper|Slab|Deck|TOW|Top)\b/i

function buildings(ctx: Ctx): FoundGroup | null {
  const word = /\b(dwelling|house|residence|shed|garage|carport|building|cottage|brick|clad|weatherboard|fibro|storey|granny flat|studio|pergola)\b/i
  const seeds = ctx.labels.filter(l => !ctx.taken.has(l) && word.test(l.str))
  if (!seeds.length) return null
  // Stack lines written one under another into one label block.
  const blocks: TextLine[][] = []
  for (const s of seeds) {
    if (blocks.some(b => b.includes(s))) continue
    const block = [s]
    for (let grown = true; grown; ) {
      grown = false
      for (const o of ctx.labels) {
        if (block.includes(o) || ctx.taken.has(o) || Math.abs(o.size - s.size) > s.size * 0.15 || Math.abs(o.angle) > 2) continue
        if (block.some(b => Math.abs(b.mid[0] - o.mid[0]) < s.size * 4 && Math.abs(b.at[1] - o.at[1]) < s.size * 1.6)) {
          block.push(o)
          grown = true
        }
      }
    }
    block.sort((a, b) => b.at[1] - a.at[1])
    blocks.push(block)
  }
  for (const b of blocks) for (const l of b) ctx.taken.add(l)
  const centre = (b: TextLine[]): Vec2 => [b.reduce((s, l) => s + l.mid[0], 0) / b.length, b.reduce((s, l) => s + l.mid[1], 0) / b.length]
  const centres = blocks.map(centre)

  // Levels written near the buildings: "GFL" over "41.20", or "Ridge: 47.85" in one.
  const levels: { name: string; rl: number; at: Vec2; line: TextLine }[] = []
  for (const l of ctx.labels) {
    if (ctx.taken.has(l)) continue
    const one = /^([A-Za-z]+)\s*:?\s*(\d+\.\d+)$/.exec(l.str)
    if (one && LEVEL_NAME.test(one[1])) {
      levels.push({ name: levelName(one[1]), rl: Number(one[2]), at: l.mid, line: l })
      continue
    }
    const name = /^([A-Za-z]+)\s*:?$/.exec(l.str)
    if (!name || !LEVEL_NAME.test(name[1])) continue
    const value = ctx.labels.find(o => o !== l && !ctx.taken.has(o) && /^(?:[A-Z]+\s*:?\s*)?\d+\.\d+$/i.test(o.str) && l.at[1] - o.at[1] > 0 && l.at[1] - o.at[1] < l.size * 1.8 && Math.abs(o.at[0] - l.at[0]) < l.size * 1.5)
    if (!value) continue
    const v = /(\d+\.\d+)$/.exec(value.str)!
    const sub = /^([A-Z]+)\s*:/i.exec(value.str)
    levels.push({ name: levelName(sub ? `${name[1]} ${sub[1]}` : name[1]), rl: Number(v[1]), at: l.mid, line: l })
    ctx.taken.add(value)
  }
  const features: SiteFeature[] = []
  const reach = points(15, ctx)
  blocks.forEach((b, i) => {
    const c = centres[i]
    const mine = levels.filter(lv => {
      const d = dist(lv.at, c)
      return d < reach && centres.every((o, j) => j === i || dist(lv.at, o) >= d)
    })
    for (const lv of mine) ctx.taken.add(lv.line)
    const no = b.find(l => /^No\.?\s*\d+\w*$/i.test(l.str))
    const label = no ? no.str.replace(/^No\.?\s*/i, 'No. ') : sentence(b.map(l => l.str).join(' '))
    const ridge = Math.max(...mine.filter(m => /ridge/i.test(m.name)).map(m => m.rl))
    const floor = Math.min(...mine.filter(m => /floor|FL/i.test(m.name)).map(m => m.rl))
    const height = Number.isFinite(ridge) && Number.isFinite(floor) && ridge > floor ? Math.round((ridge - floor) * 10) / 10 : undefined
    features.push(
      withDefaults({
        id: featureId(),
        type: 'building',
        source: 'pdf',
        geom: { kind: 'point', at: c },
        label,
        purpose: sentence(b.filter(l => l !== no).map(l => l.str).join(' ')),
        levels: mine.map(m => ({ name: m.name, rl: m.rl })),
        height,
        neighbour: isOutside(ctx, c) || undefined,
      }),
    )
  })
  const nb = features.filter(f => f.neighbour).length
  return {
    id: 'buildings',
    type: 'building',
    title: `${plural(blocks.length, 'building')} named on the drawing`,
    detail: features.map(f => `${f.label}${f.neighbour ? " (neighbour's)" : ''}${f.levels?.length ? `: ${f.levels.map(l => `${l.name} ${l.rl.toFixed(2)}`).join(', ')}` : ''}`),
    features,
    marks: centres,
    traceHint: `Their outlines aren't read: trace each one to give it a shape${nb ? '; the levels come with them' : ''}.`,
  }
}

function levelName(s: string): string {
  const k = s.toUpperCase().replace(/\s+/g, ' ')
  const names: Record<string, string> = {
    GFL: 'Garage floor',
    DFL: 'Dwelling floor',
    FFL: 'Floor',
    FL: 'Floor',
    'LOWER FL': 'Lower floor',
    'UPPER DFL': 'Upper dwelling floor',
    'LOWER DFL': 'Lower dwelling floor',
    'UPPER FL': 'Upper floor',
    RIDGE: 'Ridge',
    GUTTER: 'Gutter',
    EAVE: 'Eave',
    EAVES: 'Eave',
  }
  return names[k] ?? sentence(s)
}

// ---- Paving ----------------------------------------------------------------------

function paving(ctx: Ctx): FoundGroup | null {
  const hits = ctx.labels.filter(l => !ctx.taken.has(l) && /\b(driveway|drive|concrete|conc|paving|pavers|paved|asphalt|bitumen|hardstand|path|crossover|gravel)\b/i.test(l.str))
  if (!hits.length) return null
  const features: SiteFeature[] = []
  const marks: Vec2[] = []
  let unplaced = 0
  for (const l of hits) {
    ctx.taken.add(l)
    marks.push(l.mid)
    // A closed outline round the words, if there is one of a sensible size.
    let ring = null as Chain | null
    for (const ch of ctx.lw.chains) {
      if (!ch.closed || ch.pts.length < 4 || !pointInPolygon(l.mid[0], l.mid[1], ch.pts)) continue
      const a = Math.abs(ringArea(ch.pts)) * ctx.mpp * ctx.mpp
      if (a < 2 || a > 400) continue
      if (!ring || Math.abs(ringArea(ch.pts)) < Math.abs(ringArea(ring.pts))) ring = ch
    }
    const kind = /path/i.test(l.str) ? 'path' : /driveway|drive|crossover/i.test(l.str) ? 'driveway' : 'hardstand'
    if (ring) features.push(withDefaults({ id: featureId(), type: 'paving', paving: kind, source: 'pdf', geom: { kind: 'area', pts: ring.pts }, label: sentence(l.str) }))
    else unplaced++
  }
  const names = [...new Set(hits.map(h => sentence(h.str)))]
  return {
    id: 'paving',
    type: 'paving',
    title: `${plural(hits.length, 'label')} ${hits.length === 1 ? 'mentions' : 'mention'} paving`,
    detail: [names.map(n => `“${n}”`).join(', ')],
    features,
    marks,
    traceHint: unplaced ? `${unplaced === hits.length ? 'Their' : `${unplaced} of their`} outlines aren't closed on the drawing: trace them.` : undefined,
  }
}

const SMALL_WORDS = new Set(['OF', 'FOR', 'THE', 'AND', 'TO', 'IN', 'ON', 'AT', 'BY', 'OR', 'A', 'AN', 'NOT', 'MAN', 'PIT', 'NO'])

/**
 * "RIGHT OF CARRIAGEWAY" → "Right of carriageway". Short words in capitals that aren't
 * ordinary words (SMH, RCP, DP123456, (E1)) are kept as written, and mixed case is left alone.
 */
export function sentence(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t !== t.toUpperCase() || !/[A-Z]{4}/.test(t)) return t
  let first = true
  return t.replace(/[A-Za-z\u00C0-\u00FF]+[0-9]*/g, w => {
    const abbrev = (/^[A-Z]{2,3}$/.test(w) && !SMALL_WORDS.has(w)) || /[0-9]/.test(w)
    const out = abbrev ? w : first ? w.charAt(0) + w.slice(1).toLowerCase() : w.toLowerCase()
    first = false
    return out
  })
}
