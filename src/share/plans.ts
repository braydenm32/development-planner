import { CAVEAT_LINE } from '../legal/caveat'
import { DRIVE_RUN, driveVerdict, drivewayGrade, gradeText } from '../lib/drape'
import { centroidOf, pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import { planTurn } from '../lib/orientation'
import type { Survey } from '../lib/survey'
import { furnitureCorners, furnitureSymbol } from '../plan/furniture'
import { buildingFootprint, buildingOutline, planarFaces, roomShape, sliceAlong, wallPolygons } from '../plan/geometry'
import {
  areaKind,
  floorRL,
  fromSite,
  houseWalls,
  isRetaining,
  pointOnWall,
  sortedLevels,
  toSite,
  wallDir,
  wallLength,
  type AreaKind,
  type Furniture,
  type Level,
  type Opening,
  type Plan,
  type Wall,
} from '../plan/model'
import { contourText, labelPoint, type ContourRun, type FinishedContours } from '../plan/finishedContours'
import { onNaturalGround, roomFloorNote } from '../plan/floorTypes'
import { driveDesign, driveEndPoints, driveGround, type DriveGround } from '../plan/driveway'
import { garageDoorSymbol } from '../plan/garageDoor'
import { setbackDims } from '../plan/setbacks'
import { retainingProfiles } from '../plan/retaining'
import type { Heightfield } from '../lib/terrain'
import { roofGeometry } from '../plan/roof'
import { stairLayout } from '../plan/stairs'
import type { SiteFeature } from '../site/model'
import { drawFeatureAreas, drawFeatureLegend, drawFeatureMarks, sheetFeatures, type SheetArgs } from '../site/sheet'
import type { SiteWarning } from '../site/warnings'
import type { ShadowDiagram } from '../sun/facts'
import { drawShadowKey, drawShadowLabels, drawShadows } from '../sun/sheet'
import { PdfDocument, textWidth, type PdfPage, type RGB } from './pdfWriter'

export type Paper = 'A3' | 'A4'

export interface PlanSetInput {
  plan: Plan
  survey: Survey
  /** Site area (m²), for coverage. */
  siteArea: number
  /** Cut and fill volumes (m³), if worked out. */
  earthworks: { cut: number; fill: number } | null
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
  title: string
  date: string
  /** Site features to draw on the site plan (survey local frame), and the warnings about them. */
  site?: { features: SiteFeature[]; warnings: SiteWarning[] }
  /** The house's shadows on 21 June, for a shadow diagram sheet (src/sun); none without. */
  shadows?: ShadowDiagram | null
}

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
interface View {
  P: (p: Vec2) => [number, number]
  scale: number
  /** Paper angle (degrees) of a plan direction. */
  angle: (d: Vec2) => number
  /** Paper millimetres per metre. */
  k: number
}

function makeView(points: Vec2[], rho: number, area: { x: number; y: number; w: number; h: number }, prefer: number): View {
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
  const scale = SCALES.find(sc => sc >= prefer && (w * 1000) / sc <= area.w * 0.9 && (h * 1000) / sc <= area.h * 0.9) ?? SCALES[SCALES.length - 1]
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

/** Every sheet of drawings for the house as one PDF. */
export function planSetPdf(input: PlanSetInput): Uint8Array {
  const { plan, survey } = input
  const [W, H] = PAPER[input.paper]
  const small = input.paper === 'A4'
  const margin = 10
  const strip = small ? 22 : 26
  const area = { x: margin + 4, y: margin + strip + 6, w: W - 2 * margin - 8, h: H - 2 * margin - strip - 10 }
  const rho = planTurn(input.up, plan.placement.rotation)
  const doc = new PdfDocument(input.title)
  const levels = sortedLevels(plan)
  const outlineOf = (l: Level) => buildingOutline(planarFaces(plan.walls.filter(w => w.level === l.id))).outlines
  const roofs = plan.roofs.map(r => ({ roof: r, g: roofGeometry(r) })).filter(x => !x.g.error && x.g.outline.length >= 3)
  const retaining = plan.walls.filter(isRetaining)
  const retainingPolys = wallPolygons(retaining)
  const profiles = input.ground ? retainingProfiles(plan, survey.origin, input.ground) : []

  const sheets: { name: string; draw: (pg: PdfPage) => View }[] = []
  sheets.push({ name: 'Site plan', draw: pg => siteSheet(pg) })
  for (const l of levels) sheets.push({ name: `${l.name} plan`, draw: pg => floorSheet(pg, l) })
  if (roofs.length) sheets.push({ name: 'Roof plan', draw: pg => roofSheet(pg) })
  const shadows = input.shadows
  if (shadows?.shadows.some(x => x.shadow)) sheets.push({ name: 'Shadow diagram, 21 June', draw: pg => shadowSheet(pg, shadows) })

  sheets.forEach((sheet, i) => {
    const pg = doc.addPage(W, H)
    pg.round()
    const view = sheet.draw(pg)
    titleBlock(pg, sheet.name, view, i + 1, sheets.length)
  })
  return doc.output()

  // ---------------------------------------------------------------------------

  function titleBlock(pg: PdfPage, name: string, view: View, n: number, of: number) {
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

    // Scale bar
    const lengths = [0.5, 1, 2, 5, 10, 20, 50, 100]
    const L = lengths.find(l => l * view.k >= 30) ?? 100
    const bw = L * view.k
    const bx = x0 + w * 0.5 - bw / 2
    const by = y0 + strip / 2 - 1
    for (let i = 0; i < 5; i++) {
      pg.lineWidth(0.2).stroke(INK).fill(i % 2 ? [1, 1, 1] : INK)
      pg.rect(bx + (bw * i) / 5, by, bw / 5, 1.6, 'both')
    }
    pg.text(bx, by + 3.2, '0', { size: 2.4 * t, align: 'center' })
    pg.text(bx + bw, by + 3.2, `${L} m`, { size: 2.4 * t, align: 'center' })

    // North arrow
    const north = view.angle(northInPlan()) * (Math.PI / 180)
    const ax = bx + bw + 22
    const ay = y0 + strip / 2
    const r = strip * 0.26
    const tip: [number, number] = [ax + Math.cos(north) * r, ay + Math.sin(north) * r]
    const back = (a: number, d: number): [number, number] => [ax + Math.cos(north + a) * d, ay + Math.sin(north + a) * d]
    pg.lineWidth(0.25).stroke(INK).circle(ax, ay, r * 1.05, 'stroke')
    pg.fill(INK).shape([[tip, back(2.6, r * 0.7), [ax, ay], back(-2.6, r * 0.7)]], 'fill')
    pg.text(tip[0] + Math.cos(north) * 2.5, tip[1] + Math.sin(north) * 2.5, 'N', { size: 3 * t, font: 'bold', align: 'center', baseline: 'middle' })
  }

  function northInPlan(): Vec2 {
    const t = (plan.placement.rotation * Math.PI) / 180
    // Site north (0, 1) turned into the house frame.
    return [Math.sin(t), Math.cos(t)]
  }

  /** A length written along a line, on its outside. */
  function along(pg: PdfPage, view: View, a: Vec2, b: Vec2, text: string, offset: number, size: number, color: RGB = INK) {
    const pa = view.P(a)
    const pb = view.P(b)
    const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1])
    if (len < textWidth(text, size) + 2) return
    const ang = (Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) * 180) / Math.PI
    const nx = -(pb[1] - pa[1]) / len
    const ny = (pb[0] - pa[0]) / len
    pg.text((pa[0] + pb[0]) / 2 + nx * offset, (pa[1] + pb[1]) / 2 + ny * offset, text, { size, angle: upright(ang), align: 'center', baseline: 'middle', color })
  }

  function ring(view: View, r: Vec2[]): [number, number][] {
    return r.map(view.P)
  }

  // ---- Site plan ----
  function siteSheet(pg: PdfPage): View {
    const tf = (p: Vec2) => fromSite(p, plan.placement, survey.origin)
    const boundary = survey.boundary.map(tf)
    const ground = levels[0]
    const outlines = ground ? outlineOf(ground) : []
    const view = makeView([...boundary, ...outlines.flat()], rho, area, 100)
    const features = input.site ? sheetFeatures(input.site.features, survey.boundary) : []
    const marks: SheetArgs = {
      pg,
      toPaper: p => view.P(tf(p)),
      k: view.k,
      clip: area,
      warned: new Set((input.site?.warnings ?? []).filter(w => w.severity === 'attn').map(w => w.feature)),
    }

    // Contours: once the ground is cut or filled, the finished ground's in ink there and the natural ones dashed.
    const fc = input.contours?.any ? input.contours : null
    const NATURAL_MAJOR: RGB = [0.62, 0.55, 0.45]
    const NATURAL_MINOR: RGB = [0.8, 0.76, 0.7]
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

    drawFeatureAreas(marks, features)

    // Outdoor areas on the ground level
    for (const a of plan.areas.filter(x => x.level === ground?.id)) {
      const kind = areaKind(a)
      pg.lineWidth(0.2).stroke(GREY).fill(AREA_FILL[kind]).shape([ring(view, a.pts)], 'both')
      const c = view.P(centroidOf(a.pts))
      pg.text(c[0], c[1], a.name, { size: 2.4, align: 'center', baseline: 'middle', color: GREY })
    }

    retainingWalls(pg, view, retaining, true)

    // The house: ground floor solid, upper floors and roofs dashed.
    pg.lineWidth(0.5).stroke(INK).fill([0.8, 0.8, 0.8]).shape(outlines.map(r => ring(view, r)), 'both')
    pg.lineWidth(0.25).stroke(GREY).dash([1.5, 1])
    for (const l of levels.slice(1)) for (const r of outlineOf(l)) pg.shape([ring(view, r)], 'stroke')
    pg.dash([3, 1.2])
    for (const { g } of roofs) pg.shape([ring(view, g.outline)], 'stroke')
    pg.dash()
    if (outlines.length) {
      const c = view.P(centroidOf(outlines[0]))
      pg.text(c[0], c[1] + 1.5, 'House', { size: 3, font: 'bold', align: 'center' })
      pg.text(c[0], c[1] - 3, `FFL RL ${floorRL(plan).toFixed(2)}`, { size: 2.6, align: 'center' })
    }

    drawFeatureMarks(marks, features)

    // Boundary, with the length of each side.
    pg.lineWidth(0.6).stroke(INK).shape([ring(view, boundary)], 'stroke')
    const ccw = signedArea(boundary) > 0
    boundary.forEach((p, i) => {
      const q = boundary[(i + 1) % boundary.length]
      const len = Math.hypot(q[0] - p[0], q[1] - p[1])
      along(pg, view, ccw ? p : q, ccw ? q : p, `${len.toFixed(2)} m`, -3, 2.6)
    })

    // Setbacks: a dimension line from the house to each side, ticked at both ends (the plan draws the same ones).
    for (const c of setbackDims(outlines, plan.placement, survey)) {
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

    // Key numbers
    const footprint = buildingFootprint(plan)
    const rows: [string, string][] = [
      ['Site area', `${input.siteArea.toFixed(0)} m²`],
      ['Building footprint (all floors)', `${footprint.toFixed(2)} m²`],
      ['Site coverage', `${((footprint / Math.max(input.siteArea, 1)) * 100).toFixed(1)}%`],
      ['Ground floor FFL', `RL ${floorRL(plan).toFixed(2)}`],
    ]
    if (input.earthworks) rows.push(['Cut / fill', `${input.earthworks.cut.toFixed(1)} / ${input.earthworks.fill.toFixed(1)} m³`])
    if (profiles.length) {
      rows.push(['Retaining walls', `${profiles.reduce((t, p) => t + p.length, 0).toFixed(1)} m`])
      rows.push(['Retaining wall face', `${profiles.reduce((t, p) => t + p.faceArea, 0).toFixed(1)} m²`])
    }
    // Grade along each driveway on the finished ground, as its panel shows it.
    const drives = plan.areas.filter(a => a.level === ground?.id && areaKind(a) === 'driveway')
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
      const g = input.ground ? drivewayGrade(input.ground, a.pts.map(p => toSite(p, plan.placement, survey.origin))) : null
      if (!g) continue
      rows.push([`${name}Average grade along the drive`, gradeText(g.average)])
      rows.push([`${name}Steepest ${DRIVE_RUN} m along the drive`, gradeText(g.steepest)])
    }
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

  // ---- Shadow diagram ----
  function shadowSheet(pg: PdfPage, d: ShadowDiagram): View {
    const tf = (p: Vec2) => fromSite(p, plan.placement, survey.origin)
    const boundary = survey.boundary.map(tf)
    const outlines = levels[0] ? outlineOf(levels[0]) : []
    const cast = d.shadows.flatMap(x => x.shadow?.rings.flat() ?? []).map(tf)
    const view = makeView([...boundary, ...outlines.flat(), ...cast], rho, area, 100)
    const args = { pg, toPaper: (p: Vec2) => view.P(tf(p)) }
    const box: [number, number][] = [
      [area.x, area.y],
      [area.x + area.w, area.y],
      [area.x + area.w, area.y + area.h],
      [area.x, area.y + area.h],
    ]
    pg.save().clip([box])
    drawShadows(args, d)
    // The house over its shadows: ground floor solid, upper floors and roofs dashed.
    pg.lineWidth(0.5).stroke(INK).fill([0.8, 0.8, 0.8]).shape(outlines.map(r => ring(view, r)), 'both')
    pg.lineWidth(0.25).stroke(GREY).dash([1.5, 1])
    for (const l of levels.slice(1)) for (const r of outlineOf(l)) pg.shape([ring(view, r)], 'stroke')
    pg.dash([3, 1.2])
    for (const { g } of roofs) pg.shape([ring(view, g.outline)], 'stroke')
    pg.dash()
    pg.lineWidth(0.6).stroke(INK).shape([ring(view, boundary)], 'stroke')
    drawShadowLabels(args, d)
    pg.restore()
    drawShadowKey(pg, W - margin - 5, H - margin - 5, d)
    return view
  }

  /** Retaining walls, hatched, each labelled with how much it holds back. */
  function retainingWalls(pg: PdfPage, view: View, walls: Wall[], heights: boolean) {
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
      along(pg, view, [w.a[0] - d[1] * off, w.a[1] + d[0] * off], [w.b[0] - d[1] * off, w.b[1] + d[0] * off], label, 0, 2.2, [0.42, 0.36, 0.28])
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
    const pts = [
      ...outlines.flat(),
      ...areas.flatMap(a => a.pts),
      ...stairs.flatMap(s => stairLayout(s).outline),
      ...levelRetaining.flatMap(w => [w.a, w.b]),
      ...furniture.flatMap(furnitureCorners),
    ]
    if (!pts.length) pts.push([0, 0], [5, 5])
    const view = makeView(pts, rho, area, 50)

    for (const a of areas) {
      const kind = areaKind(a)
      pg.lineWidth(0.18).stroke(GREY).fill(AREA_FILL[kind]).shape([ring(view, a.pts)], 'both')
      const c = view.P(centroidOf(a.pts))
      pg.text(c[0], c[1] + 1, a.name || AREA_LABEL[kind], { size: 2.6, align: 'center', color: GREY })
      pg.text(c[0], c[1] - 2.6, `${Math.abs(signedArea(a.pts)).toFixed(2)} m²`, { size: 2.2, align: 'center', color: GREY })
    }

    // Rooms on piers (or another floor that leaves the ground natural) get a light tint so they read differently.
    for (const r of plan.rooms.filter(x => x.level === level.id && onNaturalGround(plan, x))) {
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

    retainingWalls(pg, view, levelRetaining, false)

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

    // Wall lengths: outside for external walls, on the left for internal ones.
    for (const w of walls) {
      const len = wallLength(w)
      if (len * view.k < 8) continue
      const d = wallDir(w)
      const off = w.thickness / 2 + 2.2 / view.k
      const mid = pointOnWall(w, len / 2)
      const probe: Vec2 = [mid[0] - d[1] * off, mid[1] + d[0] * off]
      const inside = faces.some(f => f.area > 0 && pointInPolygon(probe[0], probe[1], f.pts))
      const sign = w.kind === 'external' && inside ? -1 : 1
      const n: Vec2 = [-d[1] * off * sign, d[0] * off * sign]
      along(pg, view, [w.a[0] + n[0], w.a[1] + n[1]], [w.b[0] + n[0], w.b[1] + n[1]], mm(len), 0, 2.2, GREY)
    }

    // Overall dimensions along the house's own axes.
    if (outlines.length) {
      const all = outlines.flat()
      const minX = Math.min(...all.map(p => p[0]))
      const maxX = Math.max(...all.map(p => p[0]))
      const minY = Math.min(...all.map(p => p[1]))
      const maxY = Math.max(...all.map(p => p[1]))
      const gap = 9 / view.k
      dimension(pg, view, [minX, minY - gap], [maxX, minY - gap], [0, 1])
      dimension(pg, view, [maxX + gap, minY], [maxX + gap, maxY], [-1, 0])
    }

    // Room names and areas
    for (const r of plan.rooms.filter(x => x.level === level.id)) {
      const shape = roomShape(r, faces)
      const p = view.P(r.at)
      pg.text(p[0], p[1] + 1, r.name, { size: 3, font: 'bold', align: 'center' })
      pg.text(p[0], p[1] - 2.8, shape ? `${shape.area.toFixed(2)} m²` : 'not enclosed', { size: 2.5, align: 'center', color: GREY })
      const note = roomFloorNote(plan, r)
      if (note) pg.text(p[0], p[1] - 6, note === 'on piers' ? 'floor on piers' : note, { size: 2.2, align: 'center', color: GREY })
    }

    // Level note
    const gross = buildingOutline(faces).area
    pg.text(area.x + 2, area.y + area.h - 2, `${level.name}: FFL RL ${floorRL(plan, level.id).toFixed(2)}, ceiling ${mm(level.height)} mm, ${gross.toFixed(2)} m² to the outside of the walls`, {
      size: 2.8,
      color: GREY,
    })
    return view
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
    if (o.kind === 'window') {
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
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const o = view.P([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
    // The figure goes on the side away from the building.
    const od = view.angle([-out[0], -out[1]]) * (Math.PI / 180)
    pg.text(o[0] + Math.cos(od) * 2, o[1] + Math.sin(od) * 2, mm(len), {
      size: 2.6,
      align: 'center',
      baseline: 'middle',
      angle: upright((ang * 180) / Math.PI),
    })
  }

  // ---- Roof plan ----
  function roofSheet(pg: PdfPage): View {
    const pts = roofs.flatMap(r => r.g.outline)
    const view = makeView(pts, rho, area, 50)
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
      const rl = level ? floorRL(plan, level.id) + level.height + g.height : null
      pg.text(c[0], c[1] + 1.2, roof.type === 'flat' ? kind : `${kind}, ${roof.pitch.toFixed(1)}°`, { size: 2.8, font: 'bold', align: 'center' })
      pg.text(c[0], c[1] - 2.6, `${g.area.toFixed(1)} m²${rl !== null ? `, top RL ${rl.toFixed(2)}` : ''}, eaves ${mm(roof.overhang)} mm`, {
        size: 2.4,
        align: 'center',
        color: GREY,
      })
    }
    return view
  }
}
