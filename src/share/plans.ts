import { pageKey } from './pages'
import { houseOnSite } from './siteHouse'
import { CAVEAT_LINE } from '../legal/caveat'
import { DRIVE_RUN, driveVerdict, drivewayGrade, gradeText } from '../lib/drape'
import { centroidOf, pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import { planTurn } from '../lib/orientation'
import type { Survey } from '../lib/survey'
import { furnitureCorners, furnitureSymbol } from '../plan/furniture'
import { levelSummaries } from '../plan/keyNumbers'
import { buildingFootprint, buildingOutline, planarFaces, roomShape, sliceAlong, wallPolygons } from '../plan/geometry'
import {
  areaKind,
  floorRL,
  fromSite,
  houseWalls,
  isRetaining,
  pointOnWall,
  sortedLevels,
  wallDir,
  wallLength,
  type AreaKind,
  type Furniture,
  type Level,
  type Opening,
  type Plan,
  type Wall,
} from '../plan/model'
import { CHANGED, contourText, labelPoint, type ContourRun, type FinishedContours } from '../plan/finishedContours'
import { superlevel } from '../plan/groundOverlay'
import { onNaturalGround, roomFloorNote } from '../plan/floorTypes'
import { driveDesign, driveEndPoints, driveGround, type DriveGround } from '../plan/driveway'
import { garageDoorSymbol } from '../plan/garageDoor'
import { styleSymbol } from '../plan/openingStyles'
import { setbackDims } from '../plan/setbacks'
import { retainingProfiles } from '../plan/retaining'
import type { Heightfield, Terrain } from '../lib/terrain'
import { roofGeometry } from '../plan/roof'
import { stairLayout } from '../plan/stairs'
import type { SiteFeature } from '../site/model'
import { drawFeatureAreas, drawFeatureLegend, drawFeatureMarks, sheetFeatures, type SheetArgs } from '../site/sheet'
import type { SiteWarning } from '../site/warnings'
import type { StormwaterSheet } from '../drainage/stormwater'
import type { ShadowDiagram } from '../sun/facts'
import { drawShadowKey, drawShadowLabels, drawShadows } from '../sun/sheet'
import { PdfDocument, textWidth, wrapText, type PdfPage, type RGB } from './pdfWriter'
import { sectionsOf } from '../sections/lines'
import { drawingSheets, drawSectionMarks } from '../sections/sheets'
import { roofCoveredBy, roofEavesRL } from '../plan/roofline'
import { sketchPolyline } from '../sketch/geometry'
import { sketchOf } from '../sketch/ops'
import { colourOf, sketchLegend, SKETCH_PAINT } from '../sketch/colours'

export type Paper = 'A3' | 'A4'

export interface PlanSetInput {
  plan: Plan
  survey: Survey
  /** Site area (m²), for coverage. */
  siteArea: number
  /** Cut and fill volumes (m³), if worked out. */
  earthworks: { cut: number; fill: number; maxCut?: number; maxFill?: number } | null
  /** The finished ground, for the heights of retaining walls. */
  ground?: Heightfield
  /** The finished ground with the driveways graded in, for their grades (from the cut and fill). */
  drive?: DriveGround
  /** The finished ground's contours, drawn on the site plan when the ground is cut or filled. */
  contours?: FinishedContours | null
  up: 'house' | number
  paper: Paper
  /** Draw the furniture on the floor plans (on unless false). */
  furniture?: boolean
  /** Draw the sketch layer (sketch lines and kept measurements) on every floor plan; off unless true. */
  sketch?: boolean
  title: string
  date: string
  /** Site features to draw on the site plan (survey local frame), and the warnings about them. */
  site?: { features: SiteFeature[]; warnings: SiteWarning[] }
  /** The stormwater concept: a dashed path on the site plan and its key numbers (src/drainage). */
  stormwater?: StormwaterSheet | null
  /** The natural ground, for the sections and elevations; without it they're left out. */
  terrain?: Terrain
  /** The house's shadows on 21 June, for a shadow diagram sheet (src/sun); none without. */
  shadows?: ShadowDiagram | null
  /** Pages of the plan set left unticked in Share › Plans, by their keys (./pages.ts). The DA pack keeps every page. */
  leaveOut?: readonly string[]
  /** The scale of the floor and roof plans: Auto (or missing) fits them, a number prints 1:that. */
  floorScale?: FloorScale
}

/** The scale choices for the floor and roof plans in Share › Plans. */
export type FloorScale = 'auto' | 50 | 100 | 200
export const FLOOR_SCALES: readonly FloorScale[] = ['auto', 50, 100, 200]
/** A saved choice read back: anything else is Auto. */
export const floorScaleOf = (v: unknown): FloorScale => (v === 50 || v === 100 || v === 200 ? v : 'auto')

const PAPER: Record<Paper, [number, number]> = { A3: [420, 297], A4: [297, 210] }
const SCALES = [20, 50, 100, 200, 250, 500, 1000, 2000]

const INK: RGB = [0.13, 0.15, 0.18]
const GREY: RGB = [0.45, 0.48, 0.52]
const LIGHT: RGB = [0.75, 0.77, 0.8]
const ACCENT: RGB = [0.18, 0.44, 0.38]
const AREA_FILL: Record<AreaKind, RGB> = {
  slab: [0.86, 0.86, 0.84],
  driveway: [0.8, 0.8, 0.78],
  deck: [0.87, 0.78, 0.66],
  garden: [0.82, 0.9, 0.76],
}
const RW_FILL: RGB = [0.72, 0.66, 0.56]
const NATURAL_MAJOR: RGB = [0.62, 0.55, 0.45]
const NATURAL_MINOR: RGB = [0.8, 0.76, 0.7]
const STORM: RGB = [0.12, 0.44, 0.7]
/** Cut and fill on the DA pack's cut and fill plan: warm where the ground is lowered, blue where it's raised. */
const CUT_TINT: RGB = [0.96, 0.82, 0.66]
const FILL_TINT: RGB = [0.74, 0.85, 0.95]
const FURNITURE: RGB = [0.42, 0.45, 0.5]
const AREA_LABEL: Record<AreaKind, string> = { slab: 'Concrete slab', driveway: 'Driveway', deck: 'Deck', garden: 'Garden' }

const mm = (m: number) => Math.round(m * 1000).toString()
const upright = (deg: number) => {
  let a = deg
  while (a > 90) a -= 180
  while (a <= -90) a += 180
  return a
}

/** Plan coordinates (house frame, metres) to paper millimetres. */
export interface View {
  P: (p: Vec2) => [number, number]
  scale: number
  /** Paper angle (degrees) of a plan direction. */
  angle: (d: Vec2) => number
  /** Paper millimetres per metre. */
  k: number
}

/** Fits `points` in `area` at the first standard scale from `prefer` up that holds them; with `exact`, at 1:`prefer` whether they fit or not. */
function makeView(points: Vec2[], rho: number, area: { x: number; y: number; w: number; h: number }, prefer: number, exact = false): View {
  const c = Math.cos(rho)
  const s = Math.sin(rho)
  const rot = (p: Vec2): Vec2 => [p[0] * c - p[1] * s, p[0] * s + p[1] * c]
  const r = points.map(rot)
  const minX = Math.min(...r.map(p => p[0]))
  const maxX = Math.max(...r.map(p => p[0]))
  const minY = Math.min(...r.map(p => p[1]))
  const maxY = Math.max(...r.map(p => p[1]))
  const w = Math.max(maxX - minX, 1)
  const h = Math.max(maxY - minY, 1)
  const scale = exact ? prefer : (SCALES.find(sc => sc >= prefer && (w * 1000) / sc <= area.w * 0.9 && (h * 1000) / sc <= area.h * 0.9) ?? SCALES[SCALES.length - 1])
  const k = 1000 / scale
  const mx = (minX + maxX) / 2
  const my = (minY + maxY) / 2
  const ox = area.x + area.w / 2
  const oy = area.y + area.h / 2
  return {
    scale,
    k,
    P: p => {
      const q = rot(p)
      return [ox + (q[0] - mx) * k, oy + (q[1] - my) * k]
    },
    angle: d => (Math.atan2(d[0] * s + d[1] * c, d[0] * c - d[1] * s) * 180) / Math.PI,
  }
}

/** A label's box on the paper (mm): [x0, y0, x1, y1]. */
type Box = [number, number, number, number]

/** The box a line of text takes as PdfPage.text places it; turned text gets the box around it. */
function textBox(x: number, y: number, s: string, size: number, o: { font?: 'regular' | 'bold'; align?: 'left' | 'center' | 'right'; baseline?: 'alphabetic' | 'middle'; angle?: number } = {}): Box {
  const w = textWidth(s, size, o.font)
  const dx = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0
  const dy = o.baseline === 'middle' ? -size * 0.35 : 0
  const a = ((o.angle ?? 0) * Math.PI) / 180
  const c = Math.cos(a)
  const sn = Math.sin(a)
  const xs: number[] = []
  const ys: number[] = []
  for (const [u, v] of [
    [dx, dy - size * 0.2],
    [dx + w, dy - size * 0.2],
    [dx + w, dy + size * 0.75],
    [dx, dy + size * 0.75],
  ]) {
    xs.push(x + u * c - v * sn)
    ys.push(y + u * sn + v * c)
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/** Do two labels touch, or come within half a millimetre? */
const overlaps = (a: Box, b: Box) => a[0] < b[2] + 0.5 && a[2] + 0.5 > b[0] && a[1] < b[3] + 0.5 && a[3] + 0.5 > b[1]

/** Does the line from a to b, drawn `half` thick each side, run through the box? */
function lineThroughBox(a: [number, number], b: [number, number], half: number, box: Box): boolean {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  let t0 = 0
  let t1 = 1
  for (const [q, d] of [
    [a[0] - (box[0] - half), -dx],
    [box[2] + half - a[0], dx],
    [a[1] - (box[1] - half), -dy],
    [box[3] + half - a[1], dy],
  ]) {
    if (Math.abs(d) < 1e-12) {
      if (q < 0) return false
      continue
    }
    const t = q / d
    if (d < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
  }
  return t0 <= t1
}
/** Is this box clear of every label already placed? */
const clearOf = (taken: Box[], ...boxes: Box[]) => boxes.every(b => !taken.some(t => overlaps(t, b)))

/**
 * What a floor plan sheet has to fit: the level's walls and its stairs. Outdoor areas, retaining
 * walls and sketch lines can reach across the block (they are on the site plan); on a floor plan
 * they are drawn as far as the sheet goes. A level with no house on it fits whatever it has.
 */
function floorExtent(plan: Plan, level: string, furniture: boolean): Vec2[] {
  const walls = houseWalls(plan.walls.filter(w => w.level === level))
  const house = [...walls.flatMap(w => [w.a, w.b]), ...buildingOutline(planarFaces(walls)).outlines.flat(), ...plan.stairs.filter(x => x.level === level).flatMap(x => stairLayout(x).outline)]
  if (house.length) return house
  const rest = [
    ...plan.areas.filter(a => a.level === level).flatMap(a => a.pts),
    ...plan.walls.filter(w => w.level === level).flatMap(w => [w.a, w.b]),
    ...(furniture ? plan.furniture.filter(f => f.level === level).flatMap(furnitureCorners) : []),
  ]
  return rest.length
    ? rest
    : [
        [0, 0],
        [5, 5],
      ]
}

/**
 * The one scale Auto prints every floor plan and the roof plan at, so the sheets lay over each
 * other: the largest of 1:50, 1:100, 1:200 … that fits the biggest of them in the drawing area.
 */
export function autoFloorScale(plan: Plan, up: 'house' | number, area: SheetFrame['area'], furniture = true): number {
  const rho = planTurn(up, plan.placement.rotation)
  const scales = sortedLevels(plan)
    .filter(l => [...plan.walls, ...plan.areas, ...plan.stairs].some(x => x.level === l.id))
    .map(l => makeView(floorExtent(plan, l.id, furniture), rho, area, 50).scale)
  const roofs = plan.roofs.map(r => roofGeometry(r)).filter(g => !g.error && g.outline.length >= 3)
  if (roofs.length) scales.push(makeView(roofs.flatMap(g => g.outline), rho, area, 50).scale)
  return Math.max(50, ...scales)
}

/** Where the drawings go on a sheet: the paper, its frame, and the strip the title block takes at the bottom. */
export interface SheetFrame {
  paper: Paper
  W: number
  H: number
  margin: number
  /** Height of the title block strip along the bottom of the frame (mm). */
  strip: number
  small: boolean
  /** The drawing area, above the strip. */
  area: { x: number; y: number; w: number; h: number }
}

/** The plan set's frame on this paper; the DA pack asks for a taller strip for its title block. */
export function sheetFrame(paper: Paper, strip?: number): SheetFrame {
  const [W, H] = PAPER[paper]
  const small = paper === 'A4'
  const margin = 10
  const s = strip ?? (small ? 22 : 26)
  return { paper, W, H, margin, strip: s, small, area: { x: margin + 4, y: margin + s + 6, w: W - 2 * margin - 8, h: H - 2 * margin - s - 10 } }
}

/** What a sheet shows, so the DA pack can put them in its own order and say which it has. */
export type SheetKind = 'site' | 'floor' | 'roof' | 'section' | 'elevation' | 'shadow' | 'cutFill' | 'stormwater'

export interface PlanSheet {
  kind: SheetKind
  /** Which page of Share › Plans' list it is (./pages.ts): its kind, or each floor its own. */
  key: string
  name: string
  /** Sections and elevations have no north arrow. */
  north: boolean
  /** Nothing drawn on it yet (a floor with no walls): the DA pack leaves it out and lists it as not drawn. */
  empty?: boolean
  draw: (pg: PdfPage) => View
}

/**
 * A scale bar of five blocks, a round length at least 30 mm long (or the longest that fits in `max` mm),
 * centred on `cx` with its base at `y`. Returns its ends.
 */
export function drawScaleBar(pg: PdfPage, view: View, cx: number, y: number, t = 1, max?: number): { x0: number; x1: number } {
  const lengths = [0.5, 1, 2, 5, 10, 20, 50, 100]
  const L = max === undefined ? (lengths.find(l => l * view.k >= 30) ?? 100) : ([...lengths].reverse().find(l => l * view.k <= max) ?? lengths[0])
  const bw = L * view.k
  const bx = cx - bw / 2
  for (let i = 0; i < 5; i++) {
    pg.lineWidth(0.2).stroke(INK).fill(i % 2 ? [1, 1, 1] : INK)
    pg.rect(bx + (bw * i) / 5, y, bw / 5, 1.6, 'both')
  }
  pg.text(bx, y + 3.2, '0', { size: 2.4 * t, align: 'center' })
  pg.text(bx + bw, y + 3.2, `${L} m`, { size: 2.4 * t, align: 'center' })
  return { x0: bx, x1: bx + bw }
}

/** A north arrow in a circle of radius `r` at (ax, ay), pointing `north` radians anticlockwise from the paper's x axis. */
export function drawNorthArrow(pg: PdfPage, north: number, ax: number, ay: number, r: number, t = 1) {
  const tip: [number, number] = [ax + Math.cos(north) * r, ay + Math.sin(north) * r]
  const back = (a: number, d: number): [number, number] => [ax + Math.cos(north + a) * d, ay + Math.sin(north + a) * d]
  pg.lineWidth(0.25).stroke(INK).circle(ax, ay, r * 1.05, 'stroke')
  pg.fill(INK).shape([[tip, back(2.6, r * 0.7), [ax, ay], back(-2.6, r * 0.7)]], 'fill')
  pg.text(tip[0] + Math.cos(north) * 2.5, tip[1] + Math.sin(north) * 2.5, 'N', { size: 3 * t, font: 'bold', align: 'center', baseline: 'middle' })
}

/** Paper angle (radians) of north on a sheet of this plan drawn with `view`. */
export function northAngle(plan: Plan, view: View): number {
  const t = (plan.placement.rotation * Math.PI) / 180
  // Site north (0, 1) turned into the house frame.
  return view.angle([Math.sin(t), Math.cos(t)]) * (Math.PI / 180)
}

/** Every sheet of drawings for the house as one PDF. */
export function planSetPdf(input: PlanSetInput): Uint8Array {
  const frame = sheetFrame(input.paper)
  const { W, H, margin, strip, small } = frame
  const doc = new PdfDocument(input.title)
  // The cut and fill plan and the stormwater sheet are the DA pack's own (src/da); here both are on the site plan.
  const leaveOut = input.leaveOut ?? []
  const sheets = planSheets(input, frame).filter(s => s.kind !== 'cutFill' && s.kind !== 'stormwater' && !leaveOut.includes(s.key))
  if (!sheets.length) throw new Error('Tick at least one page to put in the PDF.')
  sheets.forEach((sheet, i) => {
    const pg = doc.addPage(W, H)
    pg.round()
    const view = sheet.draw(pg)
    titleBlock(pg, sheet.name, view, i + 1, sheets.length, sheet.north)
  })
  return doc.output()

  function titleBlock(pg: PdfPage, name: string, view: View, n: number, of: number, northArrow: boolean) {
    const x0 = margin
    const y0 = margin
    const w = W - 2 * margin
    pg.lineWidth(0.5).stroke(INK).rect(margin, margin, W - 2 * margin, H - 2 * margin, 'stroke')
    pg.lineWidth(0.35).line([x0, y0 + strip], [x0 + w, y0 + strip])
    const t = small ? 0.85 : 1
    pg.text(x0 + 5, y0 + strip - 9 * t, input.title, { size: 5 * t, font: 'bold' })
    pg.text(x0 + 5, y0 + strip - 16 * t, name, { size: 4 * t })
    pg.text(x0 + 5, y0 + 4, 'Concept plan only. Check all dimensions and levels on site before building.', { size: 2.2 * t, color: GREY })
    // The one caveat every result carries out of the app, in the margin under the frame.
    pg.text(x0, y0 - 4.5, CAVEAT_LINE, { size: 2.2 * t, color: GREY })

    // Scale, north arrow and sheet number on the right.
    const right = x0 + w - 5
    pg.text(right, y0 + strip - 9 * t, `Sheet ${n} of ${of}`, { size: 3.2 * t, align: 'right', font: 'bold' })
    pg.text(right, y0 + strip - 15 * t, `Scale 1:${view.scale} at ${input.paper}`, { size: 3 * t, align: 'right' })
    pg.text(right, y0 + strip - 20.5 * t, input.date, { size: 2.6 * t, align: 'right', color: GREY })

    const bar = drawScaleBar(pg, view, x0 + w * 0.5, y0 + strip / 2 - 1, t)
    // North arrow (sections and elevations have none)
    if (northArrow) drawNorthArrow(pg, northAngle(input.plan, view), bar.x1 + 22, y0 + strip / 2, strip * 0.26, t)
  }
}

/**
 * Each sheet the house's drawings can make, in the plan set's order, ready to draw on a page of
 * `frame`: the plan set (above) and the DA pack (src/da/pack.ts) both draw from these, each with
 * its own title block.
 */
export function planSheets(input: PlanSetInput, frame: SheetFrame): PlanSheet[] {
  const { plan, survey } = input
  const { W, H, margin, strip, area } = frame
  const rho = planTurn(input.up, plan.placement.rotation)
  const levels = sortedLevels(plan)
  const outlineOf = (l: Level) => buildingOutline(planarFaces(plan.walls.filter(w => w.level === l.id))).outlines
  // The building on the block: every level on the ground, and the upper storeys (./siteHouse.ts).
  const house = houseOnSite(plan)
  // Every floor plan and the roof plan at one scale: the one picked, or the one that fits them all.
  const floorScale = input.floorScale && input.floorScale !== 'auto' ? input.floorScale : autoFloorScale(plan, input.up, area, input.furniture !== false)
  const areaBox: [number, number][] = [
    [area.x, area.y],
    [area.x + area.w, area.y],
    [area.x + area.w, area.y + area.h],
    [area.x, area.y + area.h],
  ]
  const roofs = plan.roofs.map(r => ({ roof: r, g: roofGeometry(r) })).filter(x => !x.g.error && x.g.outline.length >= 3)
  const retaining = plan.walls.filter(isRetaining)
  const retainingPolys = wallPolygons(retaining)
  const profiles = input.ground ? retainingProfiles(plan, survey.origin, input.ground) : []

  const sheets: PlanSheet[] = []
  sheets.push({ kind: 'site', key: 'site', name: 'Site plan', north: true, draw: pg => siteSheet(pg) })
  for (const l of levels) {
    const empty = ![...plan.walls, ...plan.areas, ...plan.stairs].some(x => x.level === l.id)
    sheets.push({ kind: 'floor', key: pageKey('floor', l.id), name: `${l.name} plan`, north: true, empty, draw: pg => floorSheet(pg, l) })
  }
  if (roofs.length) sheets.push({ kind: 'roof', key: 'roof', name: 'Roof plan', north: true, draw: pg => roofSheet(pg) })
  // Sections and elevations (src/sections), at their own scale, with no north arrow.
  if (input.terrain) {
    for (const s of drawingSheets({ plan, survey, terrain: input.terrain, finished: input.ground }, area)) {
      sheets.push({ kind: s.kind, key: s.kind, name: s.name, north: false, draw: pg => (s.draw(pg), { scale: s.scale, k: 1000 / s.scale, P: p => [p[0], p[1]], angle: () => 90 }) })
    }
  }
  const shadows = input.shadows
  if (shadows?.shadows.some(x => x.shadow)) sheets.push({ kind: 'shadow', key: 'shadow', name: 'Shadow diagram, 21 June', north: true, draw: pg => shadowSheet(pg, shadows) })
  // The DA pack's two: cut and fill once the ground is cut or filled, and the stormwater concept once there is one.
  const natural = input.terrain?.grid
  const finished = input.ground
  if (input.earthworks && natural && finished && natural !== finished && input.contours?.any) {
    sheets.push({ kind: 'cutFill', key: 'cutFill', name: 'Cut and fill plan', north: true, draw: pg => cutFillSheet(pg, natural, finished) })
  }
  const storm = input.stormwater
  if (storm) sheets.push({ kind: 'stormwater', key: 'stormwater', name: 'Stormwater concept', north: true, draw: pg => stormwaterPlanSheet(pg, storm) })
  return sheets

  // ---------------------------------------------------------------------------

  /**
   * A length written along a line, on its outside. With `taken` (the labels already on the sheet),
   * it is left off where it would print over one (or where `blocked` says something else is drawn),
   * and added to them where it is drawn. Says whether it drew.
   */
  function along(pg: PdfPage, view: View, a: Vec2, b: Vec2, text: string, offset: number, size: number, color: RGB = INK, taken?: Box[], blocked?: (b: Box) => boolean): boolean {
    const pa = view.P(a)
    const pb = view.P(b)
    const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1])
    if (len < textWidth(text, size) + 2) return false
    const ang = (Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) * 180) / Math.PI
    const nx = -(pb[1] - pa[1]) / len
    const ny = (pb[0] - pa[0]) / len
    const x = (pa[0] + pb[0]) / 2 + nx * offset
    const y = (pa[1] + pb[1]) / 2 + ny * offset
    const o = { size, angle: upright(ang), align: 'center', baseline: 'middle', color } as const
    if (taken) {
      const box = textBox(x, y, text, size, o)
      if (!clearOf(taken, box) || blocked?.(box)) return false
      taken.push(box)
    }
    pg.text(x, y, text, o)
    return true
  }

  function ring(view: View, r: Vec2[]): [number, number][] {
    return r.map(view.P)
  }

  // ---- Site plan ----
  function siteSheet(pg: PdfPage): View {
    const tf = (p: Vec2) => fromSite(p, plan.placement, survey.origin)
    const boundary = survey.boundary.map(tf)
    const view = makeView([...boundary, ...house.rings.flat()], rho, area, 100)
    const features = input.site ? sheetFeatures(input.site.features, survey.boundary) : []
    const marks: SheetArgs = {
      pg,
      toPaper: p => view.P(tf(p)),
      k: view.k,
      clip: area,
      warned: new Set((input.site?.warnings ?? []).filter(w => w.severity === 'attn').map(w => w.feature)),
    }

    const fc = drawContours(pg, view, tf)

    drawFeatureAreas(marks, features)

    // Outdoor areas, whichever level they were drawn on: the floor plans show only what is near the house.
    for (const a of plan.areas) {
      const kind = areaKind(a)
      pg.lineWidth(0.2).stroke(GREY).fill(AREA_FILL[kind]).shape([ring(view, a.pts)], 'both')
      const c = view.P(centroidOf(a.pts))
      pg.text(c[0], c[1], a.name, { size: 2.4, align: 'center', baseline: 'middle', color: GREY })
    }

    houseOutline(pg, view, [0.8, 0.8, 0.8])
    // Over the house, so a wall between two split levels still shows with what it holds back.
    retainingWalls(pg, view, retaining, true)

    drawFeatureMarks(marks, features)

    // Boundary, with the length of each side.
    pg.lineWidth(0.6).stroke(INK).shape([ring(view, boundary)], 'stroke')
    const ccw = signedArea(boundary) > 0
    boundary.forEach((p, i) => {
      const q = boundary[(i + 1) % boundary.length]
      const len = Math.hypot(q[0] - p[0], q[1] - p[1])
      along(pg, view, ccw ? p : q, ccw ? q : p, `${len.toFixed(2)} m`, -3, 2.6)
    })

    // Setbacks: a dimension line from the house to each side, ticked at both ends. From every level's
    // outline, as Earthworks › Place and the checks measure them (the plan draws the same ones).
    for (const c of setbackDims(house.rings, plan.placement, survey)) {
      const a = tf(c.from)
      const b = tf(c.to)
      const pa = view.P(a)
      const pb = view.P(b)
      pg.lineWidth(0.25).stroke(ACCENT).line(pa, pb)
      const ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) + Math.PI / 4
      const t = 1.1
      for (const q of [pa, pb]) pg.lineWidth(0.35).line([q[0] - Math.cos(ang) * t, q[1] - Math.sin(ang) * t], [q[0] + Math.cos(ang) * t, q[1] + Math.sin(ang) * t])
      along(pg, view, a, b, c.text, 1.6, 2.4, ACCENT)
    }

    // Stormwater concept: a dashed line from the house to where the water goes, named as a concept.
    if (input.stormwater) stormPath(pg, view, tf, input.stormwater)

    // Key numbers
    const footprint = buildingFootprint(plan)
    const rows: [string, string][] = [
      ['Site area', `${input.siteArea.toFixed(0)} m²`],
      ['Building footprint, seen from above (all levels)', `${footprint.toFixed(2)} m²`],
      ['Site coverage', `${((footprint / Math.max(input.siteArea, 1)) * 100).toFixed(1)}%`],
      ...fflRows(),
    ]
    if (input.earthworks) rows.push(['Cut / fill', `${input.earthworks.cut.toFixed(1)} / ${input.earthworks.fill.toFixed(1)} m³`])
    if (profiles.length) {
      rows.push(['Retaining walls', `${profiles.reduce((t, p) => t + p.length, 0).toFixed(1)} m`])
      rows.push(['Retaining wall face', `${profiles.reduce((t, p) => t + p.faceArea, 0).toFixed(1)} m²`])
    }
    // Grade along each driveway on the finished ground, as its panel shows it.
    const drives = plan.areas.filter(a => areaKind(a) === 'driveway')
    for (const a of drives) {
      const name = drives.length > 1 ? `${a.name}: ` : ''
      // Built to its own levels: the grade between them, as Earthworks › Driveway shows it.
      const ends = input.ground ? driveEndPoints(plan, a, survey.origin, survey.boundary) : null
      const drive = input.drive ?? (input.ground ? driveGround(null, input.ground) : null)
      const design = ends && drive ? driveDesign(plan, a, ends, drive) : null
      if (design) {
        rows.push([`${name}Driveway, street to garage`, `RL ${design.street.toFixed(2)} to ${design.garage.toFixed(2)}`])
        rows.push([`${name}Driveway grade`, `${gradeText(design.grade.average)}${design.tooSteep ? `, ${driveVerdict(design.grade).toLowerCase()}` : ''}`])
        continue
      }
      // Along the drive's one direction, garage end to street end, as its panel measures it.
      const g = input.ground && ends ? drivewayGrade(input.ground, ends.poly, undefined, ends.along) : null
      if (!g) continue
      rows.push([`${name}Average grade along the drive`, gradeText(g.average)])
      rows.push([`${name}Steepest ${DRIVE_RUN} m along the drive`, gradeText(g.steepest)])
    }
    for (const row of input.stormwater?.rows ?? []) rows.push(row)
    // Wide enough for the longest label and value side by side.
    const every = fc ? (fc.minor < 1 ? `${Math.round(fc.minor * 1000)} mm` : `${fc.minor} m`) : ''
    const legend = fc ? [`Contours every ${every}, labelled every ${fc.major} m`, 'Finished ground, proposed', 'Natural ground, existing (dashed where cut or filled)'] : []
    const keyW = Math.max(54, ...rows.map(([k, v]) => textWidth(k, 2.6) + textWidth(v, 2.6) + 4), ...legend.map((t, i) => textWidth(t, 2.6) + (i ? 10 : 0)))
    const bx = W - margin - keyW - 8
    let by = H - margin - 8
    pg.lineWidth(0.25).stroke(LIGHT).fill([1, 1, 1]).rect(bx - 3, by - rows.length * 4.6 - 1, keyW + 6, rows.length * 4.6 + 5, 'both')
    for (const [k, v] of rows) {
      pg.text(bx, by, k, { size: 2.6, color: GREY })
      pg.text(bx + keyW, by, v, { size: 2.6, align: 'right' })
      by -= 4.6
    }
    // The contours' key, under the numbers.
    if (fc) {
      const top = by - 4
      const h = 3 * 4.6 + 2.4
      pg.lineWidth(0.25).stroke(LIGHT).fill([1, 1, 1]).rect(bx - 3, top - h, keyW + 6, h, 'both')
      let ly = top - 4
      pg.text(bx, ly, legend[0], { size: 2.6, color: GREY })
      ly -= 4.6
      pg.lineWidth(0.3).stroke(INK).line([bx, ly + 0.9], [bx + 8, ly + 0.9])
      pg.text(bx + 10, ly, legend[1], { size: 2.6 })
      ly -= 4.6
      pg.lineWidth(0.25).stroke(NATURAL_MAJOR).dash([0.8, 0.8]).line([bx, ly + 0.9], [bx + 8, ly + 0.9])
      pg.dash()
      pg.text(bx + 10, ly, legend[2], { size: 2.6 })
    }
    drawFeatureLegend(pg, W - margin - 5, margin + strip + 5, features, input.site?.warnings ?? [])
    return view
  }

  /** Contours: once the ground is cut or filled, the finished ground's in ink there and the natural ones dashed. Returns the finished ones, if drawn. */
  function drawContours(pg: PdfPage, view: View, tf: (p: Vec2) => Vec2): FinishedContours | null {
    const fc = input.contours?.any ? input.contours : null
    const draw = (runs: ContourRun[], major: boolean) => {
      for (const r of runs) if (r.major === major) pg.polyline(r.pts.map(p => view.P(tf(p))))
    }
    if (fc) {
      pg.lineWidth(0.12).stroke(NATURAL_MINOR)
      draw(fc.natural, false)
      pg.lineWidth(0.25).stroke(NATURAL_MAJOR)
      draw(fc.natural, true)
      pg.dash([0.8, 0.8])
      pg.lineWidth(0.12).stroke(NATURAL_MINOR)
      draw(fc.existing, false)
      pg.lineWidth(0.2).stroke(NATURAL_MAJOR)
      draw(fc.existing, true)
      pg.dash()
      pg.lineWidth(0.12).stroke([0.45, 0.46, 0.48])
      draw(fc.finished, false)
      pg.lineWidth(0.3).stroke(INK)
      draw(fc.finished, true)
      for (const r of fc.finished) {
        if (!r.major) continue
        const p = labelPoint(r, 12 / view.k)
        if (!p) continue
        const q = view.P(tf(p))
        pg.text(q[0], q[1] + 0.8, contourText(r.z), { size: 2, color: INK, align: 'center', font: 'bold' })
      }
    }
    for (const c of survey.contours) {
      // Runs of the contour on the block, each point kept in the local frame too, for its label.
      const segs: Vec2[][] = []
      let cur: Vec2[] = []
      for (let i = 0; i + 1 < c.pts.length; i++) {
        const a = c.pts[i]
        const b = c.pts[i + 1]
        if (!pointInPolygon((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, survey.boundary)) {
          if (cur.length > 1) segs.push(cur)
          cur = []
          continue
        }
        if (!cur.length) cur.push([a[0], a[1]])
        cur.push([b[0], b[1]])
      }
      if (cur.length > 1) segs.push(cur)
      pg.lineWidth(c.major ? 0.25 : 0.12).stroke(c.major ? NATURAL_MAJOR : NATURAL_MINOR)
      if (!fc) for (const sgm of segs) pg.polyline(sgm.map(p => view.P(tf(p))))
      if (c.major && segs.length) {
        const longest = segs.reduce((a, b) => (b.length > a.length ? b : a))
        const mid = longest[Math.floor(longest.length / 2)]
        // Not on ground that's been cut or filled: the finished contours are labelled there.
        if (fc?.changedAt(mid[0], mid[1])) continue
        const at = view.P(tf(mid))
        pg.text(at[0], at[1] + 0.8, c.z.toFixed(0), { size: 2, color: [0.55, 0.48, 0.38], align: 'center' })
      }
    }
    return fc
  }

  /** A white box of key numbers at the top right (label left, value right) with notes under them; returns where it ends. */
  function keyBox(pg: PdfPage, rows: [string, string][], notes: string[] = [], minW = 64): { x: number; w: number; bottom: number } {
    const size = 2.6
    const w = Math.max(minW, ...rows.map(([k, v]) => textWidth(k, size) + textWidth(v, size) + 4))
    const lines = notes.map(t => wrapText(t, w, 2.3))
    const h = rows.length * 4.6 + lines.reduce((t, l) => t + l.length * 3.3 + 1.2, 0) + 5
    const x = W - margin - w - 8
    let y = H - margin - 8
    pg.lineWidth(0.25).stroke(LIGHT).fill([1, 1, 1]).rect(x - 3, y + 4 - h, w + 6, h, 'both')
    for (const [k, v] of rows) {
      pg.text(x, y, k, { size, color: GREY })
      pg.text(x + w, y, v, { size, align: 'right' })
      y -= 4.6
    }
    for (const l of lines) {
      for (const t of l) {
        pg.text(x, y + 0.6, t, { size: 2.3, color: GREY })
        y -= 3.3
      }
      y -= 1.2
    }
    return { x, w, bottom: y + 4 - 1 }
  }

  /** A key of swatches and lines under a key box: each row is a mark drawn 8 mm wide, then its words. */
  function legendBox(pg: PdfPage, x: number, w: number, top: number, rows: { text: string; mark: (x: number, y: number) => void }[]) {
    const h = rows.length * 4.6 + 2.4
    pg.lineWidth(0.25).stroke(LIGHT).fill([1, 1, 1]).rect(x - 3, top - h, w + 6, h, 'both')
    let y = top - 4
    for (const r of rows) {
      r.mark(x, y)
      pg.text(x + 10, y, r.text, { size: 2.6 })
      y -= 4.6
    }
  }

  /** The floor level of each level on the ground: one row for a house on one level, a row each for split levels. */
  function fflRows(): [string, string][] {
    if (house.ground.length < 2) return [['Ground floor FFL', `RL ${floorRL(plan).toFixed(2)}`]]
    return house.ground.map(g => [`${g.level.name} FFL`, `RL ${g.rl.toFixed(2)}`])
  }

  /**
   * The house: every level on the ground filled, each named with its floor level (a split level
   * beside the lowest is part of the footprint), and only the storeys over them, and the roofs, dashed.
   */
  function houseOutline(pg: PdfPage, view: View, fill: RGB, label = true) {
    pg.lineWidth(0.5).stroke(INK).fill(fill)
    for (const g of house.ground) pg.shape(g.rings.map(r => ring(view, r)), 'both')
    pg.lineWidth(0.25).stroke(GREY).dash([1.5, 1])
    for (const r of house.upper) pg.shape([ring(view, r)], 'stroke')
    pg.dash([3, 1.2])
    for (const { g } of roofs) pg.shape([ring(view, g.outline)], 'stroke')
    pg.dash()
    if (!label) return
    for (const g of house.ground) {
      const c = view.P(centroidOf(g.rings[0]))
      pg.text(c[0], c[1] + 1.5, house.ground.length > 1 ? g.level.name : 'House', { size: 3, font: 'bold', align: 'center' })
      pg.text(c[0], c[1] - 3, `FFL RL ${g.rl.toFixed(2)}`, { size: 2.6, align: 'center' })
    }
  }

  /** The stormwater concept's dashed path from the house to where the water goes, with an arrow head and its label. */
  function stormPath(pg: PdfPage, view: View, tf: (p: Vec2) => Vec2, storm: StormwaterSheet) {
    if (storm.path.length !== 2) return
    const a = tf(storm.path[0])
    const b = tf(storm.path[1])
    const pa = view.P(a)
    const pb = view.P(b)
    pg.lineWidth(0.4).stroke(STORM).dash([1.6, 1]).line(pa, pb)
    pg.dash()
    // An arrow head at the discharge point.
    const ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0])
    const wing = (t: number): [number, number] => [pb[0] - Math.cos(ang) * 2 - Math.sin(ang) * t, pb[1] - Math.sin(ang) * 2 + Math.cos(ang) * t]
    pg.lineWidth(0.4).line(wing(1.1), pb).line(wing(-1.1), pb)
    pg.fill(STORM).stroke(STORM).circle(pa[0], pa[1], 0.8, 'both')
    along(pg, view, a, b, storm.label, 1.8, 2.4, STORM)
  }

  /** The block's boundary, clipped drawing area and survey frame, as the DA pack's two site sheets share them. */
  function blockView(extra: Vec2[] = []) {
    const tf = (p: Vec2) => fromSite(p, plan.placement, survey.origin)
    const boundary = survey.boundary.map(tf)
    const view = makeView([...boundary, ...house.rings.flat(), ...extra], rho, area, 100)
    return { tf, boundary, view }
  }

  // ---- Cut and fill plan (DA pack) ----
  function cutFillSheet(pg: PdfPage, natural: Heightfield, finished: Heightfield): View {
    const { tf, boundary, view } = blockView()
    // Where the finished ground is lower than the natural ground (cut) and higher (fill), tinted, on the block only.
    if (natural.z.length === finished.z.length) {
      const cut = new Float64Array(finished.z.length)
      const fill = new Float64Array(finished.z.length)
      for (let k = 0; k < cut.length; k++) {
        cut[k] = natural.z[k] - finished.z[k]
        fill[k] = -cut[k]
      }
      const paper = (vals: Float64Array) =>
        superlevel(vals, finished.nx, finished.ny, CHANGED).rings.map(r => r.map(([u, v]) => view.P(tf([finished.x0 + u * finished.cell, finished.y0 + v * finished.cell]))))
      pg.save().clip([ring(view, boundary)])
      pg.fill(CUT_TINT).shape(paper(cut), 'fill')
      pg.fill(FILL_TINT).shape(paper(fill), 'fill')
      pg.restore()
    }
    const fc = drawContours(pg, view, tf)
    houseOutline(pg, view, [0.93, 0.93, 0.93])
    retainingWalls(pg, view, retaining, true)
    pg.lineWidth(0.6).stroke(INK).shape([ring(view, boundary)], 'stroke')

    const e = input.earthworks!
    const net = e.cut - e.fill
    const rows: [string, string][] = [
      ['Cut', `${e.cut.toFixed(1)} m³`],
      ['Fill', `${e.fill.toFixed(1)} m³`],
      ['Cut less fill', Math.abs(net) < 0.5 ? 'about even' : `${Math.abs(net).toFixed(1)} m³ ${net > 0 ? 'to take away' : 'to bring in'}`],
    ]
    if (e.maxCut !== undefined) rows.push(['Deepest cut', `${e.maxCut.toFixed(2)} m`])
    if (e.maxFill !== undefined) rows.push(['Deepest fill', `${e.maxFill.toFixed(2)} m`])
    rows.push(...fflRows())
    if (profiles.length) {
      rows.push(['Retaining walls', `${profiles.reduce((t, p) => t + p.length, 0).toFixed(1)} m`])
      rows.push(['Tallest retaining wall', `holds back ${mm(Math.max(...profiles.map(p => p.maxHeight)))} mm`])
    }
    const key = keyBox(pg, rows, ['Volumes are estimates from the survey’s ground model, as Earthworks › Cut and fill works them out. An engineer or builder confirms them.'])
    const swatch = (c: RGB) => (x: number, y: number) => {
      pg.lineWidth(0.15).stroke(GREY).fill(c).rect(x, y - 0.4, 8, 2.8, 'both')
    }
    const line = (c: RGB, w: number, dash: number[]) => (x: number, y: number) => {
      pg.lineWidth(w).stroke(c).dash(dash).line([x, y + 0.9], [x + 8, y + 0.9])
      pg.dash()
    }
    const legend: { text: string; mark: (x: number, y: number) => void }[] = [
      { text: 'Cut: ground lowered', mark: swatch(CUT_TINT) },
      { text: 'Fill: ground raised', mark: swatch(FILL_TINT) },
    ]
    if (retaining.length) legend.push({ text: 'Retaining wall', mark: swatch(RW_FILL) })
    if (fc) {
      const every = fc.minor < 1 ? `${Math.round(fc.minor * 1000)} mm` : `${fc.minor} m`
      legend.push({ text: `Finished contours every ${every}, proposed`, mark: line(INK, 0.3, []) }, { text: 'Natural ground, existing', mark: line(NATURAL_MAJOR, 0.25, [0.8, 0.8]) })
    }
    legendBox(pg, key.x, key.w, key.bottom - 3, legend)
    return view
  }

  // ---- Stormwater concept (DA pack) ----
  function stormwaterPlanSheet(pg: PdfPage, storm: StormwaterSheet): View {
    const { tf, boundary, view } = blockView()
    // The natural contours, faint, so the fall reads.
    pg.save().clip([ring(view, boundary)])
    for (const c of survey.contours) pg.lineWidth(c.major ? 0.22 : 0.1).stroke(c.major ? NATURAL_MAJOR : NATURAL_MINOR).polyline(c.pts.map(p => view.P(tf([p[0], p[1]]))))
    pg.restore()
    houseOutline(pg, view, [0.9, 0.9, 0.9])
    // Downpipes, most often at the roof's outside corners.
    for (const p of storm.downpipes ?? []) {
      const q = view.P(p)
      pg.lineWidth(0.25).stroke(STORM).fill([1, 1, 1]).circle(q[0], q[1], 0.9, 'both')
    }
    stormPath(pg, view, tf, storm)
    pg.lineWidth(0.6).stroke(INK).shape([ring(view, boundary)], 'stroke')

    const notes = [storm.verdict, 'A concept only: a hydraulic engineer designs the pipes, pits, any on-site detention and the connection to the street or easement.'].filter(
      (t): t is string => !!t,
    )
    const key = keyBox(pg, storm.rows, notes, 80)
    const legend: { text: string; mark: (x: number, y: number) => void }[] = [
      {
        text: 'Stormwater concept path',
        mark: (x, y) => {
          pg.lineWidth(0.4).stroke(STORM).dash([1.6, 1]).line([x, y + 0.9], [x + 8, y + 0.9])
          pg.dash()
        },
      },
      { text: 'Likely downpipe (a roof corner)', mark: (x, y) => pg.lineWidth(0.25).stroke(STORM).fill([1, 1, 1]).circle(x + 4, y + 0.9, 0.9, 'both') },
      { text: 'Natural contours, existing', mark: (x, y) => pg.lineWidth(0.22).stroke(NATURAL_MAJOR).line([x, y + 0.9], [x + 8, y + 0.9]) },
    ]
    // Which way the block falls, as an arrow on the paper's own turn of the plan.
    const fall = storm.fall
    if (fall) {
      const b = (fall.bearing * Math.PI) / 180
      const a = view.P(tf(fall.at))
      const q = view.P(tf([fall.at[0] + Math.sin(b), fall.at[1] + Math.cos(b)]))
      const len = Math.hypot(q[0] - a[0], q[1] - a[1]) || 1
      const d: [number, number] = [(q[0] - a[0]) / len, (q[1] - a[1]) / len]
      legend.push({
        text: fall.text,
        mark: (x, y) => {
          const c: [number, number] = [x + 4, y + 0.9]
          const from: [number, number] = [c[0] - d[0] * 3.6, c[1] - d[1] * 3.6]
          const to: [number, number] = [c[0] + d[0] * 3.6, c[1] + d[1] * 3.6]
          const wing = (s: number): [number, number] => [to[0] - d[0] * 1.6 - d[1] * s, to[1] - d[1] * 1.6 + d[0] * s]
          pg.lineWidth(0.4).stroke(INK).line(from, to).line(wing(0.9), to).line(wing(-0.9), to)
        },
      })
    }
    legendBox(pg, key.x, key.w, key.bottom - 3, legend)
    return view
  }

  // ---- Shadow diagram ----
  function shadowSheet(pg: PdfPage, d: ShadowDiagram): View {
    const tf = (p: Vec2) => fromSite(p, plan.placement, survey.origin)
    const boundary = survey.boundary.map(tf)
    const cast = d.shadows.flatMap(x => x.shadow?.rings.flat() ?? []).map(tf)
    const view = makeView([...boundary, ...house.rings.flat(), ...cast], rho, area, 100)
    const args = { pg, toPaper: (p: Vec2) => view.P(tf(p)) }
    const box: [number, number][] = [
      [area.x, area.y],
      [area.x + area.w, area.y],
      [area.x + area.w, area.y + area.h],
      [area.x, area.y + area.h],
    ]
    pg.save().clip([box])
    drawShadows(args, d)
    // The house over its shadows: the levels on the ground solid, upper storeys and roofs dashed.
    houseOutline(pg, view, [0.8, 0.8, 0.8], false)
    pg.lineWidth(0.6).stroke(INK).shape([ring(view, boundary)], 'stroke')
    drawShadowLabels(args, d)
    pg.restore()
    drawShadowKey(pg, W - margin - 5, H - margin - 5, d)
    return view
  }

  /** Retaining walls, hatched, each labelled with how much it holds back. */
  function retainingWalls(pg: PdfPage, view: View, walls: Wall[], heights: boolean, taken?: Box[]) {
    for (const w of walls) {
      const poly = retainingPolys.get(w.id)
      if (!poly) continue
      pg.lineWidth(0.2).stroke(INK).fill(RW_FILL).shape([ring(view, poly)], 'both')
      const len = wallLength(w)
      if (len * view.k < 10) continue
      const prof = heights ? profiles.find(p => p.wall.id === w.id) : undefined
      const label = prof && prof.maxHeight >= 0.05 ? `RW ${mm(len)}, holds back up to ${mm(prof.maxHeight)}` : `RW ${mm(len)}`
      const d = wallDir(w)
      // On the high side, which is usually away from the house.
      const off = (w.thickness / 2 + 2 / view.k) * (prof?.high === 'right' ? -1 : 1)
      along(pg, view, [w.a[0] - d[1] * off, w.a[1] + d[0] * off], [w.b[0] - d[1] * off, w.b[1] + d[0] * off], label, 0, 2.2, [0.42, 0.36, 0.28], taken)
    }
  }

  // ---- Floor plans ----
  function floorSheet(pg: PdfPage, level: Level): View {
    const levelRetaining = retaining.filter(w => w.level === level.id)
    const walls = houseWalls(plan.walls.filter(w => w.level === level.id))
    const faces = planarFaces(walls)
    const outlines = buildingOutline(faces).outlines
    const areas = plan.areas.filter(a => a.level === level.id)
    const stairs = plan.stairs.filter(s => s.level === level.id)
    const furniture = input.furniture === false ? [] : plan.furniture.filter(f => f.level === level.id)
    const rooms = plan.rooms.filter(x => x.level === level.id)
    // Fitted to the house, at the set's one floor plan scale (see floorExtent, autoFloorScale).
    const view = makeView(floorExtent(plan, level.id, input.furniture !== false), rho, area, floorScale, true)

    // Labels are kept off each other where they can be. The ones that always print take their
    // places first: the level note, the room names and the overall sizes. The rest (outdoor
    // areas, retaining walls, wall lengths) move or are left off where they would print over one.
    // The app's one figure for the level (the strip, Overview, Rooms & areas, Costs): a wall shared with a split level beside it counts once.
    const gross = levelSummaries(plan).find(s => s.level.id === level.id)?.gross.area ?? 0
    const levelNote = `${level.name}: FFL RL ${floorRL(plan, level.id).toFixed(2)}, ceiling ${mm(level.height)} mm, ${gross.toFixed(2)} m² to the outside of the walls`
    const nb = textBox(area.x + 2, area.y + area.h - 2, levelNote, 2.8)
    const taken: Box[] = [nb]
    const roomLabels = rooms.map(r => {
      const shape = roomShape(r, faces)
      const p = view.P(r.at)
      const note = roomFloorNote(plan, r)
      const lines: { y: number; text: string; size: number; font?: 'bold'; color?: RGB }[] = [
        { y: p[1] + 1, text: r.name, size: 3, font: 'bold' },
        { y: p[1] - 2.8, text: shape ? `${shape.area.toFixed(2)} m²` : 'not enclosed', size: 2.5, color: GREY },
      ]
      if (note) lines.push({ y: p[1] - 6, text: note === 'on piers' ? 'floor on piers' : note, size: 2.2, color: GREY })
      for (const l of lines) taken.push(textBox(p[0], l.y, l.text, l.size, { font: l.font, align: 'center' }))
      return { x: p[0], lines }
    })
    // Overall dimensions along the house's own axes.
    const overall: [Vec2, Vec2, Vec2][] = []
    if (outlines.length) {
      const all = outlines.flat()
      const minX = Math.min(...all.map(p => p[0]))
      const maxX = Math.max(...all.map(p => p[0]))
      const minY = Math.min(...all.map(p => p[1]))
      const maxY = Math.max(...all.map(p => p[1]))
      const gap = 9 / view.k
      overall.push([[minX, minY - gap], [maxX, minY - gap], [0, 1]], [[maxX + gap, minY], [maxX + gap, maxY], [-1, 0]])
      for (const [a, b, out] of overall) {
        const t = dimensionLabel(view, a, b, out)
        taken.push(textBox(t.x, t.y, t.text, 2.6, { align: 'center', baseline: 'middle', angle: t.angle }))
      }
    }

    // Whatever runs past the sheet (a lawn, a long driveway) stops at the drawing area's edge.
    pg.save().clip([areaBox])

    for (const a of areas) pg.lineWidth(0.18).stroke(GREY).fill(AREA_FILL[areaKind(a)]).shape([ring(view, a.pts)], 'both')

    // Rooms on piers (or another floor that leaves the ground natural) get a light tint so they read differently.
    for (const r of rooms.filter(x => onNaturalGround(plan, x))) {
      const shape = roomShape(r, faces)
      if (shape) pg.fill([0.95, 0.93, 0.88]).shape([ring(view, shape.inner)], 'fill')
    }

    // Stairs
    for (const s of stairs) {
      const L = stairLayout(s)
      pg.lineWidth(0.18).stroke(INK).fill([1, 1, 1]).shape([ring(view, L.outline)], 'both')
      for (const [a, b] of L.treadLines) pg.line(view.P(a), view.P(b))
      if (L.walk.length > 1) {
        const w = L.walk.map(view.P)
        pg.lineWidth(0.18).stroke(GREY).polyline(w)
        const end = w[w.length - 1]
        const prev = w[w.length - 2]
        const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0])
        const head = (d: number): [number, number] => [end[0] - Math.cos(ang + d) * 2, end[1] - Math.sin(ang + d) * 2]
        pg.fill(GREY).shape([[end, head(0.45), head(-0.45)]], 'fill')
        pg.text(w[0][0], w[0][1] - 2.5, 'UP', { size: 2.2, align: 'center', color: GREY })
      }
    }

    for (const f of furniture) furnitureOnPlan(pg, view, f)

    // The sketch layer, only when it's ticked: thin dashed lines, and kept measurements with their lengths.
    if (input.sketch) sketchOnPlan(pg, view)

    retainingWalls(pg, view, levelRetaining, false, taken)

    // Walls, with openings left open.
    const polys = wallPolygons(walls)
    for (const w of walls) {
      const poly = polys.get(w.id)
      if (!poly) continue
      const len = wallLength(w)
      const d = wallDir(w)
      const ops = plan.openings
        .filter(o => o.wall === w.id)
        .map(o => [o.offset - o.width / 2, o.offset + o.width / 2] as [number, number])
        .sort((a, b) => a[0] - b[0])
      let s = -1e3
      const pieces: [number, number][] = []
      for (const [o0, o1] of ops) {
        if (o0 > s) pieces.push([s, o0])
        s = Math.max(s, o1)
      }
      pieces.push([s, 1e3])
      pg.fill(w.kind === 'external' ? INK : [0.3, 0.32, 0.35])
      for (const [s0, s1] of pieces) {
        const part = sliceAlong(poly, w.a, d, s0 <= 0 ? -1e3 : s0, s1 >= len ? 1e3 : s1)
        if (part.length >= 3) pg.shape([ring(view, part)], 'fill')
      }
      for (const o of plan.openings.filter(x => x.wall === w.id)) openingSymbol(pg, view, o, w)
    }
    // Where the sections cut, on every floor.
    drawSectionMarks(pg, view.P, sectionsOf(plan), area)

    for (const [a, b, out] of overall) dimension(pg, view, a, b, out)

    // Outdoor areas: name and size in the middle, or the nearest clear spot of the part that shows.
    for (const a of areas) {
      const kind = areaKind(a)
      const name = a.name || AREA_LABEL[kind]
      const size = `${Math.abs(signedArea(a.pts)).toFixed(2)} m²`
      const at = areaLabelSpot(ring(view, a.pts), q => [textBox(q[0], q[1] + 1, name, 2.6, { align: 'center' }), textBox(q[0], q[1] - 2.6, size, 2.2, { align: 'center' })], taken)
      if (!at) continue
      pg.text(at[0], at[1] + 1, name, { size: 2.6, align: 'center', color: GREY })
      pg.text(at[0], at[1] - 2.6, size, { size: 2.2, align: 'center', color: GREY })
    }

    // Wall lengths: outside for external walls, on the left for internal ones; on the other side where that is taken.
    for (const w of walls) {
      const len = wallLength(w)
      if (len * view.k < 8) continue
      const d = wallDir(w)
      const off = w.thickness / 2 + 2.2 / view.k
      const mid = pointOnWall(w, len / 2)
      const probe: Vec2 = [mid[0] - d[1] * off, mid[1] + d[0] * off]
      const inside = faces.some(f => f.area > 0 && pointInPolygon(probe[0], probe[1], f.pts))
      const first = w.kind === 'external' && inside ? -1 : 1
      // Not across another wall either (one that meets this wall part-way, a retaining wall beside it).
      const others = [...walls, ...levelRetaining].filter(x => x !== w)
      const blocked = (box: Box) => others.some(x => lineThroughBox(view.P(x.a), view.P(x.b), (x.thickness / 2) * view.k, box))
      for (const sign of [first, -first]) {
        const n: Vec2 = [-d[1] * off * sign, d[0] * off * sign]
        if (along(pg, view, [w.a[0] + n[0], w.a[1] + n[1]], [w.b[0] + n[0], w.b[1] + n[1]], mm(len), 0, 2.2, GREY, taken, blocked)) break
      }
    }

    // Room names and areas
    for (const r of roomLabels) for (const l of r.lines) pg.text(r.x, l.y, l.text, { size: l.size, font: l.font, align: 'center', color: l.color })

    pg.restore()
    // On white, so it reads over an outdoor area that runs under it.
    pg.fill([1, 1, 1]).rect(nb[0] - 1, nb[1] - 0.6, nb[2] - nb[0] + 2, nb[3] - nb[1] + 1.2, 'fill')
    pg.text(area.x + 2, area.y + area.h - 2, levelNote, { size: 2.8, color: GREY })
    return view
  }

  /**
   * Where an outdoor area's label goes: its middle when that shows on the sheet and is clear of the
   * labels already placed, or else the nearest clear spot inside the part of it that shows. Null when
   * there is none. `ringMm` is the area on the paper; `boxes` gives the label's boxes at a spot.
   */
  function areaLabelSpot(ringMm: [number, number][], boxes: (q: [number, number]) => Box[], taken: Box[]): [number, number] | null {
    const inSheet = (b: Box) => b[0] >= area.x && b[2] <= area.x + area.w && b[1] >= area.y && b[3] <= area.y + area.h
    const ok = (q: [number, number]) => {
      const bs = boxes(q)
      return bs.every(inSheet) && clearOf(taken, ...bs)
    }
    const take = (q: [number, number]) => {
      taken.push(...boxes(q))
      return q
    }
    const c = centroidOf(ringMm)
    if (ok(c)) return take(c)
    const x0 = Math.max(area.x, Math.min(...ringMm.map(p => p[0])))
    const x1 = Math.min(area.x + area.w, Math.max(...ringMm.map(p => p[0])))
    const y0 = Math.max(area.y, Math.min(...ringMm.map(p => p[1])))
    const y1 = Math.min(area.y + area.h, Math.max(...ringMm.map(p => p[1])))
    const step = Math.max(4, Math.max(x1 - x0, y1 - y0) / 24)
    let best: [number, number] | null = null
    let bestD = Infinity
    for (let x = x0 + step / 2; x < x1; x += step) {
      for (let y = y0 + step / 2; y < y1; y += step) {
        const d = Math.hypot(x - c[0], y - c[1])
        if (d >= bestD || !pointInPolygon(x, y, ringMm) || !ok([x, y])) continue
        best = [x, y]
        bestD = d
      }
    }
    return best ? take(best) : null
  }

  /** Sketch lines thin and dashed, and kept measurements as dimension lines with ticks and lengths. */
  function sketchOnPlan(pg: PdfPage, view: View) {
    // A sketch line can run far past the house: kept inside the drawing, clear of the title strip.
    pg.save().clip([[[area.x, area.y], [area.x + area.w, area.y], [area.x + area.w, area.y + area.h], [area.x, area.y + area.h]]])
    for (const s of sketchOf(plan)) {
      if (s.kind === 'measure') {
        pg.lineWidth(0.15).stroke(GREY).dash([]).polyline(s.pts.map(view.P))
        for (const p of s.pts) {
          const q = view.P(p)
          pg.line([q[0] - 0.8, q[1] - 0.8], [q[0] + 0.8, q[1] + 0.8])
        }
        s.pts.slice(1).forEach((p, i) => along(pg, view, s.pts[i], p, mm(Math.hypot(p[0] - s.pts[i][0], p[1] - s.pts[i][1])), 1.6, 2.2, GREY))
        continue
      }
      // In its own colour, as on the screen.
      pg.lineWidth(0.18).stroke(SKETCH_PAINT[colourOf(s)].rgb).dash([1.5, 1]).polyline(sketchPolyline(s, 0.02).map(view.P))
    }
    // What each colour marks, under the level note, when the colours are named (or more than one is used).
    sketchLegend(plan).forEach((l, i) => {
      const y = area.y + area.h - 6.5 - i * 3.6
      pg.lineWidth(0.3).stroke(SKETCH_PAINT[l.colour].rgb).dash([1.5, 1]).line([area.x + 2, y + 0.8], [area.x + 8, y + 0.8])
      pg.dash([]).text(area.x + 10, y, l.text, { size: 2.5, color: GREY })
    })
    pg.dash([]).restore()
  }

  /** A piece of furniture in thin lines, white so it hides what is under it, with its note (REF, DW). */
  function furnitureOnPlan(pg: PdfPage, view: View, f: Furniture) {
    const { parts, code } = furnitureSymbol(f)
    pg.lineWidth(0.1).stroke(FURNITURE).fill([1, 1, 1])
    for (const part of parts) {
      if (part.closed) pg.shape([ring(view, part.pts)], 'both')
      else pg.polyline(part.pts.map(view.P))
    }
    if (code && Math.min(f.width, f.depth) * view.k >= 5) {
      const t = (f.rotation * Math.PI) / 180
      const c = view.P(f.at)
      pg.text(c[0], c[1], code, { size: 1.6, align: 'center', baseline: 'middle', angle: upright(view.angle([Math.cos(t), Math.sin(t)])), color: FURNITURE })
    }
  }

  function openingSymbol(pg: PdfPage, view: View, o: Opening, w: Wall) {
    const d = wallDir(w)
    const n: Vec2 = [-d[1], d[0]]
    const c = pointOnWall(w, o.offset)
    const hw = o.width / 2
    const ht = w.thickness / 2
    const at = (p: Vec2, s: number): Vec2 => [p[0] + n[0] * s, p[1] + n[1] * s]
    const p0: Vec2 = [c[0] - d[0] * hw, c[1] - d[1] * hw]
    const p1: Vec2 = [c[0] + d[0] * hw, c[1] + d[1] * hw]
    pg.lineWidth(0.18).stroke(INK)
    // A sliding, double or bifold door, or a window of a named kind: the same symbol as on the screen.
    const styled = styleSymbol(o, p0, p1, n, ht)
    if (styled) {
      if (o.kind === 'door') pg.lineWidth(0.25)
      for (const l of styled.lines) pg.polyline(l.map(view.P))
      pg.lineWidth(0.12).stroke(GREY)
      for (const l of styled.light) pg.polyline(l.map(view.P))
    } else if (o.kind === 'window') {
      pg.line(view.P(at(p0, -ht)), view.P(at(p0, ht)))
      pg.line(view.P(at(p1, -ht)), view.P(at(p1, ht)))
      pg.line(view.P(at(p0, -ht / 3)), view.P(at(p1, -ht / 3)))
      pg.line(view.P(at(p0, ht / 3)), view.P(at(p1, ht / 3)))
    } else if (o.kind === 'door') {
      const hinge = o.flipHinge ? p1 : p0
      const other = o.flipHinge ? p0 : p1
      const side = o.flipSwing ? -1 : 1
      const hingeFace = at(hinge, side * ht)
      const leafEnd: Vec2 = [hingeFace[0] + n[0] * side * o.width, hingeFace[1] + n[1] * side * o.width]
      const closed = at(other, side * ht)
      const a0 = Math.atan2(leafEnd[1] - hingeFace[1], leafEnd[0] - hingeFace[0])
      let a1 = Math.atan2(closed[1] - hingeFace[1], closed[0] - hingeFace[0])
      while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI
      while (a0 - a1 > Math.PI) a1 += 2 * Math.PI
      const arc: [number, number][] = []
      for (let i = 0; i <= 16; i++) {
        const t = a0 + ((a1 - a0) * i) / 16
        arc.push(view.P([hingeFace[0] + Math.cos(t) * o.width, hingeFace[1] + Math.sin(t) * o.width]))
      }
      pg.lineWidth(0.25).line(view.P(hingeFace), view.P(leafEnd))
      pg.lineWidth(0.12).stroke(GREY).polyline(arc)
    } else if (o.kind === 'garage') {
      // No swing: the jambs, and the door's panel dashed across the opening.
      const g = garageDoorSymbol(p0, p1, n, ht)
      for (const [a, b] of g.jambs) pg.line(view.P(a), view.P(b))
      pg.lineWidth(0.25).dash([1.6, 0.7])
      pg.line(view.P(g.panel[0]), view.P(g.panel[1]))
      pg.dash()
    } else {
      pg.lineWidth(0.15).stroke(GREY).dash([1, 0.8])
      pg.line(view.P(at(p0, -ht)), view.P(at(p1, -ht)))
      pg.line(view.P(at(p0, ht)), view.P(at(p1, ht)))
      pg.dash()
    }
  }

  /** Where a dimension's figure goes: beside the middle of the line, on the side away from the building. */
  function dimensionLabel(view: View, a: Vec2, b: Vec2, out: Vec2): { x: number; y: number; text: string; angle: number } {
    const pa = view.P(a)
    const pb = view.P(b)
    const o = view.P([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
    const od = view.angle([-out[0], -out[1]]) * (Math.PI / 180)
    return {
      x: o[0] + Math.cos(od) * 2,
      y: o[1] + Math.sin(od) * 2,
      text: mm(Math.hypot(b[0] - a[0], b[1] - a[1])),
      angle: upright((Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) * 180) / Math.PI),
    }
  }

  /** A dimension line from a to b with ticks and its length, text on side `out`. */
  function dimension(pg: PdfPage, view: View, a: Vec2, b: Vec2, out: Vec2) {
    const pa = view.P(a)
    const pb = view.P(b)
    pg.lineWidth(0.15).stroke(GREY).line(pa, pb)
    const ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0])
    for (const p of [pa, pb]) {
      const t = 1.2
      pg.line([p[0] - Math.cos(ang + Math.PI / 4) * t, p[1] - Math.sin(ang + Math.PI / 4) * t], [p[0] + Math.cos(ang + Math.PI / 4) * t, p[1] + Math.sin(ang + Math.PI / 4) * t])
    }
    const t = dimensionLabel(view, a, b, out)
    pg.text(t.x, t.y, t.text, { size: 2.6, align: 'center', baseline: 'middle', angle: t.angle })
  }

  // ---- Roof plan ----
  function roofSheet(pg: PdfPage): View {
    const pts = roofs.flatMap(r => r.g.outline)
    // At the floor plans' scale, so it lays over them.
    const view = makeView(pts, rho, area, floorScale, true)
    pg.lineWidth(0.2).stroke(LIGHT).dash([1.5, 1])
    for (const l of levels) for (const r of outlineOf(l)) pg.shape([ring(view, r)], 'stroke')
    pg.dash()
    for (const { roof, g } of roofs) {
      pg.lineWidth(0.4).stroke(INK).fill([0.93, 0.93, 0.94]).shape([ring(view, g.outline)], 'both')
      pg.lineWidth(0.22)
      for (const [a, b] of g.lines) pg.line(view.P(a), view.P(b))
      const level = plan.levels.find(l => l.id === roof.level)
      const c = view.P(centroidOf(g.outline))
      const kind = { hip: 'Hip roof', gable: 'Gable roof', skillion: 'Skillion roof', flat: 'Flat roof' }[roof.type]
      const rl = level ? roofEavesRL(plan, roof) + g.height : null
      pg.text(c[0], c[1] + 1.2, roof.type === 'flat' ? kind : `${kind}, ${roof.pitch.toFixed(1)}°`, { size: 2.8, font: 'bold', align: 'center' })
      pg.text(c[0], c[1] - 2.6, `${g.area.toFixed(1)} m²${rl !== null ? `, top RL ${rl.toFixed(2)}` : ''}, eaves ${mm(roof.overhang)} mm`, {
        size: 2.4,
        align: 'center',
        color: GREY,
      })
      // A roof with a storey built over all of it isn't a real roof: the sheet says so (Design › Roofs flags it too).
      const over = roofCoveredBy(plan, roof)
      if (over) pg.text(c[0], c[1] - 6, `Under ${over.name}: inside that level, not built`, { size: 2.4, font: 'bold', align: 'center' })
    }
    return view
  }
}
