// Sections and elevations as sheets of the PDF plan set (src/share/plans.ts), drawn by paint.ts
// at a stated scale: 1:100 where it fits on the paper, else 1:200, else smaller. Elevations go
// two to a sheet (north with south, east with west) when both fit at the same scale.

import type { Vec2 } from '../lib/geom'
import type { SectionLine } from '../plan/model'
import { textWidth, type PdfPage, type RGB } from '../share/pdfWriter'
import type { DrawingInput, Pt } from './common'
import { elevationDrawing, type Side } from './elevation'
import { sectionsOf } from './lines'
import { drawingSize, paintDrawing, type Drawing, type Ink, type LineStyle, type Painter, type ShapeStyle } from './paint'
import { sectionDrawing } from './section'

/** The scales sheets try, largest first. */
export const SHEET_SCALES = [100, 200, 250, 500, 1000]

/** Room between two drawings on one sheet (mm). */
const BETWEEN = 12

interface Area {
  x: number
  y: number
  w: number
  h: number
}

export interface DrawingSheet {
  name: string
  /** A section or a sheet of elevations, for the DA pack's checklist. */
  kind: 'section' | 'elevation'
  /** 1:scale. */
  scale: number
  draw: (pg: PdfPage) => void
}

const INK: RGB = [0.09, 0.09, 0.11]
const DARK: RGB = [0.17, 0.19, 0.21]
const MUTED: RGB = [0.42, 0.44, 0.47]
const INKS: Record<Ink, RGB> = { ink: INK, muted: MUTED, accent: [0.14, 0.27, 0.82], boundary: [0.24, 0.29, 0.23] }

const SHAPES: Record<ShapeStyle, { fill: RGB; stroke?: RGB; width?: number }> = {
  earth: { fill: [0.95, 0.94, 0.92] },
  cut: { fill: [0.97, 0.86, 0.79] },
  fill: { fill: [0.81, 0.87, 0.94] },
  slab: { fill: [0.6, 0.63, 0.66], stroke: DARK, width: 0.18 },
  framing: { fill: [0.91, 0.89, 0.84], stroke: [0.37, 0.41, 0.45], width: 0.18 },
  pier: { fill: [0.42, 0.44, 0.47] },
  'wall-cut': { fill: [0.28, 0.3, 0.33] },
  retaining: { fill: [0.73, 0.67, 0.56], stroke: [0.43, 0.37, 0.29], width: 0.2 },
  'roof-cut': { fill: [0.8, 0.82, 0.84], stroke: DARK, width: 0.25 },
  'wall-face': { fill: [1, 1, 1], stroke: DARK, width: 0.25 },
  'roof-face': { fill: [0.91, 0.91, 0.93], stroke: [0.91, 0.91, 0.93], width: 0.1 },
  window: { fill: [0.87, 0.91, 0.95], stroke: DARK, width: 0.18 },
  door: { fill: [0.95, 0.94, 0.9], stroke: DARK, width: 0.18 },
  garage: { fill: [0.93, 0.94, 0.95], stroke: DARK, width: 0.18 },
  opening: { fill: [0.8, 0.82, 0.84], stroke: DARK, width: 0.18 },
  'scale-dark': { fill: INK },
  'scale-light': { fill: [1, 1, 1], stroke: INK, width: 0.2 },
}

const LINES: Record<LineStyle, { stroke: RGB; width: number; dash?: number[] }> = {
  natural: { stroke: MUTED, width: 0.3, dash: [1.4, 1] },
  finished: { stroke: INK, width: 0.45 },
  ceiling: { stroke: [0.6, 0.63, 0.66], width: 0.2 },
  level: { stroke: [0.72, 0.75, 0.78], width: 0.15, dash: [0.6, 0.9] },
  boundary: { stroke: INKS.boundary, width: 0.3, dash: [2.6, 0.9, 0.6, 0.9] },
  dim: { stroke: [0.54, 0.56, 0.6], width: 0.18 },
  axis: { stroke: [0.54, 0.56, 0.6], width: 0.18 },
  'roof-edge': { stroke: DARK, width: 0.25 },
  detail: { stroke: DARK, width: 0.12 },
  height: { stroke: INKS.accent, width: 0.3 },
}

/** A Painter that draws on a PDF page inside `area`, turning the drawing's y-down units (mm) into the page's y-up. */
function pdfPainter(pg: PdfPage | null, area: Area): Painter {
  const top = area.y + area.h
  const at = (p: Pt): [number, number] => [area.x + p[0], top - p[1]]
  return {
    size: { title: 3.4, label: 2.5, small: 2.2 },
    unit: 0.3,
    shape(pts, style) {
      if (!pg || pts.length < 3) return
      const s = SHAPES[style]
      pg.fill(s.fill)
      if (s.stroke) pg.lineWidth(s.width ?? 0.2).stroke(s.stroke)
      pg.shape([pts.map(at)], s.stroke ? 'both' : 'fill')
    },
    line(pts, style) {
      if (!pg || pts.length < 2) return
      const s = LINES[style]
      pg.lineWidth(s.width).stroke(s.stroke).dash(s.dash ?? [])
      pg.polyline(pts.map(at))
      if (s.dash) pg.dash()
    },
    text(x, y, s, o) {
      if (!pg) return
      const [px, py] = at([x, y])
      pg.text(px, py, s, {
        size: o.size,
        font: o.bold ? 'bold' : 'regular',
        align: o.anchor === 'middle' ? 'center' : o.anchor === 'end' ? 'right' : 'left',
        baseline: o.middle ? 'middle' : 'alphabetic',
        color: INKS[o.ink ?? 'ink'],
        angle: o.angle,
      })
    },
    measure: (s, size, bold) => textWidth(s, size, bold ? 'bold' : 'regular'),
    // The title block's scale bar serves every drawing on the sheet.
    scaleBar: false,
  }
}

/** The largest scale at which the drawings fit stacked in the area, or null. */
function fitting(group: Drawing[], area: Area): number | null {
  const p = pdfPainter(null, area)
  for (const scale of SHEET_SCALES) {
    const sizes = group.map(d => drawingSize(p, d, 1000 / scale))
    const h = sizes.reduce((t, s) => t + s.h, 0) + BETWEEN * (group.length - 1)
    if (sizes.every(s => s.w <= area.w) && h <= area.h) return scale
  }
  return null
}

/** One sheet of drawings, stacked and centred in the area. */
function sheet(name: string, group: Drawing[], area: Area, scale: number, kind: DrawingSheet['kind']): DrawingSheet {
  return {
    name,
    kind,
    scale,
    draw: pg => {
      const p = pdfPainter(pg, area)
      const k = 1000 / scale
      const sizes = group.map(d => drawingSize(p, d, k))
      const total = sizes.reduce((t, s) => t + s.h, 0) + BETWEEN * (group.length - 1)
      let y = Math.max(0, (area.h - total) / 2)
      group.forEach((d, i) => {
        pg.round()
        paintDrawing(p, d, Math.max(0, (area.w - sizes[i].w) / 2), y, k)
        y += sizes[i].h + BETWEEN
      })
    },
  }
}

/** Sheets for a group of drawings: together when that costs no scale, else each on its own at the largest scale that fits. */
function sheetsFor(name: string, group: Drawing[], area: Area, kind: DrawingSheet['kind']): DrawingSheet[] {
  const alone = group.map(d => fitting([d], area) ?? SHEET_SCALES[SHEET_SCALES.length - 1])
  const together = fitting(group, area)
  if (together !== null && together <= Math.max(...alone)) return [sheet(name, group, area, together, kind)]
  return group.map((d, i) => sheet(d.title, [d], area, alone[i], kind))
}

/** The plan set's section and elevation sheets: each section, then the elevations in pairs. */
export function drawingSheets(input: DrawingInput, area: Area): DrawingSheet[] {
  const out: DrawingSheet[] = []
  for (const line of sectionsOf(input.plan)) {
    const d = sectionDrawing(line, input)
    out.push(...sheetsFor(d.title, [d], area, 'section'))
  }
  const pairs: [Side, Side][] = [
    ['north', 'south'],
    ['east', 'west'],
  ]
  for (const pair of pairs) {
    const group = pair.map(s => elevationDrawing(s, input)).filter(d => d.any)
    if (group.length) out.push(...sheetsFor(`Elevations: ${pair.join(' and ')}`, group, area, 'elevation'))
  }
  return out
}

/** The part of segment a–b inside the area (Liang–Barsky), or null. */
function clipTo(a: [number, number], b: [number, number], r: Area): [[number, number], [number, number]] | null {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  let t0 = 0
  let t1 = 1
  for (const [q, d] of [
    [a[0] - r.x, -dx],
    [r.x + r.w - a[0], dx],
    [a[1] - r.y, -dy],
    [r.y + r.h - a[1], dy],
  ]) {
    if (Math.abs(d) < 1e-12) {
      if (q < 0) return null
      continue
    }
    const t = q / d
    if (d < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
  }
  if (t0 > t1) return null
  return [
    [a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1],
  ]
}

/** Room kept inside the sheet's drawing area for a letter and its arrow (mm). */
const MARK_ROOM = 7

/**
 * Section lines on a floor plan sheet: dash-dot, with their letter and an arrow at each end.
 * A line longer than the sheet is cut short at the drawing area, with its letters at the cut.
 */
export function drawSectionMarks(pg: PdfPage, P: (p: Vec2) => [number, number], lines: SectionLine[], area: Area) {
  const inner = { x: area.x + MARK_ROOM, y: area.y + MARK_ROOM, w: area.w - 2 * MARK_ROOM, h: area.h - 2 * MARK_ROOM }
  for (const l of lines) {
    const ends = clipTo(P(l.a), P(l.b), inner)
    if (!ends) continue
    const [a, b] = ends
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 2) continue
    const d: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    // The way the drawing looks: the line's left in the house frame, onto the paper through P.
    const lp = P([l.a[0] - (l.b[1] - l.a[1]), l.a[1] + (l.b[0] - l.a[0])])
    const ll = Math.hypot(lp[0] - a[0], lp[1] - a[1]) || 1
    const look: Vec2 = [(lp[0] - a[0]) / ll, (lp[1] - a[1]) / ll]
    pg.lineWidth(0.3).stroke(DARK).dash([3, 1, 0.6, 1])
    pg.line(a, b)
    pg.dash()
    for (const [p, out] of [
      [a, -1],
      [b, 1],
    ] as const) {
      const c: [number, number] = [p[0] + d[0] * out * 4, p[1] + d[1] * out * 4]
      const base: [number, number] = [p[0] + look[0] * 1.6, p[1] + look[1] * 1.6]
      const tip: [number, number] = [p[0] + look[0] * 4, p[1] + look[1] * 4]
      pg.lineWidth(0.3).stroke(DARK).line(p, base)
      pg.fill(DARK).shape(
        [
          [
            [base[0] - d[0] * 1.3, base[1] - d[1] * 1.3],
            tip,
            [base[0] + d[0] * 1.3, base[1] + d[1] * 1.3],
          ],
        ],
        'fill',
      )
      pg.lineWidth(0.3).stroke(DARK).fill([1, 1, 1]).circle(c[0], c[1], 2.2, 'both')
      pg.text(c[0], c[1], l.label, { size: 2.6, font: 'bold', align: 'center', baseline: 'middle', color: DARK })
    }
  }
}
