// The DA pack's title block, along the bottom of every sheet: the project and the site, the sheet
// and its number, the scale with a scale bar and north point, the date, revision and who prepared
// it, and that it's a concept with the app's one caveat. The words are worked out apart from the
// drawing so they can be tested without reading a PDF.

import { CAVEAT_LINE } from '../legal/caveat'
import { wrapText, type PdfPage, type RGB } from '../share/pdfWriter'
import { drawNorthArrow, drawScaleBar, type SheetFrame, type View } from '../share/plans'

export interface TitleInfo {
  project: string
  /** The site's street address, from the map placement (Site › Map), when it was found by address. */
  address: string | null
  /** "Lot 4 DP12345", from the map placement. */
  lot: string | null
  sheet: string
  /** Its place in the pack, counted from 1, and how many sheets there are. */
  n: number
  of: number
  /** The drawing's scale (1:100), or null for a sheet of words. */
  scale: number | null
  paper: string
  date: string
  revision: string
  /** Who prepared it; blank for them to write in. */
  preparedBy: string | null
}

export const NOT_SET = 'Site address not set'
export const CONCEPT = 'Concept only: not for construction'

const pad = (n: number) => String(n).padStart(2, '0')

/** "DA-03": a sheet's number in the pack. */
export const sheetNo = (n: number) => `DA-${pad(n)}`

/** "DA-03 of 09". */
export const sheetOf = (n: number, of: number) => `${sheetNo(n)} of ${pad(of)}`

export interface TitleText {
  project: string
  /** One or two lines: the address and the Lot/DP, or "Site address not set". */
  site: string[]
  sheet: string
  number: string
  scale: string
  date: string
  revision: string
  preparedBy: string
  concept: string
  caveat: string
}

/** The title block's words for a sheet. */
export function titleText(i: TitleInfo): TitleText {
  const site = [i.address?.trim() || NOT_SET, ...(i.lot ? [i.lot] : [])]
  return {
    project: i.project,
    site,
    sheet: i.sheet,
    number: sheetOf(i.n, i.of),
    scale: i.scale ? `1:${i.scale} at ${i.paper}` : `Not to scale, ${i.paper}`,
    date: i.date,
    revision: i.revision,
    preparedBy: i.preparedBy?.trim() ?? '',
    concept: CONCEPT,
    caveat: CAVEAT_LINE,
  }
}

const INK: RGB = [0.13, 0.15, 0.18]
const GREY: RGB = [0.45, 0.48, 0.52]
const RED: RGB = [0.7, 0.15, 0.12]

/** The strip the title block takes at the bottom of the frame (mm). */
export const stripFor = (paper: string) => (paper === 'A4' ? 30 : 34)

/**
 * The frame and the title block. `view` gives the scale bar (none on a sheet of words) and `north`
 * the north point's paper angle in radians (none on sections, elevations and words).
 */
export function drawTitleBlock(pg: PdfPage, f: SheetFrame, text: TitleText, view: View | null, north: number | null) {
  const { W, H, margin: m, strip } = f
  const t = f.small ? 0.82 : 1
  const w = W - 2 * m
  pg.lineWidth(0.5).stroke(INK).rect(m, m, w, H - 2 * m, 'stroke')
  pg.lineWidth(0.35).line([m, m + strip], [m + w, m + strip])

  // Cells, left to right: project and site, sheet, scale and north, date and revision, the concept note.
  const parts = [0.27, 0.19, 0.19, 0.14, 0.21]
  const xs = [m]
  for (const p of parts) xs.push(xs[xs.length - 1] + p * w)
  pg.lineWidth(0.25)
  for (const x of xs.slice(1, -1)) pg.line([x, m], [x, m + strip])
  const top = m + strip
  const pad = 3
  const label = (x: number, y: number, s: string) => pg.text(x, y, s.toUpperCase(), { size: 1.9 * t, color: GREY, font: 'bold' })
  const lineH = (size: number) => size * 1.3

  // Project and site
  {
    const x = xs[0] + pad
    const cw = xs[1] - xs[0] - 2 * pad
    label(x, top - 4.5 * t, 'Project')
    let y = top - 10 * t
    for (const l of wrapText(text.project, cw, 3.8 * t, 'bold').slice(0, 2)) {
      pg.text(x, y, l, { size: 3.8 * t, font: 'bold' })
      y -= lineH(3.8 * t)
    }
    y -= 1
    label(x, y, 'Site')
    y -= 4 * t
    for (const s of text.site) {
      for (const l of wrapText(s, cw, 2.8 * t).slice(0, 2)) {
        pg.text(x, y, l, { size: 2.8 * t, color: s === NOT_SET ? GREY : INK })
        y -= lineH(2.8 * t)
      }
    }
  }

  // Sheet
  {
    const x = xs[1] + pad
    const cw = xs[2] - xs[1] - 2 * pad
    label(x, top - 4.5 * t, 'Sheet')
    let y = top - 10 * t
    for (const l of wrapText(text.sheet, cw, 3.4 * t, 'bold').slice(0, 3)) {
      pg.text(x, y, l, { size: 3.4 * t, font: 'bold' })
      y -= lineH(3.4 * t)
    }
    pg.text(x, m + 4.5, text.number, { size: 4.4 * t, font: 'bold' })
  }

  // Scale and north
  {
    const x = xs[2] + pad
    const cw = xs[3] - xs[2] - 2 * pad
    label(x, top - 4.5 * t, 'Scale and north')
    pg.text(x, top - 10 * t, text.scale, { size: 3 * t })
    const r = strip * 0.2
    const ax = xs[3] - pad - r * 1.1
    const ay = m + strip * 0.4
    if (view) {
      // The bar sits left of the north point, inside the cell; drawScaleBar centres it.
      const room = cw - (north === null ? 4 : r * 2.6 + 4)
      drawScaleBar(pg, view, x + 2 + room / 2, m + 5, t, room)
    }
    if (north !== null) drawNorthArrow(pg, north, ax, ay, r, t)
  }

  // Date, revision, prepared by
  {
    const x = xs[3] + pad
    const cw = xs[4] - xs[3] - 2 * pad
    const rows: [string, string][] = [
      ['Date', text.date],
      ['Revision', text.revision],
    ]
    let y = top - 4.5 * t
    for (const [k, v] of rows) {
      label(x, y, k)
      pg.text(x, y - 4 * t, v, { size: 3 * t, font: k === 'Revision' ? 'bold' : 'regular' })
      y -= 9 * t
    }
    label(x, y, 'Prepared by')
    if (text.preparedBy) pg.text(x, y - 4 * t, text.preparedBy, { size: 2.8 * t })
    else pg.lineWidth(0.2).stroke(GREY).line([x, y - 4.6 * t], [x + cw, y - 4.6 * t])
  }

  // Concept only, and the caveat
  {
    const x = xs[4] + pad
    const cw = xs[5] - xs[4] - 2 * pad
    let y = top - 6 * t
    for (const l of wrapText(text.concept, cw, 3.2 * t, 'bold')) {
      pg.text(x, y, l, { size: 3.2 * t, font: 'bold', color: RED })
      y -= lineH(3.2 * t)
    }
    y -= 0.6
    for (const l of wrapText(text.caveat, cw, 2.1 * t)) {
      pg.text(x, y, l, { size: 2.1 * t, color: GREY })
      y -= lineH(2.1 * t)
    }
  }
}
