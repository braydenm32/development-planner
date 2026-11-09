// The shadow diagram sheet in the PDF plans: the house's shadows at 9 am, 12 pm and 3 pm on
// 21 June, each hatched its own way with a solid, dashed or dotted edge, so they read apart in
// black and white too; the part over the boundary shaded under the hatching; and a key that says
// when, where, which north and what the shadows fall on. Drawn in paper millimetres through
// `toPaper`, as the site features are (src/site/sheet.ts).

import type { Vec2 } from '../lib/geom'
import { textWidth, type PdfPage, type RGB } from '../share/pdfWriter'
import { boundaryText, OVER_MIN, type ShadowDiagram } from './facts'
import { coordsText, gridBearing, inNsw, mgaConvergence } from './location'
import { compassPoint, hourText } from './solar'

type P = [number, number]

/** Each time's ink, hatch angle on the paper and edge dashes: 9 am, 12 pm, 3 pm. */
const INKS: RGB[] = [
  [0.42, 0.35, 0.62],
  [0.24, 0.44, 0.56],
  [0.54, 0.35, 0.24],
]
const HATCH = [45, -45, 90]
const DASH = [[], [2, 1], [0.5, 0.7]]
const OVER_FILL: RGB = [0.98, 0.86, 0.84]
const OVER_INK: RGB = [0.7, 0.15, 0.12]
const GREY: RGB = [0.45, 0.48, 0.52]
const LIGHT: RGB = [0.75, 0.77, 0.8]
/** Hatch spacing (mm). */
const GAP = 1.6

export interface ShadowSheetArgs {
  pg: PdfPage
  /** Survey local frame (metres) to paper (mm). */
  toPaper: (p: Vec2) => P
}

/** Parallel lines at `deg` every GAP mm across the rings' box; clip to the rings first. */
function hatch(pg: PdfPage, rings: P[][], deg: number) {
  const pts = rings.flat()
  if (!pts.length) return
  const a = (deg * Math.PI) / 180
  const d: P = [Math.cos(a), Math.sin(a)]
  const n: P = [-d[1], d[0]]
  let a0 = Infinity
  let a1 = -Infinity
  let n0 = Infinity
  let n1 = -Infinity
  for (const p of pts) {
    const u = p[0] * d[0] + p[1] * d[1]
    const v = p[0] * n[0] + p[1] * n[1]
    a0 = Math.min(a0, u)
    a1 = Math.max(a1, u)
    n0 = Math.min(n0, v)
    n1 = Math.max(n1, v)
  }
  // On a fixed grid, so the hatching of overlapping shadows lines up.
  for (let t = Math.ceil(n0 / GAP) * GAP; t <= n1; t += GAP) pg.line([d[0] * a0 + n[0] * t, d[1] * a0 + n[1] * t], [d[0] * a1 + n[0] * t, d[1] * a1 + n[1] * t])
}

/** The shadows, under the house: shaded over the boundary, hatched, and outlined. */
export function drawShadows({ pg, toPaper }: ShadowSheetArgs, d: ShadowDiagram) {
  const paper = (rings: Vec2[][]) => rings.map(r => r.map(toPaper))
  for (const s of d.shadows) if (s.shadow?.over.rings.length) pg.fill(OVER_FILL).shape(paper(s.shadow.over.rings), 'fill')
  d.shadows.forEach((s, i) => {
    if (!s.shadow?.rings.length) return
    const rings = paper(s.shadow.rings)
    pg.save().clip(rings)
    pg.lineWidth(0.15).stroke(INKS[i])
    hatch(pg, rings, HATCH[i])
    pg.restore()
    pg.lineWidth(0.35).stroke(INKS[i]).dash(DASH[i]).shape(rings, 'stroke')
    pg.dash()
  })
  pg.lineWidth(0.3).stroke(OVER_INK)
  for (const s of d.shadows) if (s.shadow?.over.rings.length) pg.shape(paper(s.shadow.over.rings), 'stroke')
}

/** Each shadow's time at its far end, a little past it, away from the sun. */
export function drawShadowLabels({ pg, toPaper }: ShadowSheetArgs, d: ShadowDiagram) {
  d.shadows.forEach((s, i) => {
    if (!s.shadow?.rings.length) return
    const b = (gridBearing(s.sun.azimuth, d.location) * Math.PI) / 180
    const tip = s.shadow.tip
    const a = toPaper(tip)
    const c = toPaper([tip[0] - Math.sin(b), tip[1] - Math.cos(b)])
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1
    const off = 3.5
    pg.text(a[0] + ((c[0] - a[0]) / len) * off, a[1] + ((c[1] - a[1]) / len) * off, hourText(s.minutes), { size: 3, font: 'bold', align: 'center', baseline: 'middle', color: INKS[i] })
  })
}

/** What each time's shadow is, in words: "sun 19° up in the north-east; 152 m², 3.1 m² over the south boundary". */
export function shadowLine(s: ShadowDiagram['shadows'][number]): string {
  const sun = `sun ${Math.round(s.sun.elevation)}° up in the ${compassPoint(s.sun.azimuth)}`
  if (!s.shadow) return `${sun}; no shadow`
  const over = s.shadow.over.area >= OVER_MIN ? `, ${s.shadow.over.area.toFixed(1)} m² over ${boundaryText(s.shadow.over.sides)}` : ', all on the block'
  return `${sun}; shadow ${Math.round(s.shadow.area)} m²${over}`
}

/** The notes under the key: where, when, which north, and what the shadows fall on. */
export function shadowNotes(d: ShadowDiagram): string[] {
  const l = d.location
  const where = l.place ? `${l.place} (${coordsText(l)})` : coordsText(l)
  const north = l.trueNorth ? `North is the survey’s north, turned ${Math.abs(mgaConvergence(l.lat, l.lon)).toFixed(1)}° from MGA grid north to true north.` : 'North is the survey’s north, taken as true north.'
  return [
    `21 June at ${where}. Times are AEST (UTC+10), no daylight saving${inNsw(l) ? '' : '; this place may keep other time'}.`,
    north,
    'Cast by the walls and roof onto the surveyed ground, finished where cut or filled.',
    'Shadows are estimates. Trees, fences and neighbouring buildings are not shown.',
  ]
}

/** The key, its top right corner at (right, top). */
export function drawShadowKey(pg: PdfPage, right: number, top: number, d: ShadowDiagram) {
  const size = 2.5
  const lineH = 4.2
  const rows = d.shadows.map(s => ({ time: hourText(s.minutes), text: shadowLine(s) }))
  const notes = shadowNotes(d)
  const sw = 9
  const timeW = Math.max(...rows.map(r => textWidth(r.time, size, 'bold'))) + 2
  const textW = Math.max(textWidth('Shadows on 21 June', 2.8, 'bold'), ...rows.map(r => sw + 3 + timeW + textWidth(r.text, size)), sw + 3 + textWidth('Over the boundary, on the neighbours’ land', size), ...notes.map(n => textWidth(n, 2.2)))
  const w = textW + 6
  const h = 6 + (rows.length + 1) * lineH + 2 + notes.length * 3.4 + 2
  const x = right - w
  const y = top - h
  pg.lineWidth(0.25).stroke(LIGHT).fill([1, 1, 1]).rect(x, y, w, h, 'both')
  let cy = top - 5
  pg.text(x + 3, cy, 'Shadows on 21 June', { size: 2.8, font: 'bold' })
  cy -= lineH + 0.4
  rows.forEach((r, i) => {
    const box: P[] = [
      [x + 3, cy - 0.6],
      [x + 3 + sw, cy - 0.6],
      [x + 3 + sw, cy + 2.2],
      [x + 3, cy + 2.2],
    ]
    pg.save().clip([box])
    pg.lineWidth(0.15).stroke(INKS[i])
    hatch(pg, [box], HATCH[i])
    pg.restore()
    pg.lineWidth(0.35).stroke(INKS[i]).dash(DASH[i]).shape([box], 'stroke')
    pg.dash()
    pg.text(x + 3 + sw + 3, cy, r.time, { size, font: 'bold', color: INKS[i] })
    pg.text(x + 3 + sw + 3 + timeW, cy, r.text, { size })
    cy -= lineH
  })
  pg.lineWidth(0.3).stroke(OVER_INK).fill(OVER_FILL).rect(x + 3, cy - 0.6, sw, 2.8, 'both')
  pg.text(x + 3 + sw + 3, cy, 'Over the boundary, on the neighbours’ land', { size })
  cy -= lineH + 1
  for (const n of notes) {
    pg.text(x + 3, cy, n, { size: 2.2, color: GREY })
    cy -= 3.4
  }
}
