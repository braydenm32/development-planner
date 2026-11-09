// The DA document pack: one PDF to take to a town planner or designer as the start of a
// development application. A cover with the checklist of what a DA for a new house usually needs,
// then the drawings the plan set makes (src/share/plans.ts) in DA order, the cut and fill plan and
// the stormwater concept, and a summary of the checks with every fail and gap listed. Each sheet
// carries the pack's title block (./titleBlock.ts). It's a concept pack, never ready to lodge.
//
// The pack is a file the owner downloads; it may carry the site's address from the map placement,
// so it's never sent anywhere by the app.

import type { CheckResult, CheckStatus } from '../checks/types'
import type { Council } from '../checks/councils'
import { countChecks, countsWords } from '../checks/rules'
import type { PlanningFacts } from '../map/planning'
import { areaKind, sortedLevels } from '../plan/model'
import { PdfDocument, textWidth, wrapText, type Font, type PdfPage, type RGB } from '../share/pdfWriter'
import { northAngle, planSheets, sheetFrame, type PlanSetInput, type SheetFrame, type View } from '../share/plans'
import { checklistRows, DA_SOURCES, sourcesFor, STATUS_WORDS, type ChecklistRow, type DaSheet, type RowStatus } from './checklist'
import { drawTitleBlock, sheetNo, stripFor, titleText } from './titleBlock'

export interface DaPackInput extends PlanSetInput {
  /** The revision letter on every title block (src/da/model.ts). */
  revision: string
  /** The address and Lot/DP from the map placement (Site › Map); null when the block isn't on the map. */
  place: { address: string | null; lot: string | null } | null
  /** Who prepared it; blank on the sheets when there's no one to name. */
  preparedBy?: string | null
  /** What the NSW planning maps say about the lot, for the hazard rows; null when not read. */
  planning: PlanningFacts | null
  /** The council whose rules are on (Design › Checks), for its checklist and the DA checks. */
  council: Council | null
  /** The checks for a DA: the land's flags, then the council's rules (none without a council). */
  checks: CheckResult[]
  /** What the checks don't cover. */
  notChecked: string[]
}

export type PageKind = DaSheet | 'cover'

export interface PackPage {
  kind: PageKind
  /** "DA-03" */
  number: string
  name: string
}

interface Page {
  kind: PageKind
  name: string
  north: boolean
  draw: (pg: PdfPage) => View | null
}

const INK: RGB = [0.13, 0.15, 0.18]
const GREY: RGB = [0.45, 0.48, 0.52]
const LIGHT: RGB = [0.82, 0.84, 0.86]
const RED: RGB = [0.7, 0.15, 0.12]
const AMBER: RGB = [0.62, 0.42, 0.05]
const GREEN: RGB = [0.18, 0.44, 0.38]
const BLUE: RGB = [0.16, 0.36, 0.6]

/** The drawings' order in the pack. */
const ORDER: DaSheet[] = ['site', 'floor', 'roof', 'elevation', 'section', 'shadow', 'cutFill', 'stormwater']

const ROW_INK: Record<RowStatus, RGB> = { 'in-pack': GREEN, 'not-drawn': AMBER, others: BLUE }

/** The checks' words for each status, as Design › Checks shows them (src/shell/tabs/ChecksTab.tsx). */
const CHECK_WORDS: Record<CheckStatus, string> = { fail: 'Fails', warn: 'Check', unknown: 'Needs a fact', incomplete: 'Not drawn yet', pending: 'Pending', pass: 'Passes', info: 'For info' }
const CHECK_INK: Partial<Record<CheckStatus, RGB>> = { fail: RED, warn: AMBER, unknown: BLUE, incomplete: AMBER, pending: GREY }
/** The order the summary lists them in: fails first, never hidden. */
const LISTED: CheckStatus[] = ['fail', 'warn', 'unknown', 'incomplete', 'pending']

// ---------------------------------------------------------------------------
// Tables of words, laid out before drawing so the pages can be counted (and numbered) first.

interface Col {
  title: string
  /** Share of the table's width. */
  w: number
  font?: Font
}

interface Cell {
  text: string
  color?: RGB
  font?: Font
}

const SIZE = 2.5
const LINE = 3.3
const PAD = 1.6

function cellLines(c: Cell, col: Col, width: number): string[] {
  return c.text ? wrapText(c.text, col.w * width - 2 * PAD, SIZE, c.font ?? col.font) : ['']
}

const rowHeight = (cells: Cell[], cols: Col[], width: number) => Math.max(...cells.map((c, i) => cellLines(c, cols[i], width).length)) * LINE + 2 * PAD

/** Split rows into pages: `first` mm of room on the first page, `next` on the rest (each after the header row). */
function paginate(heights: number[], first: number, next: number): number[][] {
  const pages: number[][] = [[]]
  let room = first - LINE - 2 * PAD
  heights.forEach((h, i) => {
    if (h > room && pages[pages.length - 1].length) {
      pages.push([])
      room = next - LINE - 2 * PAD
    }
    pages[pages.length - 1].push(i)
    room -= h
  })
  return pages
}

/** A table from `top` down: a header row, then each row with a light rule under it. Returns the y under it. */
function drawTable(pg: PdfPage, x: number, top: number, width: number, cols: Col[], rows: Cell[][]): number {
  let y = top
  let cx = x
  pg.lineWidth(0.3).stroke(INK).line([x, y], [x + width, y])
  for (const c of cols) {
    pg.text(cx + PAD, y - PAD - SIZE * 0.8, c.title.toUpperCase(), { size: 2.1, font: 'bold', color: GREY })
    cx += c.w * width
  }
  y -= LINE + 2 * PAD
  pg.lineWidth(0.3).line([x, y], [x + width, y])
  for (const cells of rows) {
    const h = rowHeight(cells, cols, width)
    cx = x
    cells.forEach((c, i) => {
      let ly = y - PAD - SIZE * 0.8
      for (const l of cellLines(c, cols[i], width)) {
        pg.text(cx + PAD, ly, l, { size: SIZE, font: c.font ?? cols[i].font, color: c.color ?? INK })
        ly -= LINE
      }
      cx += cols[i].w * width
    })
    y -= h
    pg.lineWidth(0.15).stroke(LIGHT).line([x, y], [x + width, y])
  }
  return y
}

/** Words that may hold a long web address: wrapped at spaces, and an address too long for the line broken anywhere. */
function wrapAny(s: string, width: number, size: number): string[] {
  return wrapText(s, width, size).flatMap(line => {
    if (textWidth(line, size) <= width) return [line]
    const out: string[] = []
    let cur = ''
    for (const ch of line) {
      if (cur && textWidth(cur + ch, size) > width) {
        out.push(cur)
        cur = ''
      }
      cur += ch
    }
    if (cur) out.push(cur)
    return out
  })
}

// ---------------------------------------------------------------------------

const COVER_COLS: Col[] = [
  { title: 'Document', w: 0.34, font: 'bold' },
  { title: 'Status', w: 0.17 },
  { title: 'Sheet', w: 0.13 },
  { title: 'Where it comes from', w: 0.36 },
]

const CHECK_COLS: Col[] = [
  { title: 'Result', w: 0.13, font: 'bold' },
  { title: 'Check', w: 0.22, font: 'bold' },
  { title: 'Design / allowed', w: 0.25 },
  { title: 'Why, and the source', w: 0.4 },
]

function coverCells(r: ChecklistRow): Cell[] {
  return [{ text: `${r.title}${r.unverified ? ' *' : ''}` }, { text: STATUS_WORDS[r.status], color: ROW_INK[r.status], font: 'bold' }, { text: r.sheets ?? '' }, { text: r.detail, color: r.status === 'in-pack' ? GREY : INK }]
}

function checkCells(r: CheckResult): Cell[] {
  const value = [r.value?.replace(/\.$/, ''), r.limit ? `allowed: ${r.limit}` : ''].filter(Boolean).join('; ')
  const why = [r.note, `${r.source.clause} (${r.source.asAt})`].filter(Boolean).join(' ')
  return [{ text: CHECK_WORDS[r.status], color: CHECK_INK[r.status] ?? INK }, { text: r.title }, { text: value }, { text: why, color: GREY }]
}

/** The checks the summary lists, fails first. */
export function listedChecks(checks: CheckResult[]): CheckResult[] {
  return LISTED.flatMap(s => checks.filter(c => c.status === s))
}

/** Every page of the pack in order, numbered, with the cover's checklist. Works for a plan with nothing drawn yet. */
export function daPackLayout(input: DaPackInput): { pages: PackPage[]; rows: ChecklistRow[] } {
  const l = layout(input)
  return { pages: l.pages.map((p, i) => ({ kind: p.kind, number: sheetNo(i + 1), name: p.name })), rows: l.rows }
}

function layout(input: DaPackInput) {
  const frame = sheetFrame(input.paper, stripFor(input.paper))
  const { area } = frame
  // A floor with nothing on it yet is a Not drawn yet row, not a blank page. Elevations go before sections, as a DA lists them.
  const drawings: Page[] = planSheets(input, frame)
    .filter(s => !s.empty)
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    .map(s => ({ kind: s.kind, name: s.name, north: s.north, draw: s.draw }))

  // The checks summary, over as many pages as its rows need.
  const listed = listedChecks(input.checks)
  const checkRows = listed.map(checkCells)
  const checkHeights = checkRows.map(r => rowHeight(r, CHECK_COLS, area.w))
  const checkPages = paginate(checkHeights, area.h - CHECKS_HEAD - CHECKS_FOOT, area.h - 12 - CHECKS_FOOT)

  const driveway = input.plan.areas.some(a => a.level === sortedLevels(input.plan)[0]?.id && areaKind(a) === 'driveway')
  // The cover's rows need the sheet numbers, which need the cover's page count: start at one page and settle.
  let coverCount = 1
  let rows: ChecklistRow[] = []
  let coverPages: number[][] = [[]]
  for (let tries = 0; tries < 4; tries++) {
    const numbers: Partial<Record<DaSheet, string[]>> = {}
    let n = coverCount
    for (const d of drawings) (numbers[d.kind as DaSheet] ??= []).push(sheetNo(++n))
    numbers.checks = checkPages.map(() => sheetNo(++n))
    rows = checklistRows({ council: input.council?.id ?? null, planning: input.planning, sheets: numbers, driveway })
    const tableW = area.w * COVER_SPLIT
    coverPages = paginate(
      rows.map(r => rowHeight(coverCells(r), COVER_COLS, tableW)),
      area.h - COVER_HEAD,
      area.h - 12,
    )
    if (coverPages.length === coverCount) break
    coverCount = coverPages.length
  }

  const pages: Page[] = []
  coverPages.forEach((idx, i) =>
    pages.push({ kind: 'cover', name: i ? 'Cover and checklist (continued)' : 'Cover and checklist', north: false, draw: pg => (coverSheet(pg, frame, input, rows, idx, i, pages), null) }),
  )
  pages.push(...drawings)
  checkPages.forEach((idx, i) =>
    pages.push({
      kind: 'checks',
      name: i ? 'Checks summary (continued)' : 'Checks summary',
      north: false,
      draw: pg => (checksSheet(pg, frame, input, listed, checkRows, idx, i, i === checkPages.length - 1), null),
    }),
  )
  return { frame, pages, rows }
}

/** The DA pack as one PDF. */
export function daPackPdf(input: DaPackInput): Uint8Array {
  const { frame, pages } = layout(input)
  const doc = new PdfDocument(`${input.title}: DA document pack`)
  pages.forEach((p, i) => {
    const pg = doc.addPage(frame.W, frame.H)
    pg.round()
    const view = p.draw(pg)
    const text = titleText({
      project: input.title,
      address: input.place?.address ?? null,
      lot: input.place?.lot ?? null,
      sheet: p.name,
      n: i + 1,
      of: pages.length,
      scale: view?.scale ?? null,
      paper: input.paper,
      date: input.date,
      revision: input.revision,
      preparedBy: input.preparedBy ?? null,
    })
    drawTitleBlock(pg, frame, text, view, view && p.north ? northAngle(input.plan, view) : null)
  })
  return doc.output()
}

// ---------------------------------------------------------------------------
// The cover

/** The checklist table's share of the cover's width; the sheet list and sources take the rest. */
const COVER_SPLIT = 0.68
/** Room the cover's heading takes above the table (mm). */
const COVER_HEAD = 54
const CHECKS_HEAD = 26
const CHECKS_FOOT = 22

function coverSheet(pg: PdfPage, f: SheetFrame, input: DaPackInput, rows: ChecklistRow[], idx: number[], page: number, pages: Page[]) {
  const { area } = f
  const x = area.x
  const tableW = area.w * COVER_SPLIT
  let y = area.y + area.h - 2
  if (page === 0) {
    pg.text(x, y - 7, 'DA document pack', { size: 8, font: 'bold' })
    pg.text(x, y - 14, input.title, { size: 4.2 })
    // What it is, in a box that can't be missed.
    const lead = 'A concept pack, not ready to lodge.'
    const note =
      'A starting point for your town planner or designer. Check every sheet, and have the documents marked From someone else made by the people named. Your council’s own checklist on the day has the final word.'
    const lines = wrapText(note, tableW - 8, 2.8)
    const boxH = (lines.length + 1) * 3.8 + 4
    const boxTop = y - 18
    pg.lineWidth(0.4).stroke(RED).fill([1, 0.96, 0.95]).rect(x, boxTop - boxH, tableW, boxH, 'both')
    pg.text(x + 4, boxTop - 4.6, lead, { size: 2.8, font: 'bold', color: RED })
    lines.forEach((l, i) => pg.text(x + 4, boxTop - 4.6 - (i + 1) * 3.8, l, { size: 2.8 }))
    y = boxTop - boxH - 5
    const council = input.council
    const whose = council
      ? `Checklist for ${council.lga}: its DA lodgement checklist and the NSW application requirements.`
      : 'No council is switched on under Design › Checks, so this is the NSW application requirements and what the councils in the app commonly ask for.'
    pg.text(x, y, whose, { size: 2.6, color: GREY })
    y -= 4
    const hazards = input.planning
      ? 'Bushfire, flood, landslide and heritage reports are listed only where the NSW planning maps flag the lot.'
      : 'The block isn’t on the map, so bushfire, flood, landslide and heritage aren’t known: place it under Site › Map.'
    pg.text(x, y, hazards, { size: 2.6, color: GREY })
    y -= 3
  } else y -= 4
  const end = drawTable(
    pg,
    x,
    y,
    tableW,
    COVER_COLS,
    idx.map(i => coverCells(rows[i])),
  )
  if (rows.some(r => r.unverified) && idx.some(i => rows[i].unverified)) pg.text(x, end - 4, '* The checklist names it without saying what it shows: ask council.', { size: 2.3, color: GREY })

  if (page > 0) return
  // The sheets in the pack, then the sources, in the right-hand column.
  const rx = x + tableW + 8
  const rw = area.w - tableW - 8
  let ry = area.y + area.h - 6
  pg.text(rx, ry, 'SHEETS IN THIS PACK', { size: 2.2, font: 'bold', color: GREY })
  ry -= 5
  pages.forEach((p, i) => {
    pg.text(rx, ry, sheetNo(i + 1), { size: 2.6, font: 'bold' })
    for (const l of wrapText(p.name, rw - 14, 2.6)) {
      pg.text(rx + 14, ry, l, { size: 2.6 })
      ry -= 3.6
    }
  })
  ry -= 4
  pg.text(rx, ry, 'WHERE THE CHECKLIST COMES FROM', { size: 2.2, font: 'bold', color: GREY })
  ry -= 4.4
  for (const k of sourcesFor(input.council?.id ?? null)) {
    const s = DA_SOURCES[k]
    for (const l of wrapText(s.name, rw, 2.3, 'bold')) {
      pg.text(rx, ry, l, { size: 2.3, font: 'bold' })
      ry -= 3
    }
    for (const l of wrapAny(`${s.url} (read ${s.read})`, rw, 2.1)) {
      pg.text(rx, ry, l, { size: 2.1, color: GREY })
      ry -= 2.8
    }
    ry -= 1.6
  }
}

// ---------------------------------------------------------------------------
// The checks summary

function checksSheet(pg: PdfPage, f: SheetFrame, input: DaPackInput, listed: CheckResult[], cells: Cell[][], idx: number[], page: number, last: boolean) {
  const { area } = f
  const x = area.x
  let y = area.y + area.h - 2
  if (page === 0) {
    pg.text(x, y - 7, 'Checks summary', { size: 6, font: 'bold' })
    const against = input.council ? `Checked against ${input.council.rules} for a development application.` : 'No council’s rules are switched on, so the DA rules weren’t checked: switch on your council under Design › Checks.'
    pg.text(x, y - 13, against, { size: 2.8 })
    const tally = countChecks(input.checks)
    // Design › Checks' words, zeros too, so "0 fails" reads as checked rather than left out.
    const counts = countsWords(tally, true).join(' · ')
    pg.text(x, y - 18.5, counts, { size: 2.8, font: 'bold', color: tally.fail ? RED : INK })
    pg.text(x, y - 23, 'Every result that isn’t a pass is listed below, fails first. Passes are counted, not listed.', { size: 2.5, color: GREY })
    y -= CHECKS_HEAD
  } else y -= 4
  let end = y
  if (listed.length) end = drawTable(pg, x, y, area.w, CHECK_COLS, idx.map(i => cells[i]))
  else {
    pg.text(x, y - 4, input.checks.length ? 'Nothing fails, and nothing is waiting for a fact or a drawing.' : 'There are no checks to show yet.', { size: 2.8 })
    end = y - 6
  }
  if (!last) return
  // What the checks don't cover, so a short list isn't read as approval.
  let fy = end - 5
  const notes = [
    input.planning ? null : 'The land’s zone, heritage and hazards aren’t checked: the block isn’t on the map (Site › Map).',
    input.notChecked.length ? `Not checked by the app: ${input.notChecked.join('; ')}.` : null,
    'These are estimates from a concept plan. Your council, certifier and town planner have the final word.',
  ].filter((t): t is string => !!t)
  for (const n of notes) {
    for (const l of wrapText(n, area.w, 2.4)) {
      if (fy < area.y + 2) return
      pg.text(x, fy, l, { size: 2.4, color: GREY })
      fy -= 3.2
    }
    fy -= 1
  }
}
