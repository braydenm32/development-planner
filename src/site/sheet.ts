import { centroidOf, type Vec2 } from '../lib/geom'
import { textWidth, type PdfPage, type RGB } from '../share/pdfWriter'
import { EDGES, serviceInfo, SERVICES, type ServiceKind, type SiteFeature } from './model'
import { nearBlock } from './shape'
import { srzRadius, tpzRadius, type SiteWarning } from './warnings'

/**
 * Site features on the PDF site plan, in the same quiet symbols as the plan, and the legend
 * that names them. Everything is drawn in paper millimetres through `toPaper`.
 */
type P = [number, number]

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
const TREE: RGB = [0.36, 0.54, 0.33]
const TRUNK: RGB = [0.3, 0.42, 0.24]
const EASE: RGB = [0.72, 0.38, 0.18]
const EASE_FILL: RGB = [0.98, 0.93, 0.89]
const FENCE: RGB = [0.25, 0.27, 0.31]
const PAVE: RGB = [0.88, 0.89, 0.9]
const PAVE_EDGE: RGB = [0.55, 0.58, 0.61]
const BLDG: RGB = [0.9, 0.89, 0.87]
const BLDG_EDGE: RGB = [0.35, 0.38, 0.42]
const KERB: RGB = [0.36, 0.38, 0.41]
const OTHER: RGB = [0.48, 0.5, 0.53]
const ATTN: RGB = [0.76, 0.48, 0]
const GREY: RGB = [0.45, 0.48, 0.52]

export interface SheetArgs {
  pg: PdfPage
  /** Survey local frame (metres) to paper (mm). */
  toPaper: (p: Vec2) => P
  /** Paper mm per metre. */
  k: number
  /** The drawing area on the sheet, to keep the features inside. */
  clip: { x: number; y: number; w: number; h: number }
  /** Features (local frame) that warnings are about. */
  warned: Set<string>
}

/** What a feature's symbol is, for the legend. */
function legendKey(f: SiteFeature): string {
  if (f.type === 'tree') return f.remove ? 'tree-remove' : 'tree'
  if (f.type === 'service') return `service-${f.service ?? 'sewer'}`
  if (f.type === 'building') return f.neighbour ? 'building-neighbour' : 'building'
  if (f.type === 'kerb') return `kerb-${f.edge ?? 'kerb'}`
  return f.type
}

/** The features worth drawing on a site plan: on the block or close to it. */
export function sheetFeatures(features: SiteFeature[], boundary: Vec2[]): SiteFeature[] {
  return features.filter(f => nearBlock(f, boundary, 4))
}

function along(pts: P[], step: number, fn: (p: P, dir: P) => void) {
  let next = step / 2
  let run = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (L < 1e-9) continue
    const d: P = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
    while (next <= run + L) {
      const t = next - run
      fn([a[0] + d[0] * t, a[1] + d[1] * t], d)
      next += step
    }
    run += L
  }
}

function upright(deg: number) {
  let a = deg
  while (a > 90) a -= 180
  while (a <= -90) a += 180
  return a
}

/** Areas, under the house and boundary: easements hatched, paving, buildings, other areas. */
/** Sides for a circle of radius r (mm on paper) to look round. */
const sides = (r: number) => Math.max(24, Math.min(120, Math.ceil(r * 4)))

export function drawFeatureAreas(a: SheetArgs, features: SiteFeature[]) {
  const { pg, toPaper } = a
  const r = a.clip
  pg.save().clip([
    [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x + r.w, r.y + r.h],
      [r.x, r.y + r.h],
    ],
  ])
  const labelled: { label: string; at: Vec2 }[] = []
  for (const f of features) {
    if (f.geom.kind !== 'area') continue
    const ring = f.geom.pts.map(toPaper)
    if (f.type === 'easement') {
      pg.fill(EASE_FILL).shape([ring], 'fill')
      // Hatching, clipped to the easement.
      pg.save().clip([ring])
      const xs = ring.map(p => p[0])
      const ys = ring.map(p => p[1])
      const x0 = Math.min(...xs)
      const x1 = Math.max(...xs)
      const y0 = Math.min(...ys)
      const y1 = Math.max(...ys)
      pg.lineWidth(0.12).stroke(EASE)
      for (let c = x0 - (y1 - y0); c < x1; c += 1.4) pg.line([c, y0], [c + (y1 - y0), y1])
      pg.restore()
      pg.lineWidth(0.25).stroke(EASE).dash([1.6, 0.8]).shape([ring], 'stroke').dash()
      const label = [f.label, f.width !== undefined ? `${f.width} m` : null].filter(Boolean).join(' ')
      const c = toPaper(centroidOf(f.geom.pts))
      // One label for strips of one easement side by side.
      if (label && !labelled.some(l => l.label === label && Math.hypot(l.at[0] - c[0], l.at[1] - c[1]) < 25)) {
        labelled.push({ label, at: c })
        pg.text(c[0], c[1], label, { size: 2.2, align: 'center', baseline: 'middle', color: EASE, font: 'bold' })
      }
    } else if (f.type === 'paving') {
      pg.lineWidth(0.15).stroke(PAVE_EDGE).fill(PAVE).shape([ring], 'both')
    } else if (f.type === 'building') {
      pg.lineWidth(0.25).stroke(BLDG_EDGE).fill(BLDG)
      if (f.neighbour || f.remove) pg.dash([1, 0.6])
      pg.shape([ring], 'both').dash()
      const c = toPaper(centroidOf(f.geom.pts))
      if (f.label) pg.text(c[0], c[1], f.label, { size: 2, align: 'center', baseline: 'middle', color: GREY })
    } else {
      pg.lineWidth(0.15).stroke(OTHER).fill([0.95, 0.95, 0.96]).dash([1, 0.6]).shape([ring], 'both').dash()
      if (f.label) {
        const c = toPaper(centroidOf(f.geom.pts))
        pg.text(c[0], c[1], f.label, { size: 2, align: 'center', baseline: 'middle', color: GREY })
      }
    }
  }
  pg.restore()
}

/** Lines and points, over the house: fences, services, kerbs, trees with their protection zones. */
export function drawFeatureMarks(a: SheetArgs, features: SiteFeature[]) {
  const { pg, toPaper, k } = a
  const r = a.clip
  pg.save().clip([
    [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x + r.w, r.y + r.h],
      [r.x, r.y + r.h],
    ],
  ])
  for (const f of features) {
    const g = f.geom
    if (g.kind === 'line') {
      const pts = g.pts.map(toPaper)
      if (f.type === 'fence') {
        pg.lineWidth(0.3).stroke(FENCE).polyline(pts)
        pg.lineWidth(0.15)
        along(pts, 2.4, (p, d) => pg.line(p, [p[0] - d[1] * 0.9, p[1] + d[0] * 0.9]))
      } else if (f.type === 'service') {
        const s = serviceInfo(f.service)
        const c = hex(s.color)
        pg.lineWidth(0.3).stroke(c).dash([2, 0.8]).polyline(pts).dash()
        along(pts, 24, (p, d) => {
          const ang = upright((Math.atan2(d[1], d[0]) * 180) / Math.PI)
          pg.fill([1, 1, 1]).stroke([1, 1, 1]).circle(p[0], p[1], 1.3, 'fill')
          pg.text(p[0], p[1], s.code, { size: 1.9, font: 'bold', align: 'center', baseline: 'middle', angle: ang, color: c })
        })
      } else if (f.type === 'kerb') {
        pg.lineWidth(f.edge === 'kerb' || !f.edge ? 0.4 : 0.2).stroke(KERB)
        if (f.edge === 'footpath') pg.dash([0.6, 0.8])
        pg.polyline(pts).dash()
      } else {
        pg.lineWidth(0.2).stroke(OTHER).dash([1, 0.6]).polyline(pts).dash()
      }
    } else if (g.kind === 'point') {
      const p = toPaper(g.at)
      if (f.type === 'tree') {
        const canopy = ((f.canopy ?? 6) / 2) * k
        if (!f.remove && f.trunk) {
          const warned = a.warned.has(f.id)
          pg.lineWidth(warned ? 0.25 : 0.15).stroke(warned ? ATTN : [0.55, 0.65, 0.5]).dash([1.2, 0.9])
          const tpz = tpzRadius(f.trunk) * k
          pg.circle(p[0], p[1], tpz, 'stroke', sides(tpz))
          if (warned) pg.lineWidth(0.15).stroke([0.6, 0.42, 0.31]).dash([0.4, 0.7]).circle(p[0], p[1], srzRadius(f.trunk) * k, 'stroke', sides(srzRadius(f.trunk) * k))
          pg.dash()
        }
        pg.lineWidth(0.2).stroke(TREE)
        if (f.remove) pg.dash([0.8, 0.6])
        pg.circle(p[0], p[1], canopy, 'stroke', sides(canopy)).dash()
        const t = Math.max(((f.trunk ?? 0.3) / 2) * k, 0.5)
        pg.lineWidth(0.25).stroke(TRUNK).fill([1, 1, 1]).circle(p[0], p[1], t, 'both')
        if (f.remove) {
          pg.lineWidth(0.3).stroke([0.65, 0.23, 0.16])
          pg.line([p[0] - t - 1, p[1] - t - 1], [p[0] + t + 1, p[1] + t + 1])
          pg.line([p[0] - t - 1, p[1] + t + 1], [p[0] + t + 1, p[1] - t - 1])
        }
        if (f.label) pg.text(p[0], p[1] + t + 1, f.label, { size: 2.2, align: 'center', font: 'bold', color: TRUNK })
      } else if (f.type === 'service') {
        const c = hex(serviceInfo(f.service).color)
        pg.lineWidth(0.3).stroke(c).fill([1, 1, 1]).circle(p[0], p[1], 0.9, 'both')
        pg.text(p[0], p[1] + 1.4, f.label ?? serviceInfo(f.service).code, { size: 1.9, align: 'center', color: c })
      } else if (f.type === 'building') {
        pg.lineWidth(0.25).stroke(BLDG_EDGE).fill(BLDG).rect(p[0] - 1, p[1] - 1, 2, 2, 'both')
      } else {
        pg.lineWidth(0.25).stroke(OTHER)
        pg.line([p[0] - 0.8, p[1] - 0.8], [p[0] + 0.8, p[1] + 0.8])
        pg.line([p[0] - 0.8, p[1] + 0.8], [p[0] + 0.8, p[1] - 0.8])
      }
    }
  }
  pg.restore()
}

interface LegendRow {
  key: string
  label: string
  draw: (pg: PdfPage, x: number, y: number) => void
}

function legendRows(features: SiteFeature[], warned: Set<string>): LegendRow[] {
  const keys = new Set(features.map(legendKey))
  const rows: LegendRow[] = []
  const add = (key: string, label: string, draw: LegendRow['draw']) => keys.has(key) && rows.push({ key, label, draw })
  add('tree', 'Tree (trunk, canopy)', (pg, x, y) => {
    pg.lineWidth(0.2).stroke(TREE).circle(x + 4, y, 1.8, 'stroke')
    pg.lineWidth(0.25).stroke(TRUNK).fill([1, 1, 1]).circle(x + 4, y, 0.45, 'both')
  })
  if (features.some(f => f.type === 'tree' && !f.remove && f.trunk)) {
    rows.push({
      key: 'tpz',
      label: 'Tree protection zone (12 × trunk Ø)',
      draw: (pg, x, y) => pg.lineWidth(0.15).stroke([0.55, 0.65, 0.5]).dash([1.2, 0.9]).line([x, y], [x + 8, y]).dash(),
    })
    if (warned.size)
      rows.push({
        key: 'tpz-works',
        label: 'Tree protection zone with works in it',
        draw: (pg, x, y) => pg.lineWidth(0.25).stroke(ATTN).dash([1.2, 0.9]).line([x, y], [x + 8, y]).dash(),
      })
  }
  add('tree-remove', 'Tree to remove', (pg, x, y) => {
    pg.lineWidth(0.2).stroke(TREE).dash([0.8, 0.6]).circle(x + 4, y, 1.8, 'stroke').dash()
    pg.lineWidth(0.3).stroke([0.65, 0.23, 0.16]).line([x + 3, y - 1], [x + 5, y + 1]).line([x + 3, y + 1], [x + 5, y - 1])
  })
  add('easement', 'Easement', (pg, x, y) => {
    pg.fill(EASE_FILL).rect(x, y - 1.3, 8, 2.6, 'fill')
    pg.lineWidth(0.12).stroke(EASE)
    for (let c = x; c < x + 8; c += 1.4) pg.line([c, y - 1.3], [Math.min(c + 2.6, x + 8), y - 1.3 + Math.min(2.6, x + 8 - c)])
    pg.lineWidth(0.25).dash([1.6, 0.8]).rect(x, y - 1.3, 8, 2.6, 'stroke').dash()
  })
  add('fence', 'Fence', (pg, x, y) => {
    pg.lineWidth(0.3).stroke(FENCE).line([x, y], [x + 8, y])
    pg.lineWidth(0.15)
    for (let c = x + 1.2; c < x + 8; c += 2.4) pg.line([c, y], [c, y + 0.9])
  })
  add('paving', 'Driveway or paving', (pg, x, y) => pg.lineWidth(0.15).stroke(PAVE_EDGE).fill(PAVE).rect(x, y - 1.3, 8, 2.6, 'both'))
  add('building', 'Building or shed', (pg, x, y) => pg.lineWidth(0.25).stroke(BLDG_EDGE).fill(BLDG).rect(x, y - 1.3, 8, 2.6, 'both'))
  add('building-neighbour', "Neighbour's building", (pg, x, y) =>
    pg.lineWidth(0.25).stroke(BLDG_EDGE).fill(BLDG).dash([1, 0.6]).rect(x, y - 1.3, 8, 2.6, 'both').dash(),
  )
  for (const s of SERVICES) {
    const kind: ServiceKind = s.id
    add(`service-${kind}`, s.label, (pg, x, y) => {
      const c = hex(s.color)
      pg.lineWidth(0.3).stroke(c).dash([2, 0.8]).line([x, y], [x + 8, y]).dash()
    })
  }
  for (const e of EDGES)
    add(`kerb-${e.id}`, e.label, (pg, x, y) => {
      pg.lineWidth(e.id === 'kerb' ? 0.4 : 0.2).stroke(KERB)
      if (e.id === 'footpath') pg.dash([0.6, 0.8])
      pg.line([x, y], [x + 8, y]).dash()
    })
  add('other', 'Other', (pg, x, y) => pg.lineWidth(0.2).stroke(OTHER).dash([1, 0.6]).line([x, y], [x + 8, y]).dash())
  return rows
}

/**
 * The legend of the features shown, with what to check, in a box whose bottom-right corner
 * is at (right, bottom). Returns its height (0 when there is nothing to show).
 */
const NOTES_HEAD = 'Check with council, and an arborist for trees'

export function drawFeatureLegend(pg: PdfPage, right: number, bottom: number, features: SiteFeature[], warnings: SiteWarning[]): number {
  const attn = warnings.filter(w => w.severity === 'attn').sort((p, q) => Number(q.kind === 'easement') - Number(p.kind === 'easement'))
  const rows = legendRows(features, new Set(attn.filter(w => w.kind === 'tree').map(w => w.feature)))
  const notes = attn.slice(0, attn.length > 6 ? 5 : 6).map(w => w.text)
  if (attn.length > notes.length) notes.push(`and ${attn.length - notes.length} more`)
  if (!rows.length && !notes.length) return 0
  const size = 2.4
  const lineH = 3.9
  const textW = Math.max(30, ...rows.map(r => textWidth(r.label, size)), ...notes.map(n => textWidth(n, 2.2) - 10), textWidth(NOTES_HEAD, 2.3, 'bold') - 11)
  const w = 8 + 3 + textW + 6
  const h = 5 + rows.length * lineH + (notes.length ? 4 + notes.length * 3.4 : 0) + 3
  const x = right - w
  const y = bottom
  pg.lineWidth(0.25).stroke([0.75, 0.77, 0.8]).fill([1, 1, 1]).rect(x, y, w, h, 'both')
  let cy = y + h - 4
  pg.text(x + 3, cy, 'Site features', { size: 2.6, font: 'bold' })
  cy -= lineH
  for (const r of rows) {
    r.draw(pg, x + 3, cy + 0.8)
    pg.text(x + 3 + 8 + 3, cy, r.label, { size, color: GREY })
    cy -= lineH
  }
  if (notes.length) {
    cy -= 0.6
    pg.text(x + 3, cy, NOTES_HEAD, { size: 2.3, font: 'bold', color: ATTN })
    cy -= 3.4
    for (const n of notes) {
      pg.text(x + 3, cy, n, { size: 2.2, color: [0.36, 0.24, 0] })
      cy -= 3.4
    }
  }
  return h
}
