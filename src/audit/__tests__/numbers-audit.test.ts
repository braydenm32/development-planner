// Numbers audit: every number the UI shows, recomputed from first principles.
//
// The app's own functions (the ones the screens, PDF sheets and print panel call) are
// imported and checked against independent calculations written here from scratch:
// shoelace areas, segment distances, exact integrals of a plane over clipped polygons,
// closed-form batter volumes (Steiner's formula), roof trigonometry, stair arithmetic,
// a raw DXF reader, and true-scale measurement of the PDF drawing.
//
// The synthetic checks build their own blocks. The last section runs on a made-up survey laid out
// like a surveyor's DXF (samples/sample-block.dxf, from scripts/make-sample-survey.mjs) with the
// made-up garage floor from the plan tests on it:
//   npx vitest run src/audit
// Set AUDIT_OUT=/path/sample-values.json to save the values that were measured.
//
// A real discrepancy is kept as a failing expectation inside `it.fails`, with a comment.

import { readFileSync, writeFileSync } from 'node:fs'
import Module, { type ManifoldToplevel } from 'manifold-3d'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DRIVE_RUN, driveVerdict, drivewayGrade, gradeText } from '../../lib/drape'
import { parseDxf } from '../../lib/dxf'
import { balancingShift, evaluateEarthworks, prepareEarthworks, type EarthworksResult, type PreparedEarthworks } from '../../lib/earthworks'
import { analyzeLayers, buildSurvey, guessRoles, type Survey } from '../../lib/survey'
import { bearingName, buildTerrain, type Terrain } from '../../lib/terrain'
import { dxf, lwpolyline, point, polyline3d } from '../../lib/__tests__/fixtures'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { buildingOutline, planarFaces, roomShape } from '../../plan/geometry'
import { earthworksOf, normalizePlan, sortedLevels, wallLength, type Plan, type Retain, type Roof, type RoofType, type Stair, type Wall } from '../../plan/model'
import { addRoof, defaultRise, newStair } from '../../plan/ops'
import { boundaryClearances, defaultPlacement } from '../../plan/placement'
import { earthworksBarriers, earthworksPlatforms, piersGroundNote } from '../../plan/platforms'
import { exposedHeight, highSideBearing, retainingProfile, retainingProfiles, RETAINING_FREEBOARD } from '../../plan/retaining'
import { defaultGables, levelOutlines, roofGeometry } from '../../plan/roof'
import { riserCount, stairComfort, stairCounts, stairLayout } from '../../plan/stairs'
import { buildPrintModel, DEFAULT_PRINT, fitsBed, type PrintModel, type PrintSettings } from '../../print/build'
import { planSetPdf, type Paper, type PlanSetInput } from '../../share/plans'

// ===========================================================================
// Independent helpers. None of these call app code.

type P2 = [number, number]
const D2R = Math.PI / 180

/** Shoelace formula, signed (positive counter-clockwise). */
function shoelace(p: P2[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]
    const [x2, y2] = p[(i + 1) % p.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}
const areaOf = (p: P2[]) => Math.abs(shoelace(p))
const perimeterOf = (p: P2[]) => p.reduce((t, a, i) => t + Math.hypot(p[(i + 1) % p.length][0] - a[0], p[(i + 1) % p.length][1] - a[1]), 0)
const sideLengths = (p: P2[]) => p.map((a, i) => Math.hypot(p[(i + 1) % p.length][0] - a[0], p[(i + 1) % p.length][1] - a[1]))

/** Winding-number point-in-polygon (a different method from the app's ray casting). */
function inside(x: number, y: number, poly: P2[]): boolean {
  let wn = 0
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i]
    const [bx, by] = poly[(i + 1) % poly.length]
    const isLeft = (bx - ax) * (y - ay) - (x - ax) * (by - ay)
    if (ay <= y) {
      if (by > y && isLeft > 0) wn++
    } else if (by <= y && isLeft < 0) wn--
  }
  return wn !== 0
}

function pointSegDist(p: P2, a: P2, b: P2): number {
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const L2 = ux * ux + uy * uy
  let t = L2 === 0 ? 0 : ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / L2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * ux), p[1] - (a[1] + t * uy))
}

function segsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

/** Shortest distance between two segments. */
function segSegDist(a: P2, b: P2, c: P2, d: P2): number {
  if (segsCross(a, b, c, d)) return 0
  return Math.min(pointSegDist(a, c, d), pointSegDist(b, c, d), pointSegDist(c, a, b), pointSegDist(d, a, b))
}

/** Shortest distance from a polygon (as closed rings of edges) to one segment. */
function ringsToSegDist(rings: P2[][], a: P2, b: P2): number {
  let best = Infinity
  for (const r of rings) for (let i = 0; i < r.length; i++) best = Math.min(best, segSegDist(r[i], r[(i + 1) % r.length], a, b))
  return best
}

/** House frame -> site local frame: rotate anticlockwise by `rotation` degrees, then shift. */
function houseToSite(p: P2, pl: { e: number; n: number; rotation: number }, origin: P2): P2 {
  const c = Math.cos(pl.rotation * D2R)
  const s = Math.sin(pl.rotation * D2R)
  return [pl.e - origin[0] + c * p[0] - s * p[1], pl.n - origin[1] + s * p[0] + c * p[1]]
}
function siteToHouse(q: P2, pl: { e: number; n: number; rotation: number }, origin: P2): P2 {
  const c = Math.cos(pl.rotation * D2R)
  const s = Math.sin(pl.rotation * D2R)
  const x = q[0] - (pl.e - origin[0])
  const y = q[1] - (pl.n - origin[1])
  return [c * x + s * y, -s * x + c * y]
}

/** Compass bearing (clockwise from north) of a vector given as (east, north). */
const compass = (east: number, north: number) => ((Math.atan2(east, north) / D2R) % 360 + 360) % 360
/** Eight-point compass name, written independently of the app's bearingName. */
function compassName(deg: number): string {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
  return names[Math.floor((((deg % 360) + 360 + 22.5) % 360) / 45)]
}

/** Keep the part of a polygon where f >= level (f linear), by Sutherland–Hodgman against one half-plane. */
function clipWhere(poly: P2[], f: (p: P2) => number, level: number, keepAbove: boolean): P2[] {
  const out: P2[] = []
  const g = (p: P2) => (keepAbove ? f(p) - level : level - f(p))
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ga = g(a)
    const gb = g(b)
    if (ga >= 0) out.push(a)
    if ((ga >= 0) !== (gb >= 0)) {
      const t = ga / (ga - gb)
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
    }
  }
  return out
}
function centroid(p: P2[]): P2 {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]
    const [x2, y2] = p[(i + 1) % p.length]
    const f = x1 * y2 - x2 * y1
    a += f
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  return [cx / (3 * a), cy / (3 * a)]
}
/** Exact ∫ f dA over a polygon for linear f: area × f(centroid). */
const integrateLinear = (p: P2[], f: (q: P2) => number) => (p.length < 3 ? 0 : areaOf(p) * f(centroid(p)))
/** Exact volumes between a plane f and a level over a polygon (vertical sides). */
function prismVolumes(poly: P2[], f: (p: P2) => number, level: number) {
  const above = clipWhere(poly, f, level, true)
  const below = clipWhere(poly, f, level, false)
  return { cut: integrateLinear(above, p => f(p) - level), fill: integrateLinear(below, p => level - f(p)) }
}

/** Independent model of levelled pads with batters, using exact Euclidean distances on a fine sample grid. */
interface MyPad {
  rings: P2[]
  level: number
  fill: boolean
}
interface MyOpts {
  margin: number
  cutBatter: number
  fillBatter: number
}
function padDistance(p: P2, pad: MyPad): number {
  if (inside(p[0], p[1], pad.rings)) return 0
  let d = Infinity
  for (let i = 0; i < pad.rings.length; i++) d = Math.min(d, pointSegDist(p, pad.rings[i], pad.rings[(i + 1) % pad.rings.length]))
  return d
}
interface MySamples {
  pts: P2[]
  g: Float64Array
  d: Float64Array[]
  h: number
  edge: Int16Array
}
function sampleSite(natural: (x: number, y: number) => number, boundary: P2[], pads: MyPad[], opts: MyOpts, h: number): MySamples {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of boundary) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const pts: P2[] = []
  const g: number[] = []
  const edge: number[] = []
  for (let y = minY + h / 2; y < maxY; y += h) {
    for (let x = minX + h / 2; x < maxX; x += h) {
      if (!inside(x, y, boundary)) continue
      pts.push([x, y])
      g.push(natural(x, y))
      let best = -1
      let bd = 0.375 // 1.5 grid cells of 0.25 m, as the boundary warning uses
      boundary.forEach((a, k) => {
        const dd = pointSegDist([x, y], a, boundary[(k + 1) % boundary.length])
        if (dd < bd) {
          bd = dd
          best = k
        }
      })
      edge.push(best)
    }
  }
  const d = pads.map(pad =>
    Float64Array.from(pts, p => {
      const dist = padDistance(p, pad)
      return dist === 0 ? 0 : Math.max(0, dist - opts.margin)
    }),
  )
  return { pts, g: Float64Array.from(g), d, h, edge: Int16Array.from(edge) }
}
function myEarthworks(s: MySamples, pads: MyPad[], opts: MyOpts, shift = 0) {
  let cut = 0
  let fill = 0
  let maxCut = 0
  let maxFill = 0
  const edges = new Set<number>()
  const a = s.h * s.h
  for (let k = 0; k < s.pts.length; k++) {
    let c = Infinity
    let f = -Infinity
    pads.forEach((pad, i) => {
      const d = s.d[i][k]
      const L = pad.level + shift
      c = Math.min(c, d === 0 ? L : opts.cutBatter > 0 ? L + d / opts.cutBatter : Infinity)
      if (pad.fill) f = Math.max(f, d === 0 ? L : opts.fillBatter > 0 ? L - d / opts.fillBatter : -Infinity)
    })
    const z = Math.min(Math.max(s.g[k], f), c)
    const dz = z - s.g[k]
    if (dz < 0) {
      cut -= dz * a
      maxCut = Math.max(maxCut, -dz)
    } else {
      fill += dz * a
      maxFill = Math.max(maxFill, dz)
    }
    if (Math.abs(dz) > 0.05 && s.edge[k] >= 0) edges.add(s.edge[k])
  }
  return { cut, fill, maxCut, maxFill, edges: [...edges].sort((p, q) => p - q) }
}
function myBalance(s: MySamples, pads: MyPad[], opts: MyOpts): number | null {
  const f = (x: number) => {
    const r = myEarthworks(s, pads, opts, x)
    return r.fill - r.cut
  }
  let lo = -6
  let hi = 6
  if (f(lo) > 0 || f(hi) < 0) return null
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2
    if (f(m) < 0) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}

/** A tiny DXF reader, independent of the app's parser: entities with their layer and group codes. */
function rawDxf(text: string) {
  const lines = text.split(/\r?\n/)
  const pairs: [number, string][] = []
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i].trim()), lines[i + 1].trim()])
  let i = pairs.findIndex(([c, v]) => c === 2 && v === 'ENTITIES')
  const ents: { type: string; layer: string; codes: [number, string][] }[] = []
  let cur: (typeof ents)[number] | null = null
  for (i++; i < pairs.length; i++) {
    const [c, v] = pairs[i]
    if (c === 0) {
      if (cur) ents.push(cur)
      cur = null
      if (v === 'ENDSEC') break
      cur = { type: v, layer: '', codes: [] }
    } else if (cur) {
      if (c === 8 && !cur.layer) cur.layer = v
      cur.codes.push([c, v])
    }
  }
  const num = (e: (typeof ents)[number], code: number) => Number(e.codes.find(([c]) => c === code)?.[1] ?? NaN)
  return { ents, num }
}

/** Every text string drawn on each PDF page, and the raw content streams. */
function pdfPages(bytes: Uint8Array): { stream: string; texts: string[] }[] {
  const s = new TextDecoder('latin1').decode(bytes)
  return [...s.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m => ({
    stream: m[1],
    texts: [...m[1].matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(t =>
      t[1].replace(/\\([0-7]{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8))).replace(/\\([()\\])/g, '$1'),
    ),
  }))
}
const PT_TO_MM = 25.4 / 72
/** Side lengths (paper mm) of the first closed path drawn after a given line-width operator. */
function pathAfter(stream: string, op: string): number[] {
  const lines = stream.split('\n')
  const at = lines.indexOf(op)
  const pts: P2[] = []
  for (let i = at + 1; i < lines.length && lines[i] !== 'S'; i++) {
    const m = /^(-?[\d.]+) (-?[\d.]+) [ml]$/.exec(lines[i])
    if (m) pts.push([Number(m[1]) * PT_TO_MM, Number(m[2]) * PT_TO_MM])
  }
  return sideLengths(pts)
}

/** The paper drawing area of plans.ts, re-derived: paper less 10 mm margins, the title strip and padding. */
const DRAWING_AREA: Record<Paper, { w: number; h: number }> = {
  A3: { w: 420 - 20 - 8, h: 297 - 20 - 26 - 10 },
  A4: { w: 297 - 20 - 8, h: 210 - 20 - 22 - 10 },
}
const STANDARD_SCALES = [20, 50, 100, 200, 250, 500, 1000, 2000]
/** The smallest standard scale, no finer than `prefer`, that fits the points in 90 % of the drawing area. */
function expectedScale(pts: P2[], turnDeg: number, paper: Paper, prefer: number): number {
  const c = Math.cos(turnDeg * D2R)
  const s = Math.sin(turnDeg * D2R)
  const r = pts.map(([x, y]) => [x * c - y * s, x * s + y * c])
  const w = Math.max(Math.max(...r.map(p => p[0])) - Math.min(...r.map(p => p[0])), 1)
  const h = Math.max(Math.max(...r.map(p => p[1])) - Math.min(...r.map(p => p[1])), 1)
  const a = DRAWING_AREA[paper]
  return STANDARD_SCALES.find(sc => sc >= prefer && (w * 1000) / sc <= 0.9 * a.w && (h * 1000) / sc <= 0.9 * a.h) ?? 2000
}

/** Bounding box size of points. */
function bboxSize(pts: P2[]): [number, number] {
  const xs = pts.map(p => p[0])
  const ys = pts.map(p => p[1])
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
}

/** Gradient of a ground function by central differences over `h`, as (d/dx, d/dy). */
const gradAt = (z: (x: number, y: number) => number, x: number, y: number, h: number): P2 => [(z(x + h / 2, y) - z(x - h / 2, y)) / h, (z(x, y + h / 2) - z(x, y - h / 2)) / h]

/**
 * Driveway grades over a rectangle given in the house frame (x across, y along the drive), on ground z
 * in the site frame: mean slope magnitude over the area, end-to-end grade along the centreline, the
 * steepest 1 m and 3 m of the centreline, the steepest 1 m across, and the steepest fall edge to edge.
 */
function drivewayGrades(z: (x: number, y: number) => number, rect: { x0: number; x1: number; y0: number; y1: number }, toSiteFn: (p: P2) => P2) {
  const Z = (p: P2) => {
    const q = toSiteFn(p)
    return z(q[0], q[1])
  }
  let sum = 0
  let n = 0
  for (let x = rect.x0 + 0.1; x < rect.x1; x += 0.2)
    for (let y = rect.y0 + 0.1; y < rect.y1; y += 0.2) {
      const q = toSiteFn([x, y])
      sum += Math.hypot(...gradAt(z, q[0], q[1], 0.25))
      n++
    }
  const xc = (rect.x0 + rect.x1) / 2
  const endToEnd = Math.abs(Z([xc, rect.y1]) - Z([xc, rect.y0])) / (rect.y1 - rect.y0)
  let along = 0
  for (let y = rect.y0; y + 1 <= rect.y1 + 1e-9; y += 0.1) along = Math.max(along, Math.abs(Z([xc, y + 1]) - Z([xc, y])))
  let along3 = 0
  for (let y = rect.y0; y + 3 <= rect.y1 + 1e-9; y += 0.05) along3 = Math.max(along3, Math.abs(Z([xc, y + 3]) - Z([xc, y])) / 3)
  let cross = 0
  for (let y = rect.y0 + 0.1; y < rect.y1; y += 0.2) for (let x = rect.x0; x + 1 <= rect.x1 + 1e-9; x += 0.1) cross = Math.max(cross, Math.abs(Z([x + 1, y]) - Z([x, y])))
  let edgeToEdge = 0
  for (let y = rect.y0; y <= rect.y1 + 1e-9; y += 0.05) edgeToEdge = Math.max(edgeToEdge, Math.abs(Z([rect.x1, y]) - Z([rect.x0, y])) / (rect.x1 - rect.x0))
  return { meanSlope: sum / n, endToEnd, steepestAlong1m: along, steepestAlong3m: along3, steepestCross1m: cross, crossEdgeToEdge: edgeToEdge }
}

// Display formats copied from the components, so the audit can state what the screen shows.
const show = {
  m2: (v: number, d = 2) => `${v.toFixed(d)} m²`,
  mm: (v: number) => Math.round(v * 1000).toString(),
  rl: (v: number) => `RL ${v.toFixed(2)}`,
  printSize: (v: number) => v.toFixed(1),
}

/** Synthetic comparisons (app vs independent), saved to AUDIT_SYNTH_OUT when set. */
const synth: Record<string, unknown> = {}
afterAll(() => {
  if (process.env.AUDIT_SYNTH_OUT) writeFileSync(process.env.AUDIT_SYNTH_OUT, JSON.stringify(synth, null, 2))
})

// ===========================================================================
// A synthetic block whose ground is an exact plane, so every number has a closed form.
//
// World coordinates: z = 60 + 0.04 (E − 5000) + 0.12 (N − 8000). The ground rises
// 12.65 % towards bearing 18.43° and falls towards 198.43° (south).

const GX = 0.04
const GY = 0.12
const planeW = (E: number, N: number) => 60 + GX * (E - 5000) + GY * (N - 8000)
const BOUNDARY_W: P2[] = [
  [5000, 8000],
  [5031, 8003],
  [5028, 8046],
  [4997, 8042],
]

function syntheticDxf(z: (E: number, N: number) => number, contours: boolean): string {
  const ents: string[] = []
  // Spot levels every 2 m, well past the boundary so the terrain needs no extrapolation.
  for (let E = 4987; E <= 5041; E += 2) for (let N = 7990; N <= 8056; N += 2) ents.push(point('SPOT_LEVELS', [E, N, z(E, N)]))
  if (contours) {
    for (let c = 59; c <= 68; c += 0.5) {
      const pts: [number, number, number][] = []
      for (let E = 4988; E <= 5040; E += 4) {
        const N = 8000 + (c - 60 - GX * (E - 5000)) / GY
        if (N > 7990 && N < 8056) pts.push([E, N, c])
      }
      if (pts.length >= 2) ents.push(polyline3d(c % 1 === 0 ? 'CONTOUR_MAJOR' : 'CONTOUR_MINOR', pts))
    }
  }
  ents.push(lwpolyline('LOT_BOUNDARY', [...BOUNDARY_W, BOUNDARY_W[0]]))
  return dxf(ents)
}

function loadSite(text: string): { survey: Survey; terrain: Terrain } {
  const doc = parseDxf(text)
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  return { survey, terrain: buildTerrain(survey) }
}

const L0 = 'level_ground'
const wall = (id: string, a: P2, b: P2, thickness: number, kind: Wall['kind'] = 'external'): Wall => ({ id, level: L0, a, b, thickness, kind })

/**
 * A 12 m × 9 m (centreline) house with 300 mm external walls and one 110 mm internal
 * wall at x = 5 m, so its outside is 12.3 m × 9.3 m. Turned 15° on the block.
 */
function syntheticPlan(patch: Partial<Plan> = {}): Plan {
  return {
    version: 1,
    name: 'Audit house',
    levels: [{ id: L0, name: 'Ground floor', elevation: 0, height: 2.7 }],
    walls: [
      wall('s', [0, 0], [12, 0], 0.3),
      wall('e', [12, 0], [12, 9], 0.3),
      wall('n', [12, 9], [0, 9], 0.3),
      wall('w', [0, 9], [0, 0], 0.3),
      wall('mid', [5, 0], [5, 9], 0.11, 'internal'),
    ],
    openings: [],
    rooms: [
      { id: 'r1', level: L0, name: 'Bedroom', at: [2.5, 4.5] },
      { id: 'r2', level: L0, name: 'Living', at: [8, 4.5] },
    ],
    areas: [
      { id: 'drive', level: L0, name: 'Driveway', kind: 'driveway', pts: [[0, -12], [3.5, -12], [3.5, -5], [0, -5]] },
      { id: 'garden', level: L0, name: 'Garden', kind: 'garden', pts: [[14, 0], [18, 0], [18, 5], [14, 5]] },
    ],
    roofs: [],
    stairs: [],
    furniture: [],
    placement: { e: 5008, n: 8016, rotation: 15, ffl: 63.2 },
    earthworks: { margin: 0.5, cutBatter: 2, fillBatter: 2, subfloor: 0.4 },
    ...patch,
  }
}
/** The outside faces of the synthetic house, worked out by hand: 150 mm out from each centreline. */
const SYN_OUTLINE: P2[] = [
  [-0.15, -0.15],
  [12.15, -0.15],
  [12.15, 9.15],
  [-0.15, 9.15],
]

function earthFor(plan: Plan, survey: Survey, terrain: Terrain): { prep: PreparedEarthworks; result: EarthworksResult } {
  const prep = prepareEarthworks(terrain.grid, survey.boundary, earthworksPlatforms(plan, survey.origin), earthworksOf(plan), earthworksBarriers(plan, survey.origin))
  return { prep, result: evaluateEarthworks(prep) }
}

describe('synthetic plane block: site panel, RL readouts, slope and fall', () => {
  const { survey, terrain } = loadSite(syntheticDxf(planeW, true))
  const plane = (x: number, y: number) => planeW(x + survey.origin[0], y + survey.origin[1])
  const local = BOUNDARY_W.map(([E, N]) => [E - survey.origin[0], N - survey.origin[1]] as P2)

  it('site area and perimeter are the shoelace area and summed sides of the boundary', () => {
    expect(areaOf(BOUNDARY_W)).toBe(1328) // worked by hand: (9 + 1471 + 1302 − 126) / 2
    expect(terrain.stats.area).toBeCloseTo(1328, 9)
    expect(terrain.stats.perimeter).toBeCloseTo(perimeterOf(BOUNDARY_W), 9)
  })

  it('the hover readout RL is the plane, to the millimetre, anywhere inside the block', () => {
    let worst = 0
    for (let k = 0; k < 400; k++) {
      const x = 2 + (k % 20) * 1.47
      const y = 3 + Math.floor(k / 20) * 2.03
      if (!inside(x, y, local)) continue
      worst = Math.max(worst, Math.abs(terrain.grid.sample(x, y) - plane(x, y)))
    }
    expect(worst).toBeLessThan(0.001)
    // E and N are the local frame plus the survey origin.
    expect(survey.boundary.map(p => [p[0] + survey.origin[0], p[1] + survey.origin[1]]).sort()).toEqual([...BOUNDARY_W].sort())
  })

  it('RL range is the plane at the corners, less up to a grid cell of slope (min/max over grid nodes)', () => {
    const zs = BOUNDARY_W.map(([E, N]) => planeW(E, N))
    const exactMin = Math.min(...zs) // 60.00 at (5000, 8000)
    const exactMax = Math.max(...zs) // 66.64 at (5028, 8046)
    const slack = Math.hypot(GX, GY) * 2 * terrain.grid.cell
    expect(terrain.stats.minRL).toBeGreaterThanOrEqual(exactMin - 1e-4)
    expect(terrain.stats.minRL - exactMin).toBeLessThan(slack)
    expect(terrain.stats.maxRL).toBeLessThanOrEqual(exactMax + 1e-4)
    expect(exactMax - terrain.stats.maxRL).toBeLessThan(slack)
  })

  it('average slope, steepest slope and fall direction are the plane gradient', () => {
    const slopePct = 100 * Math.hypot(GX, GY) // 12.649 %
    expect(terrain.stats.meanSlopePct).toBeCloseTo(slopePct, 1)
    expect(terrain.stats.maxSlopePct).toBeCloseTo(slopePct, 1)
    const fall = compass(-GX, -GY) // 198.43°
    expect(terrain.stats.fallBearing).toBeCloseTo(fall, 1)
    expect(bearingName(terrain.stats.fallBearing)).toBe(compassName(fall))
    expect(compassName(fall)).toBe('south')
    // "1 in X": 100 / 12.649 = 7.9
    expect((100 / terrain.stats.meanSlopePct).toFixed(1)).toBe('7.9')
  })

  /** An 8 m × 3 m drive on the site centred at c, its long side along direction u (unit). */
  const driveAt = (c: P2, u: P2): P2[] => {
    const v: P2 = [-u[1], u[0]]
    return [
      [c[0] - 4 * u[0] - 1.5 * v[0], c[1] - 4 * u[1] - 1.5 * v[1]],
      [c[0] + 4 * u[0] - 1.5 * v[0], c[1] + 4 * u[1] - 1.5 * v[1]],
      [c[0] + 4 * u[0] + 1.5 * v[0], c[1] + 4 * u[1] + 1.5 * v[1]],
      [c[0] - 4 * u[0] + 1.5 * v[0], c[1] - 4 * u[1] + 1.5 * v[1]],
    ]
  }
  /** "1 in X (P%)", written out here rather than taken from the app. */
  const ratio = (g: number) => `1 in ${(1 / g).toFixed(1)} (${(g * 100).toFixed(0)}%)`

  // The driveway panel and the PDF key measure grade along the drive's long axis, down its middle, on the
  // finished ground. Until this was fixed it showed the steepest slope in any direction, so a drive laid
  // along the contours read the full fall of the block.
  it('driveway grade is measured along the drive: laid along a contour it reads level, with the full cross-fall', () => {
    const plan = syntheticPlan()
    const { result } = earthFor(plan, survey, terrain)
    // Along the contours: bearing 108.43°, at right angles to the gradient (GX, GY).
    const site = driveAt([14, 7], [Math.cos(-18.4349 * D2R), Math.sin(-18.4349 * D2R)])
    const alongDrive = Math.abs(plane(site[1][0], site[1][1]) - plane(site[0][0], site[0][1])) / 8
    const crossFall = Math.abs(plane(site[3][0], site[3][1]) - plane(site[0][0], site[0][1])) / 3
    expect(alongDrive).toBeLessThan(1e-4)
    expect(crossFall).toBeCloseTo(Math.hypot(GX, GY), 4)
    const g = drivewayGrade(result.grid, site)!
    synth.drivewayAlongContour = { app: g, shown: [gradeText(g.average), gradeText(g.steepest), driveVerdict(g)], gradeAlongDrive: alongDrive, crossFall }
    expect(g.length).toBeCloseTo(8, 6)
    expect(g.average).toBeLessThan(0.001)
    expect(g.steepest).toBeLessThan(0.001)
    expect(g.crossFall).toBeCloseTo(crossFall, 3)
    expect(gradeText(g.average)).toBe('level (0%)')
    expect(gradeText(g.steepest)).toBe('level (0%)')
    expect(`${(g.crossFall * 100).toFixed(0)}%`).toBe('13%')
    expect(driveVerdict(g)).toBe('OK to drive')
  })

  it('a drive laid straight downhill reads the full plane gradient along it and no cross-fall', () => {
    const plan = syntheticPlan()
    const { result } = earthFor(plan, survey, terrain)
    const m = Math.hypot(GX, GY)
    const site = driveAt([14, 7], [GX / m, GY / m])
    const alongDrive = Math.abs(plane(site[1][0], site[1][1]) - plane(site[0][0], site[0][1])) / 8
    expect(alongDrive).toBeCloseTo(m, 9) // 12.65 %
    const g = drivewayGrade(result.grid, site)!
    synth.drivewayDownhill = { app: g, shown: [gradeText(g.average), gradeText(g.steepest), driveVerdict(g)], gradeAlongDrive: alongDrive }
    expect(g.average).toBeCloseTo(alongDrive, 4)
    expect(g.steepest).toBeCloseTo(alongDrive, 4)
    expect(g.crossFall).toBeLessThan(0.001)
    expect(gradeText(g.average)).toBe(ratio(alongDrive)) // 1 in 7.9 (13%)
    expect(gradeText(g.steepest)).toBe('1 in 7.9 (13%)')
    expect(driveVerdict(g)).toBe('OK to drive')
  })

  it('the steepest 3 m stretch decides the verdict: over 1 in 4 is too steep', () => {
    // An 18 m drive up ground that is level for 8 m, rises 1 in 3 for 6 m, then is level for 4 m: 2 m in all,
    // so 1 in 9 end to end. The kinks fall on rows of spot levels, so the TIN follows them exactly.
    const kink = (E: number, N: number) => 60 + 0.01 * (E - 5000) + Math.min(Math.max(N - 8020, 0), 6) / 3
    const k = loadSite(syntheticDxf(kink, false))
    const local = (x: number, y: number) => kink(x + k.survey.origin[0], y + k.survey.origin[1])
    const x0 = 5010 - k.survey.origin[0]
    const y0 = 8012 - k.survey.origin[1]
    const drive: P2[] = [
      [x0, y0],
      [x0 + 3, y0],
      [x0 + 3, y0 + 18],
      [x0, y0 + 18],
    ]
    const average = Math.abs(local(x0 + 1.5, y0 + 18) - local(x0 + 1.5, y0)) / 18
    expect(average).toBeCloseTo(1 / 9, 9)
    const g = drivewayGrade(k.terrain.grid, drive)!
    synth.drivewayKink = { app: g, shown: [gradeText(g.average), gradeText(g.steepest), driveVerdict(g)] }
    expect(g.average).toBeCloseTo(average, 2)
    // Any 3 m inside the rise is 1 in 3 (the grid's smoothing only rounds the kinks).
    expect(g.steepest).toBeCloseTo(1 / 3, 3)
    expect(g.crossFall).toBeCloseTo(0.01, 2)
    expect(driveVerdict(g)).toBe('Too steep: over 1 in 4')
    expect(DRIVE_RUN).toBe(3)
  })

  it('major contour labels (toFixed(0)) are exact because majors are whole metres', () => {
    for (const c of survey.contours.filter(c => c.major)) expect(Number(c.z.toFixed(0))).toBe(c.z)
  })
})

describe('synthetic house: rooms, floor area, wall lengths, boundary distances', () => {
  const { survey } = loadSite(syntheticDxf(planeW, true))
  const plan = syntheticPlan()
  const faces = planarFaces(plan.walls)

  it('room areas are shoelace areas of the inside faces of their walls', () => {
    // Bedroom: x 0.15 → 4.945 (half of 300 mm, half of 110 mm), y 0.15 → 8.85.
    const bed = areaOf([[0.15, 0.15], [4.945, 0.15], [4.945, 8.85], [0.15, 8.85]])
    const living = areaOf([[5.055, 0.15], [11.85, 0.15], [11.85, 8.85], [5.055, 8.85]])
    expect(bed).toBeCloseTo(41.7165, 9)
    expect(living).toBeCloseTo(59.1165, 9)
    expect(roomShape(plan.rooms[0], faces)!.area).toBeCloseTo(bed, 9)
    expect(roomShape(plan.rooms[1], faces)!.area).toBeCloseTo(living, 9)
  })

  it('floor area (outside of walls) is the shoelace area of the outside faces: 114.39 m²', () => {
    expect(buildingOutline(faces).area).toBeCloseTo(areaOf(SYN_OUTLINE), 9)
    expect(areaOf(SYN_OUTLINE)).toBeCloseTo(114.39, 9)
  })

  it('outdoor area sizes are shoelace areas of what was drawn', () => {
    expect(areaOf(plan.areas[0].pts as P2[])).toBeCloseTo(24.5, 9)
    expect(areaOf(plan.areas[1].pts as P2[])).toBeCloseTo(20, 9)
  })

  it('wall lengths shown are centreline lengths in whole mm', () => {
    expect(plan.walls.map(w => show.mm(wallLength(w)))).toEqual(['12000', '9000', '12000', '9000', '9000'])
  })

  it('boundary distances are the shortest segment-to-segment distance from the outside of the walls to each side', () => {
    const app = boundaryClearances(buildingOutline(faces).outlines, plan.placement, survey)
    const ring = SYN_OUTLINE.map(p => houseToSite(p, plan.placement, survey.origin))
    const b = survey.boundary as P2[]
    const ccw = shoelace(b) > 0
    expect(app).toHaveLength(b.length)
    b.forEach((p, i) => {
      const q = b[(i + 1) % b.length]
      const d = ringsToSegDist([ring], p, q)
      expect(app[i].dist).toBeCloseTo(d, 9)
      // The side is named by the direction it faces, i.e. its outward normal.
      const [dx, dy] = [q[0] - p[0], q[1] - p[1]]
      const out = ccw ? compass(dy, -dx) : compass(-dy, dx)
      expect(app[i].name).toBe(compassName(out))
    })
  })
})

describe('cut and fill: closed forms', () => {
  it('pad with vertical sides on a plane: exact prism volumes from clipping the pad at the pad level', () => {
    const { survey, terrain } = loadSite(syntheticDxf(planeW, true))
    const plan = syntheticPlan({ earthworks: { margin: 0, cutBatter: 0, fillBatter: 0, subfloor: 0.4 } })
    const f = (p: P2) => planeW(p[0] + survey.origin[0], p[1] + survey.origin[1])
    const pad = SYN_OUTLINE.map(p => houseToSite(p, plan.placement, survey.origin))
    const level = plan.placement.ffl - 0.3
    const exact = prismVolumes(pad, f, level)
    const { prep, result } = earthFor(plan, survey, terrain)
    // Grid of 0.25 m nodes; the pad edge falls between nodes, so allow 3 %.
    expect(exact.cut).toBeGreaterThan(5)
    expect(exact.fill).toBeGreaterThan(5)
    expect(result.cut / exact.cut).toBeGreaterThan(0.97)
    expect(result.cut / exact.cut).toBeLessThan(1.03)
    expect(result.fill / exact.fill).toBeGreaterThan(0.97)
    expect(result.fill / exact.fill).toBeLessThan(1.03)
    // Deepest cut and fill are at pad corners.
    const depths = pad.map(p => f(p) - level)
    expect(Math.abs(result.maxCut - Math.max(...depths))).toBeLessThan(0.05)
    expect(Math.abs(result.maxFill - Math.max(...depths.map(d => -d)))).toBeLessThan(0.05)
    // Balance: with vertical sides cut = fill when the pad is at the mean ground level under it,
    // which on a plane is the plane at the pad's centroid.
    const shift = balancingShift(prep)!
    const balancedPad = f(centroid(pad))
    expect(level + shift).toBeCloseTo(balancedPad, 1)
    expect(Math.abs(level + shift - balancedPad)).toBeLessThan(0.02)
    // The message rounds the new floor to 10 mm.
    const ffl = Math.round((plan.placement.ffl + shift) * 100) / 100
    expect(Math.abs(ffl - (balancedPad + 0.3))).toBeLessThanOrEqual(0.02)
    synth.verticalPadOnPlane = { exact: exact, app: { cut: result.cut, fill: result.fill, maxCut: result.maxCut, maxFill: result.maxFill }, balancedFFL: { exact: balancedPad + 0.3, app: plan.placement.ffl + shift } }
  })

  // Steiner: around a convex W × D pad, level margin m then a batter of b horizontal per 1 vertical,
  // H deep, on flat ground: V = H (A + P m + π m²) + (P + 2π m) b H² / 2 + π b² H³ / 3.
  const steiner = (W: number, D: number, m: number, b: number, H: number) => {
    const A = W * D
    const P = 2 * (W + D)
    return H * (A + P * m + Math.PI * m * m) + ((P + 2 * Math.PI * m) * b * H * H) / 2 + (Math.PI * b * b * H ** 3) / 3
  }

  it.each([
    ['cut', 49.3, 1, 0.5, 2],
    ['fill', 51.3, 1, 0.5, 2],
    ['cut', 48.8, 1.5, 0.5, 1],
    ['fill', 51.8, 1.5, 0, 3],
    ['cut', 49.3, 1, 0, 0],
  ] as const)('flat block, %s 1 m-ish deep with margin and batters, matches Steiner closed form (ffl %s)', (kind, ffl, H, m, b) => {
    const { survey, terrain } = loadSite(syntheticDxf(() => 50, false))
    const plan = syntheticPlan({ placement: { e: 5008, n: 8016, rotation: 15, ffl }, earthworks: { margin: m, cutBatter: b, fillBatter: b, subfloor: 0.4 } })
    const { result } = earthFor(plan, survey, terrain)
    const exact = steiner(12.3, 9.3, m, b, H)
    const got = kind === 'cut' ? result.cut : result.fill
    expect(kind === 'cut' ? result.fill : result.cut).toBeLessThan(1e-6)
    expect(Math.abs(got / exact - 1)).toBeLessThan(0.02)
    expect(kind === 'cut' ? result.maxCut : result.maxFill).toBeCloseTo(H, 4)
    synth[`steiner ${kind} H=${H} m=${m} b=${b}`] = { exact, app: got, error: got / exact - 1 }
  })

  it('sloping block with margin and 1 in 2 batters matches an exact-distance integration of the same model', () => {
    const { survey, terrain } = loadSite(syntheticDxf(planeW, true))
    const plan = syntheticPlan()
    const ew = earthworksOf(plan)
    const pads: MyPad[] = [{ rings: SYN_OUTLINE.map(p => houseToSite(p, plan.placement, survey.origin)), level: plan.placement.ffl - 0.3, fill: true }]
    const nat = (x: number, y: number) => planeW(x + survey.origin[0], y + survey.origin[1])
    const s = sampleSite(nat, survey.boundary as P2[], pads, ew, 0.1)
    const mine = myEarthworks(s, pads, ew)
    const { prep, result } = earthFor(plan, survey, terrain)
    expect(Math.abs(result.cut / mine.cut - 1)).toBeLessThan(0.03)
    expect(Math.abs(result.fill / mine.fill - 1)).toBeLessThan(0.03)
    expect(Math.abs(result.maxCut - mine.maxCut)).toBeLessThan(0.05)
    expect(Math.abs(result.maxFill - mine.maxFill)).toBeLessThan(0.05)
    expect(Math.abs(balancingShift(prep)! - myBalance(s, pads, ew)!)).toBeLessThan(0.02)
    synth.slopedPadWithBatters = { independent: mine, app: { cut: result.cut, fill: result.fill, maxCut: result.maxCut, maxFill: result.maxFill }, shift: { app: balancingShift(prep), independent: myBalance(s, pads, ew) } }
  })
})

describe('retaining walls on the plane: height, top RL and face area in closed form', () => {
  const { survey, terrain } = loadSite(syntheticDxf(planeW, true))
  // A 200 mm wall along the uphill (north) side, on the edge of the 0.5 m level margin.
  const rw = wall('rw', [-0.15, 9.65], [12.15, 9.65], 0.2, 'retaining')
  const base = syntheticPlan({ earthworks: { margin: 0.5, cutBatter: 0, fillBatter: 0, subfloor: 0.4 } })
  const plan: Plan = { ...base, walls: [...base.walls, rw] }
  const { result } = earthFor(plan, survey, terrain)
  const profile = retainingProfile(rw, plan, survey.origin, result.grid)
  const pad = plan.placement.ffl - 0.3
  // Samples are 0.1 + max(0.3, 1.4 × 0.25) = 0.45 m off the centreline: in front is the pad level,
  // behind is natural ground.
  const behind = (s: number) => {
    const p = houseToSite([-0.15 + s, 9.65 + 0.45], plan.placement, survey.origin)
    return planeW(p[0] + survey.origin[0], p[1] + survey.origin[1])
  }

  it('holds back natural ground minus the pad level; tallest at the uphill end', () => {
    const hEnd = Math.max(behind(0), behind(12.3)) - pad
    expect(profile.maxHeight).toBeCloseTo(hEnd, 3)
    expect(Math.round(profile.maxHeight * 1000)).toBe(Math.round(hEnd * 1000))
  })

  it('top of wall is the higher ground plus 100 mm freeboard, as a range along the wall', () => {
    expect(RETAINING_FREEBOARD).toBe(0.1)
    expect(profile.top[0]).toBeCloseTo(Math.min(behind(0), behind(12.3)) + 0.1, 3)
    expect(profile.top[1]).toBeCloseTo(Math.max(behind(0), behind(12.3)) + 0.1, 3)
  })

  it('face area (ground to ground) is the integral of the height along the wall', () => {
    // Linear along the wall, so length × height at the middle.
    expect(profile.faceArea).toBeCloseTo(12.3 * (behind(6.15) - pad), 2)
    expect(profile.length).toBeCloseTo(12.3, 9)
    synth.retaining = {
      maxHeight: { exact: Math.max(behind(0), behind(12.3)) - pad, app: profile.maxHeight },
      top: { exact: [Math.min(behind(0), behind(12.3)) + 0.1, Math.max(behind(0), behind(12.3)) + 0.1], app: profile.top },
      faceArea: { exact: 12.3 * (behind(6.15) - pad), app: profile.faceArea },
    }
  })

  it('names the side it holds back by compass: the house +y side faces bearing 345° (north)', () => {
    expect(profile.high).toBe('left')
    expect(highSideBearing(profile, plan)).toBeCloseTo(345, 6)
    expect(bearingName(highSideBearing(profile, plan)!)).toBe('north')
  })

  it('with 1 in 2 batters a long wall still keeps natural ground behind its middle', () => {
    const long = wall('rw2', [-8, 9.65], [20, 9.65], 0.2, 'retaining')
    const p2: Plan = { ...syntheticPlan(), walls: [...syntheticPlan().walls, long] }
    const r2 = earthFor(p2, survey, terrain).result
    const prof = retainingProfile(long, p2, survey.origin, r2.grid)
    const mid = prof.samples[Math.round(prof.samples.length / 2)]
    const at = houseToSite([-8 + mid.s, 9.65 + 0.45], p2.placement, survey.origin)
    expect(mid.left).toBeCloseTo(planeW(at[0] + survey.origin[0], at[1] + survey.origin[1]), 3)
    expect(mid.right).toBeCloseTo(p2.placement.ffl - 0.3, 3)
  })
})

// A retaining wall told what to hold: a side with a level becomes level ground beside the wall, which
// batters back to the natural ground. Checked here on the plane with hand calculations: the wall's height,
// the level ground's cut and fill as exact prisms, and how far the batters run out.
describe('retaining walls with levels: height, level ground and batters by hand', () => {
  const { survey, terrain } = loadSite(syntheticDxf(planeW, true))
  const g = terrain.grid
  /** The plane in the survey's local frame, which is also the house frame below. */
  const z = (x: number, y: number) => planeW(x + survey.origin[0], y + survey.origin[1])
  // The wall runs west to east along y = 20.125, 22 m long, 200 mm thick. Grid nodes sit on whole multiples
  // of 0.25 m, so the centreline and every edge of the level ground fall on half-cell lines: each node is
  // wholly in or out, and summing the nodes is the midpoint rule, exact for a plane.
  const Y = 20.125
  const X0 = 3.125
  const X1 = 25.125
  const T = 0.2
  const BENCH = 1.9 // past the face, so the level ground ends 2.0 m off the centreline
  const LOW = 61.5
  const HIGH = 64
  const AREA = (X1 - X0) * (T / 2 + BENCH) // 22 m × 2 m
  const rw = (retain?: Retain): Wall => ({ ...wall('rw', [X0, Y], [X1, Y], T, 'retaining'), ...(retain ? { retain } : {}) })
  const planFor = (w: Wall, batter: number): Plan =>
    syntheticPlan({
      walls: [w],
      rooms: [],
      areas: [],
      placement: { e: survey.origin[0], n: survey.origin[1], rotation: 0, ffl: 63.2 },
      earthworks: { margin: 0.5, cutBatter: batter, fillBatter: batter, subfloor: 0.4 },
    })
  const run = (w: Wall, batter: number) => {
    const plan = planFor(w, batter)
    const { prep, result } = earthFor(plan, survey, terrain)
    return { plan, prep, result, profile: retainingProfile(w, plan, survey.origin, result.grid) }
  }
  // Retaining samples are 0.1 + max(0.3, 1.4 × 0.25) = 0.45 m off the centreline, every 0.25 m along it.
  const OFF = 0.45

  it('the grid lines up with the wall as the hand calculations assume', () => {
    expect(g.cell).toBe(0.25)
    expect(((g.x0 % g.cell) + g.cell) % g.cell).toBe(0)
    expect(((g.y0 % g.cell) + g.cell) % g.cell).toBe(0)
    // North (+y) is uphill, so a wall drawn west to east holds back its left side.
    expect(z(10, Y + 1)).toBeGreaterThan(z(10, Y - 1))
    const natural = retainingProfile(rw(), planFor(rw(), 0), survey.origin, g)
    expect(natural.high).toBe('left')
  })

  it('a wall with no levels, or only its side, adds no level ground: the numbers from before levels existed', () => {
    // Measured on this branch's base before the change, for the 12.3 m wall behind the audit house.
    const before = {
      0: { cut: 42.59360146522522, fill: 10.725687026977539, maxCut: 1.1899948120117188, maxFill: 0.7300033569335938, shift: 0.2307194584627723, maxHeight: 1.2529357140426356, face: 10.139008425129385, top: [63.3956843496585, 64.25293723992154] },
      2: { cut: 54.86681604385376, fill: 15.84363055229187, maxCut: 1.1899948120117188, maxFill: 0.7300033569335938, shift: 0.20512398661048792, maxHeight: 1.0986304987587232, face: 8.984663744462505, top: [63.234661500976806, 64.09863202463762] },
    }
    for (const b of [0, 2] as const) {
      for (const retain of [undefined, { high: 'left' } as Retain]) {
        const old = { ...wall('rw', [-0.15, 9.65], [12.15, 9.65], 0.2, 'retaining'), ...(retain ? { retain } : {}) }
        const base = syntheticPlan({ earthworks: { margin: 0.5, cutBatter: b, fillBatter: b, subfloor: 0.4 } })
        const plan: Plan = { ...base, walls: [...base.walls, old] }
        expect(earthworksPlatforms(plan, survey.origin)).toEqual(earthworksPlatforms(base, survey.origin))
        const { prep, result } = earthFor(plan, survey, terrain)
        const p = retainingProfile(old, plan, survey.origin, result.grid)
        const was = before[b]
        expect(result.cut).toBeCloseTo(was.cut, 9)
        expect(result.fill).toBeCloseTo(was.fill, 9)
        expect(result.maxCut).toBeCloseTo(was.maxCut, 9)
        expect(result.maxFill).toBeCloseTo(was.maxFill, 9)
        expect(balancingShift(prep)!).toBeCloseTo(was.shift, 9)
        expect(p.maxHeight).toBeCloseTo(was.maxHeight, 9)
        expect(p.faceArea).toBeCloseTo(was.face, 9)
        expect(p.top[0]).toBeCloseTo(was.top[0], 9)
        expect(p.top[1]).toBeCloseTo(was.top[1], 9)
        // "Wall … m high" is still the height held back plus the 100 mm upstand.
        expect(exposedHeight(p)).toBeCloseTo(was.maxHeight + RETAINING_FREEBOARD, 9)
      }
    }
  })

  it('cut to a level on the low side: a prism of 22 × 2 m × (plane at its middle − level), and the height is high ground − level', () => {
    const w = rw({ high: 'left', lowLevel: LOW, lowBench: BENCH })
    const { plan, result, profile } = run(w, 0)
    // The level ground: from the centreline 2 m south, the wall's whole length.
    const [bench] = earthworksPlatforms(plan, survey.origin)
    expect(bench).toMatchObject({ level: LOW, fill: true, soft: true, fixed: true, margin: 0 })
    expect(areaOf(bench.include[0])).toBeCloseTo(AREA, 9)
    const ys = bench.include[0].map(p => p[1]).sort((a, b) => a - b)
    ;[Y - 2, Y - 2, Y, Y].forEach((y, i) => expect(ys[i]).toBeCloseTo(y, 9))
    // All of it is above the level (lowest corner: z(3.125, 18.125) = 62.18), so it's all cut.
    expect(z(X0, Y - 2)).toBeGreaterThan(LOW)
    const cut = AREA * (z((X0 + X1) / 2, Y - 1) - LOW) // 44 × (62.74 − 61.5) = 54.56 m³
    expect(cut).toBeCloseTo(54.56, 9)
    expect(Math.abs(result.cut - cut)).toBeLessThan(1e-3)
    expect(result.fill).toBe(0)
    expect(result.maxCut).toBeCloseTo(z(X1 - 0.125, Y - 0.125) - LOW, 4) // the node nearest the high corner
    // Height: natural ground 0.45 m behind the wall less the level in front. It's tallest at the east end;
    // the last sample, at the very end, reads the ground half on and half off the level ground, so the
    // tallest sample is one step (0.25 m) in, where the plane is 0.04 × 0.25 = 10 mm lower.
    const atEnd = z(X1, Y + OFF) - LOW
    const measured = z(X1 - 0.25, Y + OFF) - LOW
    expect(profile.maxHeight).toBeCloseTo(measured, 4)
    expect(atEnd - profile.maxHeight).toBeCloseTo(GX * 0.25, 4)
    expect(profile.high).toBe('left')
    // The top follows the high ground, 100 mm above it.
    expect(profile.top[1]).toBeCloseTo(z(X1, Y + OFF) + RETAINING_FREEBOARD, 4)
    synth.retainingLevels = { cut: { exact: cut, app: result.cut }, height: { exact: measured, app: profile.maxHeight } }
  })

  it('fill to a level on the high side: a prism of 22 × 2 m × (level − plane at its middle)', () => {
    const w = rw({ high: 'left', highLevel: HIGH, highBench: BENCH })
    const { result, profile } = run(w, 0)
    expect(z(X1, Y + 2)).toBeLessThan(HIGH) // highest corner 63.54: all of it is filled
    const fill = AREA * (HIGH - z((X0 + X1) / 2, Y + 1)) // 44 × (64 − 62.98) = 44.88 m³
    expect(fill).toBeCloseTo(44.88, 9)
    expect(Math.abs(result.fill - fill)).toBeLessThan(1e-3)
    expect(result.cut).toBe(0)
    // Tallest where the natural ground in front is lowest: the west end, one sample in.
    expect(profile.maxHeight).toBeCloseTo(HIGH - z(X0 + 0.25, Y - OFF), 4)
  })

  it('both sides levelled: the height is the difference of the levels, and a set top stands where it is told', () => {
    const w = rw({ high: 'left', highLevel: HIGH, highBench: BENCH, lowLevel: LOW, lowBench: BENCH, top: 64.3 })
    const { result, profile } = run(w, 0)
    expect(Math.abs(result.cut - AREA * (z((X0 + X1) / 2, Y - 1) - LOW))).toBeLessThan(1e-3)
    expect(Math.abs(result.fill - AREA * (HIGH - z((X0 + X1) / 2, Y + 1)))).toBeLessThan(1e-3)
    expect(profile.maxHeight).toBeCloseTo(HIGH - LOW, 5) // 2.50 m
    expect(profile.top).toEqual([64.3, 64.3])
    expect(exposedHeight(profile)).toBeCloseTo(64.3 - LOW, 5) // 2.80 m of wall face on the low side
    // Counted with the other retaining walls.
    const all = retainingProfiles(planFor(w, 0), survey.origin, result.grid)
    expect(all).toHaveLength(1)
    expect(all[0].maxHeight).toBeCloseTo(2.5, 5)
    expect(all[0].length).toBeCloseTo(22, 9)
  })

  it('batters run out from the level ground at 1 in 2 until they meet the natural ground', () => {
    const w = rw({ high: 'left', highLevel: HIGH, highBench: BENCH, lowLevel: LOW, lowBench: BENCH })
    const { result } = run(w, 2)
    const x = 14 // a column of grid nodes, well clear of the wall's ends
    // Uphill of the fill, the batter falls 1 in 2 while the ground rises 0.12 per metre, so they meet
    // (64 − z at the edge) / (1/2 + 0.12) out from the edge of the level ground.
    const fillEdge = Y + 2
    const fillRun = (HIGH - z(x, fillEdge)) / (1 / 2 + GY) // (64 − 63.095) / 0.62 = 1.460 m
    // Downhill of the cut, the batter rises 1 in 2 while the ground falls 0.12 per metre.
    const cutEdge = Y - 2
    const cutRun = (z(x, cutEdge) - LOW) / (1 / 2 + GY) // (62.615 − 61.5) / 0.62 = 1.798 m
    let lastFill = 0
    for (let y = fillEdge + 0.125; y < fillEdge + 4; y += 0.25) {
      const want = Math.max(z(x, y), HIGH - (y - fillEdge) / 2)
      expect(result.grid.sample(x, y)).toBeCloseTo(want, 4)
      if (HIGH - (y - fillEdge) / 2 > z(x, y)) lastFill = y - fillEdge
    }
    let lastCut = 0
    for (let y = cutEdge - 0.125; y > cutEdge - 4; y -= 0.25) {
      const want = Math.min(z(x, y), LOW + (cutEdge - y) / 2)
      expect(result.grid.sample(x, y)).toBeCloseTo(want, 4)
      if (LOW + (cutEdge - y) / 2 < z(x, y)) lastCut = cutEdge - y
    }
    // The last node still on the batter is within one grid step of the run-out.
    expect(fillRun - lastFill).toBeGreaterThanOrEqual(0)
    expect(fillRun - lastFill).toBeLessThan(0.25)
    expect(cutRun - lastCut).toBeGreaterThanOrEqual(0)
    expect(cutRun - lastCut).toBeLessThan(0.25)
    synth.retainingBatterRunOut = { fill: { exact: fillRun, lastNode: lastFill }, cut: { exact: cutRun, lastNode: lastCut } }
    // On the level ground itself, nothing but the level.
    expect(result.grid.sample(x, Y + 1)).toBeCloseTo(HIGH, 4)
    expect(result.grid.sample(x, Y - 1)).toBeCloseTo(LOW, 4)
  })
})

describe('roofs: ridge height and sloping area from trigonometry', () => {
  const pitch = 22.5
  const t = Math.tan(pitch * D2R)
  const roof = (type: RoofType, pts: P2[] = SYN_OUTLINE): Roof => ({
    id: `roof-${type}`,
    level: L0,
    pts,
    type,
    pitch,
    overhang: 0.45,
    gables: defaultGables(pts),
    lowEdge: 0,
  })
  // Outline with the 450 mm overhang: 13.2 m × 10.2 m.
  const W = 13.2
  const D = 10.2

  it('hip: height = 150 mm edge + (span/2)·tan(pitch); area = plan area / cos(pitch)', () => {
    const g = roofGeometry(roof('hip'))
    expect(g.error).toBeNull()
    expect(g.height).toBeCloseTo(0.15 + (D / 2) * t, 6) // 2.262 m
    expect(g.area).toBeCloseTo((W * D) / Math.cos(pitch * D2R), 6) // 145.73 m²
  })

  it('gable on the short ends: same ridge height and same sloping area', () => {
    const g = roofGeometry(roof('gable'))
    expect(g.height).toBeCloseTo(0.15 + (D / 2) * t, 6)
    expect(g.area).toBeCloseTo((W * D) / Math.cos(pitch * D2R), 6)
  })

  it('skillion rising across the 10.2 m span from its low (long) edge', () => {
    const g = roofGeometry(roof('skillion'))
    expect(g.height).toBeCloseTo(0.15 + D * t, 6)
    expect(g.area).toBeCloseTo((W * D) / Math.cos(pitch * D2R), 6)
  })

  it('flat: 300 mm deep, area is the plan area', () => {
    const g = roofGeometry(roof('flat'))
    expect(g.height).toBeCloseTo(0.3, 9)
    expect(g.area).toBeCloseTo(W * D, 9)
  })

  it('square hip is a pyramid: 10 m square at 30° rises 5·tan 30°', () => {
    const sq: P2[] = [[0, 0], [9.1, 0], [9.1, 9.1], [0, 9.1]]
    const g = roofGeometry({ ...roof('hip', sq), pitch: 30 })
    expect(g.height).toBeCloseTo(0.15 + 5 * Math.tan(30 * D2R), 6)
    expect(g.area).toBeCloseTo(100 / Math.cos(30 * D2R), 6)
  })

  it('top of roof RL and height above natural ground (max over ridge ends and eaves corners)', () => {
    const { survey, terrain } = loadSite(syntheticDxf(planeW, true))
    const plan = syntheticPlan()
    const r = roof('hip')
    const g = roofGeometry(r)
    const base = plan.placement.ffl + 2.7
    expect(base + g.height).toBeCloseTo(63.2 + 2.7 + 0.15 + 5.1 * t, 6)
    // First-principles vertex set: eaves corners at 0 and 0.15 m, ridge ends at x = −0.6 + 5.1 and 12.6 − 5.1, y = 4.5.
    const corners: P2[] = [[-0.6, -0.6], [12.6, -0.6], [12.6, 9.6], [-0.6, 9.6]]
    const ridge: P2[] = [[4.5, 4.5], [7.5, 4.5]]
    const nat = (p: P2) => {
      const s = houseToSite(p, plan.placement, survey.origin)
      return planeW(s[0] + survey.origin[0], s[1] + survey.origin[1])
    }
    const expected = Math.max(...corners.map(p => base + 0.15 - nat(p)), ...ridge.map(p => base + 0.15 + 5.1 * t - nat(p)))
    // What the roof panel computes (inline in PlanSections): max over mesh vertices of base + z − natural ground.
    let above = 0
    for (let i = 0; i < g.mesh.pos.length; i += 3) {
      const q = houseToSite([g.mesh.pos[i], g.mesh.pos[i + 1]], plan.placement, survey.origin)
      above = Math.max(above, base + g.mesh.pos[i + 2] - terrain.grid.sample(q[0], q[1]))
    }
    expect(above).toBeCloseTo(expected, 3)
    synth.roofHip = { height: { exact: 0.15 + 5.1 * t, app: g.height }, area: { exact: (W * D) / Math.cos(pitch * D2R), app: g.area }, aboveGround: { exact: expected, app: above } }
  })
})

describe('suspects raised by the simulated users', () => {
  const { survey, terrain } = loadSite(syntheticDxf(planeW, true))
  const nat = (p: P2, plan: Plan) => {
    const q = houseToSite(p, plan.placement, survey.origin)
    return planeW(q[0] + survey.origin[0], q[1] + survey.origin[1])
  }

  // (2) earthworksPlatforms (platforms.ts:358) cuts the ground under a floor on piers down to
  // FFL − 300 mm floor − 400 mm subfloor gap, with no fill. On a block in cut that digs deeper, as the
  // Cut and fill panel says ("cut back under floors on piers"); the Room panel says the opposite.
  it('piers: the ground under a floor on piers is cut 400 mm below the slab pad, so deepest cut grows by the gap', () => {
    const slab = syntheticPlan()
    const piers: Plan = { ...slab, rooms: slab.rooms.map(r => (r.id === 'r2' ? { ...r, foundation: 'piers' } : r)) }
    const a = earthFor(slab, survey, terrain).result
    const b = earthFor(piers, survey, terrain).result
    const platforms = earthworksPlatforms(piers, survey.origin)
    expect(platforms.map(p => [p.level, p.fill])).toEqual([
      [63.2 - 0.3, true],
      [63.2 - 0.3 - 0.4, false],
    ])
    // The highest ground is the north-east corner, inside the Living room: the deepest cut grows by 0.4 m.
    expect(b.maxCut - a.maxCut).toBeCloseTo(0.4, 1)
    expect(b.cut).toBeGreaterThan(a.cut)
    synth.piers = { slab: { cut: a.cut, fill: a.fill, maxCut: a.maxCut }, livingOnPiers: { cut: b.cut, fill: b.fill, maxCut: b.maxCut } }
  })

  // The Room panel once said a floor on piers "leaves the ground as it is". The ground is cut back where it is
  // closer than the subfloor gap under the floor framing, so the text now says so, with the gap the earthworks
  // use. Checked here on the plane with vertical cut faces, where the deepest cut has a closed form.
  it.each([0.4, 0.6])('Room panel piers text gives the gap the earthworks cut to (gap %s m)', subfloor => {
    const ew = { margin: 0, cutBatter: 0, fillBatter: 0, subfloor }
    const base = syntheticPlan({ earthworks: ew })
    const piers: Plan = { ...base, rooms: base.rooms.map(r => (r.id === 'r2' ? { ...r, foundation: 'piers' } : r)) }
    const text = piersGroundNote(earthworksOf(piers))
    expect(text).toMatch(/^A floor on piers leaves the ground as it is, except where it's less than \d+ mm under the floor framing; that ground is cut back to leave room underneath\.$/)
    const gap = Number(/less than (\d+) mm/.exec(text)![1]) / 1000
    expect(gap).toBeCloseTo(subfloor, 9)
    // Living room on piers, to the outside of its walls: x 4.945 → 12.15, y −0.15 → 9.15. The ground rises to the
    // north-east corner, which is cut down to FFL − 300 mm framing − the stated gap.
    const deepest = nat([12.15, 9.15], piers) - (piers.placement.ffl - 0.3 - gap)
    const r = earthFor(piers, survey, terrain).result
    expect(Math.abs(r.maxCut - deepest)).toBeLessThan(0.05)
    // And it is cut, not left as it is: more than with the room on a slab.
    expect(r.cut).toBeGreaterThan(earthFor(base, survey, terrain).result.cut)
  })

  // (3) Retaining walls are stored in the house frame, like every other wall, so sliding the house on the
  // block slides them too, over different ground: their height changes with no edit to the wall.
  it('retaining walls move with the house; "holds back" is ground to ground, the 100 mm upstand is extra', () => {
    const rw = wall('rw', [-0.15, 9.65], [12.15, 9.65], 0.2, 'retaining')
    const base: Plan = { ...syntheticPlan({ earthworks: { margin: 0.5, cutBatter: 0, fillBatter: 0, subfloor: 0.4 } }) }
    const at = (e: number): Plan => ({ ...base, walls: [...base.walls, rw], placement: { ...base.placement, e } })
    const p0 = at(5008)
    const p1 = at(5009)
    const b0 = earthworksBarriers(p0, survey.origin)[0]
    const b1 = earthworksBarriers(p1, survey.origin)[0]
    expect(b1[0][0] - b0[0][0]).toBeCloseTo(1, 9) // the wall moved 1 m east with the house
    const h0 = retainingProfile(rw, p0, survey.origin, earthFor(p0, survey, terrain).result.grid)
    const h1 = retainingProfile(rw, p1, survey.origin, earthFor(p1, survey, terrain).result.grid)
    // Closed form: 1 m east raises the natural ground behind the wall by 0.04 m, the pad stays at FFL − 0.3.
    expect(h1.maxHeight - h0.maxHeight).toBeCloseTo(GX * 1, 3)
    // "Holds back up to" is high ground − low ground. The wall stands 100 mm higher than the high ground, so
    // its exposed face on the low side is maxHeight + 0.1 m at the tallest point.
    const tallest = h0.samples.reduce((a, b) => (Math.abs(b.left - b.right) > Math.abs(a.left - a.right) ? b : a))
    expect(h0.top[1] - Math.min(tallest.left, tallest.right)).toBeCloseTo(h0.maxHeight + RETAINING_FREEBOARD, 6)
    synth.retainingMovesWithHouse = { atE5008_mm: Math.round(h0.maxHeight * 1000), atE5009_mm: Math.round(h1.maxHeight * 1000), exposedFace_mm: Math.round((h0.maxHeight + 0.1) * 1000) }
  })

  // (4) The roof panel's "Height above ground" is the most any roof vertex stands above the natural ground
  // directly below it. A gable's ridge runs out to the gable ends, over the eaves; a hip's ridge stops half
  // a span in. With the same top RL the gable apex can stand over much lower ground.
  it('hip vs gable with the same top RL: height above ground differs by where the ridge ends are', () => {
    const plan = syntheticPlan()
    const t = Math.tan(22.5 * D2R)
    const base = plan.placement.ffl + 2.7
    const mk = (type: RoofType): Roof => ({ id: type, level: L0, pts: SYN_OUTLINE, type, pitch: 22.5, overhang: 0.45, gables: defaultGables(SYN_OUTLINE), lowEdge: 0 })
    const panel = (r: Roof) => {
      const g = roofGeometry(r)
      let above = 0
      for (let i = 0; i < g.mesh.pos.length; i += 3) {
        const q = houseToSite([g.mesh.pos[i], g.mesh.pos[i + 1]], plan.placement, survey.origin)
        above = Math.max(above, base + g.mesh.pos[i + 2] - terrain.grid.sample(q[0], q[1]))
      }
      return { top: base + g.height, above }
    }
    const hip = panel(mk('hip'))
    const gable = panel(mk('gable'))
    expect(hip.top).toBeCloseTo(gable.top, 9)
    const ridge = 0.15 + 5.1 * t
    const corners: P2[] = [[-0.6, -0.6], [12.6, -0.6], [12.6, 9.6], [-0.6, 9.6]]
    const eaves = Math.max(...corners.map(p => base + 0.15 - nat(p, plan)))
    const hipExact = Math.max(eaves, ...[[4.5, 4.5], [7.5, 4.5]].map(p => base + ridge - nat(p as P2, plan)))
    const gableExact = Math.max(eaves, ...[[-0.6, 4.5], [12.6, 4.5]].map(p => base + ridge - nat(p as P2, plan)))
    expect(hip.above).toBeCloseTo(hipExact, 3)
    expect(gable.above).toBeCloseTo(gableExact, 3)
    expect(gable.above).toBeGreaterThan(hip.above)
    synth.hipVsGable = { topRL: hip.top, hipAboveGround: hip.above, gableAboveGround: gable.above }
  })

  // (6) Each sheet picks its own scale to fit what is on it (plans.ts:89), and every sheet is turned the
  // way the screen is (planTurn of the "Top of view" setting), so with north up the floor plans are north-up.
  it('PDF: each sheet has its own scale; floor plans follow the view orientation', () => {
    let plan = syntheticPlan()
    plan = {
      ...plan,
      levels: [...plan.levels, { id: 'up', name: 'First floor', elevation: 3, height: 2.7 }],
      walls: [...plan.walls, ...plan.walls.filter(w => w.kind === 'external').map(w => ({ ...w, id: `${w.id}-up`, level: 'up' }))],
      areas: [...plan.areas, { id: 'deck', level: L0, name: 'Deck', kind: 'deck', pts: [[-6, 0], [0, 0], [0, 9], [-6, 9]] }],
    }
    const { result } = earthFor(plan, survey, terrain)
    const sheets = (up: 'house' | number) =>
      pdfPages(planSetPdf({ plan, survey, siteArea: terrain.stats.area, earthworks: null, ground: result.grid, up, paper: 'A3', title: 'T', date: 'd' })).map(
        p => p.texts.find(t => t.startsWith('Scale '))!,
      )
    const squared = sheets('house')
    const north = sheets(0)
    // The ground floor sheet also holds the driveway, garden and deck, so it needs a smaller scale.
    const gf = expectedScale([...SYN_OUTLINE, ...plan.areas.flatMap(a => a.pts as P2[])], 0, 'A3', 50)
    const ff = expectedScale(SYN_OUTLINE, 0, 'A3', 50)
    expect(squared).toEqual([squared[0], `Scale 1:${gf} at A3`, `Scale 1:${ff} at A3`])
    expect(gf).not.toBe(ff)
    expect(north[1]).toBe(`Scale 1:${expectedScale([...SYN_OUTLINE, ...plan.areas.flatMap(a => a.pts as P2[])], 0 + 15, 'A3', 50)} at A3`)
    synth.pdfScalesPerSheet = { squareToHouse: squared, northUp: north }
  })
})

describe('stairs: risers, treads, length and 2R + G', () => {
  const plan = syntheticPlan()
  const s = (patch: Partial<Stair> = {}): Stair => ({ ...newStair(plan, L0, [1, 1], 90, { shape: 'straight', width: 0.9, turn: 'left' }), ...patch })

  it('default rise is ceiling height + 300 mm floor structure: 3.000 m', () => {
    expect(defaultRise(plan, L0)).toBeCloseTo(2.7 + 0.3, 9)
  })

  it.each([
    [3.0, 16, 0.1875],
    [2.85, 15, 0.19],
    [2.851, 16, 2.851 / 16],
    [0.3, 2, 0.15],
    [1.0, 6, 1 / 6],
  ])('rise %s m: fewest risers of at most 190 mm', (rise, n, r) => {
    expect(riserCount(rise)).toBe(Math.max(2, Math.ceil(rise / 0.19 - 1e-9)))
    expect(riserCount(rise)).toBe(n)
    expect(stairLayout(s({ rise })).riser).toBeCloseTo(r, 9)
    expect(stairLayout(s({ rise })).riser).toBeLessThanOrEqual(0.19 + 1e-12)
  })

  it('2R + G: 2 × 187.5 + 250 = 625 mm, inside the 550–700 mm comfort range', () => {
    const c = stairComfort(s())
    expect(c.value).toBeCloseTo(2 * 0.1875 + 0.25, 12)
    expect(Math.round(c.value * 1000)).toBe(625)
    expect(c.ok).toBe(true)
    expect(stairComfort(s({ going: 0.18 })).ok).toBe(true) // 555 mm
    expect(stairComfort(s({ going: 0.17 })).ok).toBe(false) // 545 mm
    expect(stairComfort(s({ going: 0.33 })).ok).toBe(false) // 705 mm
  })

  it('rounding: risers show to 0.1 mm, "16 × 187.5 mm", so they add up to the rise and to 2R + G = 625 mm', () => {
    expect(stairCounts(s()).risers).toBe('16 × 187.5 mm')
    expect(stairCounts(s()).treads).toBe('15 × 250 mm')
    expect(Math.round(stairComfort(s()).value * 1000)).toBe(625)
    // Re-adding the shown figures gives the same: 2 × 187.5 + 250 = 625 and 16 × 187.5 = 3000 mm, the rise.
    expect(2 * 187.5 + 250).toBe(625)
    expect(16 * 187.5).toBe(3000)
    // A riser that is a whole number of mm shows without a decimal: 2.66 m is 14 × 190 mm.
    expect(stairCounts(s({ rise: 2.66 })).risers).toBe('14 × 190 mm')
    expect(stairCounts(s({ rise: 2.851 })).risers).toBe('16 × 178.2 mm') // 2851 / 16 = 178.19
  })

  // The stair panel's "Treads" once printed (risers − 1) × going for every shape. On an L or U stair one of
  // those steps is the landing (a full-width square or a double-width half landing), so it now counts the
  // treads alone and names the landing.
  it('an L or U stair shows its treads and the landing: 16 risers make 7 + 7 treads and a landing', () => {
    for (const shape of ['l', 'u'] as const) {
      const st = s({ shape })
      const L = stairLayout(st)
      // 16 risers: 8 up to the landing (7 treads, then the landing is the 8th step) and 8 to the top (7 treads).
      expect(L.risers).toBe(16)
      const treads = 2 * (16 / 2 - 1)
      // The same count from the drawn steps: every step one going deep, leaving out the landing.
      expect(L.steps.filter(step => Math.abs(Math.min(...bboxSize(step.pts as P2[])) - st.going) < 1e-9).length).toBe(treads)
      expect(stairCounts(st).treads).toBe(`${treads} × 250 mm + landing`)
    }
    // A straight flight has no landing.
    expect(stairCounts(s()).treads).toBe('15 × 250 mm')
  })

  it('straight flight: n − 1 treads, length (n − 1) × going = 3.75 m; preview tag spans 3750 × 900 mm', () => {
    const L = stairLayout(s())
    expect(L.risers - 1).toBe(15)
    expect(((L.risers - 1) * 0.25).toFixed(2)).toBe('3.75')
    const [w, d] = bboxSize(L.outline as P2[])
    expect(show.mm(Math.max(w, d))).toBe('3750')
    expect(show.mm(Math.min(w, d))).toBe('900')
  })

  it.each([
    ['l', 2.65, 2.65],
    ['u', 2.65, 1.8],
  ] as const)('%s stair footprint: 7 treads + 0.9 m landing along, and its width across', (shape, along, across) => {
    const L = stairLayout(s({ shape, angle: 0 }))
    const [w, d] = bboxSize(L.outline as P2[])
    expect(w).toBeCloseTo(along, 9)
    expect(d).toBeCloseTo(across, 9)
  })
})

describe('site coverage and the PDF sheets', () => {
  const { survey, terrain } = loadSite(syntheticDxf(planeW, true))
  const plan = syntheticPlan()
  const { result } = earthFor(plan, survey, terrain)
  const input = (paper: Paper, up: 'house' | number): PlanSetInput => ({
    plan,
    survey,
    siteArea: terrain.stats.area,
    earthworks: { cut: result.cut, fill: result.fill },
    ground: result.grid,
    up,
    paper,
    title: 'Audit house',
    date: '8 November 2026',
  })

  it('site plan key numbers: site area, footprint, coverage = footprint / site area, FFL, cut / fill, drive grade', () => {
    const [site] = pdfPages(planSetPdf(input('A3', 'house')))
    const tx = site.texts
    const row = (k: string) => (tx.includes(k) ? tx[tx.indexOf(k) + 1] : undefined)
    expect(row('Site area')).toBe('1328 m²')
    // One storey: the footprint is the floor area to the outside of the walls, to the same 2 dp as the Areas panel.
    expect(row('Building footprint (all floors)')).toBe('114.39 m²')
    expect(row('Site coverage')).toBe(`${((114.39 / 1328) * 100).toFixed(1)}%`) // 8.6 %
    expect(row('Ground floor FFL')).toBe('RL 63.20')
    expect(tx).toContain('FFL RL 63.20') // the label on the house
    // To 0.1 m³, as the Cut and fill panel shows them.
    expect(row('Cut / fill')).toBe(`${result.cut.toFixed(1)} / ${result.fill.toFixed(1)} m³`)
    // The driveway runs along the house's y axis (turned 15°), across the plane's gradient (GX, GY).
    const along = Math.abs(-GX * Math.sin(15 * D2R) + GY * Math.cos(15 * D2R)) // 10.56 %
    const ratio = `1 in ${(1 / along).toFixed(1)} (${(along * 100).toFixed(0)}%)`
    expect(ratio).toBe('1 in 9.5 (11%)')
    expect(row('Average grade along the drive')).toBe(ratio)
    expect(row('Steepest 3 m along the drive')).toBe(ratio)
    // Without a driveway there is no grade row.
    const noDrive = pdfPages(planSetPdf({ ...input('A3', 'house'), plan: { ...plan, areas: plan.areas.filter(a => a.kind !== 'driveway') } }))[0].texts
    expect(noDrive).not.toContain('Average grade along the drive')
    expect(noDrive).not.toContain('Steepest 3 m along the drive')
  })

  it.each([
    ['A3', 'house'],
    ['A3', 0],
    ['A4', 'house'],
    ['A4', 0],
  ] as const)('%s, top of view %s: scale chosen to fit, and the drawing really is at that scale', (paper, up) => {
    const pages = pdfPages(planSetPdf(input(paper, up)))
    const turn = up === 'house' ? 0 : up + plan.placement.rotation
    const boundaryHouse = (survey.boundary as P2[]).map(q => siteToHouse(q, plan.placement, survey.origin))
    const siteScale = expectedScale([...boundaryHouse, ...SYN_OUTLINE], turn, paper, 100)
    const floorPts = [...SYN_OUTLINE, ...plan.areas.flatMap(a => a.pts as P2[])]
    const floorScale = expectedScale(floorPts, turn, paper, 50)
    expect(pages).toHaveLength(2)
    expect(pages[0].texts).toContain(`Scale 1:${siteScale} at ${paper}`)
    expect(pages[1].texts).toContain(`Scale 1:${floorScale} at ${paper}`)
    expect(pages[0].texts).toContain('Sheet 1 of 2')
    expect(pages[1].texts).toContain('Sheet 2 of 2')
    // Measure the boundary as drawn (0.6 mm line = "1.7 w") and scale it back up to metres.
    const drawn = pathAfter(pages[0].stream, '1.7 w').map(mm => (mm * siteScale) / 1000).sort((a, b) => a - b)
    const real = sideLengths(BOUNDARY_W).sort((a, b) => a - b)
    drawn.forEach((d, i) => expect(Math.abs(d - real[i])).toBeLessThan(0.002 * real[i] + 0.01))
    // Boundary side labels are the true side lengths to 10 mm.
    for (const len of real) expect(pages[0].texts).toContain(`${len.toFixed(2)} m`)
  })

  it('floor sheet: room areas, level note and overall dimensions (outside faces)', () => {
    const [, floor] = pdfPages(planSetPdf(input('A3', 'house')))
    expect(floor.texts).toContain('41.72 m²')
    expect(floor.texts).toContain('59.12 m²')
    expect(floor.texts).toContain('Ground floor: FFL RL 63.20, ceiling 2700 mm, 114.39 m² to the outside of the walls')
    expect(floor.texts).toContain('12300')
    expect(floor.texts).toContain('9300')
  })

  // The lowest level's "Above ground floor" can be edited in the Levels panel. Its floor is then that much
  // above the placement FFL, as the 3D view, the print, the house pad and the cut and fill have always
  // built it; the site sheet ("Ground floor FFL", the "FFL RL" house label) and the Position panel once
  // showed the placement FFL alone. Every one of them now reads floorRL().
  it('with the ground floor set 0.5 m "above ground floor", the site sheet, floor sheet and pad agree: RL 63.70', () => {
    const raised: Plan = { ...plan, levels: [{ ...plan.levels[0], elevation: 0.5 }] }
    const [site, floor] = pdfPages(planSetPdf({ ...input('A3', 'house'), plan: raised }))
    const siteFfl = site.texts[site.texts.indexOf('Ground floor FFL') + 1]
    const note = floor.texts.find(t => t.startsWith('Ground floor: FFL'))!
    const pad = earthworksPlatforms(raised, survey.origin)[0].level
    synth.fflWithElevation = { siteSheet: siteFfl, floorSheet: note, housePad: pad }
    // 63.20 placement + 0.50 above it.
    expect(siteFfl).toBe('RL 63.70')
    expect(site.texts).toContain('FFL RL 63.70')
    expect(note).toContain('FFL RL 63.70,')
    expect(pad).toBeCloseTo(63.7 - 0.3, 9)
  })

  // Site coverage counts land covered by buildings. With an upper floor that overhangs the ground floor
  // in another direction, the union of the floors covers more ground than either floor alone; the sheet
  // uses the larger single floor instead (Math.max over levels in plans.ts siteSheet).
  it('site coverage counts the ground covered by all floors: their union, not the largest floor', () => {
    const up = 'level_up'
    const two: Plan = {
      ...plan,
      levels: [...plan.levels, { id: up, name: 'First floor', elevation: 3, height: 2.7 }],
      walls: [
        ...plan.walls,
        // Upper floor shifted 4 m east: 12.3 × 9.3 again, overlapping the ground floor by 8.3 × 9.3.
        { ...wall('us', [4, 0], [16, 0], 0.3), level: up },
        { ...wall('ue', [16, 0], [16, 9], 0.3), level: up },
        { ...wall('un', [16, 9], [4, 9], 0.3), level: up },
        { ...wall('uw', [4, 9], [4, 0], 0.3), level: up },
      ],
    }
    const [site] = pdfPages(planSetPdf({ ...input('A3', 'house'), plan: two }))
    const union = 114.39 + 114.39 - 8.3 * 9.3 // 151.59 m²
    const row = (k: string) => site.texts[site.texts.indexOf(k) + 1]
    expect(row('Building footprint (all floors)')).toBe(`${union.toFixed(2)} m²`)
    expect(row('Site coverage')).toBe(`${((union / 1328) * 100).toFixed(1)}%`) // 11.4 %
  })

  it('footprint of floors that cross at an angle: two 10 m squares, one turned 45°, cover 200 − 8 · 5² · tan 22.5°', () => {
    // Outside faces 10 m square: centreline 9.7 m square of 300 mm walls about (5, 5).
    const square = (level: string, turn: number, id: string): Wall[] => {
      const c = Math.cos(turn * D2R)
      const s = Math.sin(turn * D2R)
      const corner = (x: number, y: number): P2 => [5 + c * x - s * y, 5 + s * x + c * y]
      const k: P2[] = [corner(-4.85, -4.85), corner(4.85, -4.85), corner(4.85, 4.85), corner(-4.85, 4.85)]
      return k.map((a, i) => ({ ...wall(`${id}${i}`, a, k[(i + 1) % 4], 0.3), level }))
    }
    const crossed: Plan = {
      ...plan,
      levels: [...plan.levels, { id: 'level_up', name: 'First floor', elevation: 3, height: 2.7 }],
      walls: [...square(L0, 0, 'g'), ...square('level_up', 45, 'u')],
      rooms: [],
      areas: [],
    }
    // The overlap is a regular octagon with inradius 5 m: area 8 r² tan(22.5°).
    const union = 2 * 100 - 8 * 25 * Math.tan(22.5 * D2R) // 117.16 m²
    const [site] = pdfPages(planSetPdf({ ...input('A3', 'house'), plan: crossed, earthworks: null }))
    expect(site.texts[site.texts.indexOf('Building footprint (all floors)') + 1]).toBe(`${union.toFixed(2)} m²`)
  })
})

describe('3D print sizes and plastic volume', () => {
  let wasm: ManifoldToplevel
  beforeAll(async () => {
    wasm = await Module()
    wasm.setup()
  })
  const { survey, terrain } = loadSite(syntheticDxf(planeW, true))
  const settings = (scale: number): PrintSettings => ({ ...DEFAULT_PRINT, scale, tiles: false })

  it.each([100, 200])('1:%s terrain, floor and roof sizes are the real sizes × 1000 / scale (plus keys and base)', scale => {
    const k = 1000 / scale
    const plan0 = syntheticPlan({ areas: [] })
    const plan = addRoof(plan0, L0, SYN_OUTLINE, { type: 'hip', pitch: 22.5, overhang: 0.45 })
    const ground = earthFor(plan, survey, terrain).result.grid
    const model: PrintModel = buildPrintModel(wasm, { plan, survey, ground }, settings(scale))
    const by = (name: string) => model.parts.find(p => p.name === name)!
    const size = (name: string) => [0, 1, 2].map(i => by(name).max[i] - by(name).min[i])
    // Terrain: the boundary's extent, and from the lowest ground minus a 3 mm base to the highest ground.
    const [bw, bd] = bboxSize(BOUNDARY_W)
    const zs = BOUNDARY_W.map(([E, N]) => planeW(E, N))
    const [tw, td, th] = size('Terrain')
    // Parts are stored as 32-bit floats in mm, about 0.05 mm at these sizes; allow 0.1 mm.
    const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.1)
    near(tw, bw * k)
    near(td, bd * k)
    near(th, (Math.max(...zs) - Math.min(...zs)) * k + 3)
    // Floor: the outside of the walls turned 15°, from 300 mm under the floor less a 1.2 mm key
    // to the top of the 2.7 m walls plus a 1.2 mm key into the roof.
    const turned = SYN_OUTLINE.map(p => houseToSite(p, plan.placement, survey.origin))
    const [fw, fd] = bboxSize(turned)
    const [gw, gd, gh] = size('Ground floor')
    near(gw, fw * k)
    near(gd, fd * k)
    near(gh, 3.0 * k + 2 * 1.2)
    // Roof: the 13.2 × 10.2 m outline turned 15°; its eaves are printed deep enough to key onto the
    // walls: max(150 mm, (1.2 + 0.2 + 0.6) mm at this scale).
    const outline: P2[] = [[-0.6, -0.6], [12.6, -0.6], [12.6, 9.6], [-0.6, 9.6]]
    const [rw, rd] = bboxSize(outline.map(p => houseToSite(p, plan.placement, survey.origin)))
    const edge = Math.max(0.15, 2.0 / k)
    const [qw, qd, qh] = size('Roof')
    near(qw, rw * k)
    near(qd, rd * k)
    near(qh, (edge + 5.1 * Math.tan(22.5 * D2R)) * k)
    synth[`print 1:${scale}`] = {
      terrain: { exact: [bw * k, bd * k, (Math.max(...zs) - Math.min(...zs)) * k + 3], app: [tw, td, th] },
      floor: { exact: [fw * k, fd * k, 3.0 * k + 2.4], app: [gw, gd, gh] },
      roof: { exact: [rw * k, rd * k, (edge + 5.1 * Math.tan(22.5 * D2R)) * k], app: [qw, qd, qh] },
    }
  }, 60_000)

  it('plastic volume of a bare terrain block is ∫(ground − base) over the site, in cm³', () => {
    const empty: Plan = { ...syntheticPlan(), walls: [], rooms: [], areas: [] }
    const model = buildPrintModel(wasm, { plan: empty, survey, ground: terrain.grid }, settings(100))
    expect(model.parts.map(p => p.name)).toEqual(['Terrain'])
    const k = 10 // mm per m at 1:100
    const zs = BOUNDARY_W.map(([E, N]) => planeW(E, N))
    const base = Math.min(...zs) - 3 / k
    const c = centroid(BOUNDARY_W)
    const m3 = areaOf(BOUNDARY_W) * (planeW(c[0], c[1]) - base)
    const cm3 = (m3 * k ** 3) / 1000
    expect(Math.abs(model.parts[0].volume / cm3 - 1)).toBeLessThan(0.002)
    synth.terrainVolume_cm3 = { exact: cm3, app: model.parts[0].volume }
  }, 60_000)

  it('tiles: the fewest that fit the bed, e.g. 340 × 460 mm on a 225 × 225 bed is 2 × 3', () => {
    const empty: Plan = { ...syntheticPlan(), walls: [], rooms: [], areas: [] }
    const model = buildPrintModel(wasm, { plan: empty, survey, ground: terrain.grid }, { ...DEFAULT_PRINT, scale: 100 })
    // 34 × 46 m at 1:100: one tile across must be ≤ 225 and one up ≤ 225 (either way round).
    expect([DEFAULT_PRINT.bedX, DEFAULT_PRINT.bedY]).toEqual([225, 225])
    let best: [number, number] | null = null
    for (let nx = 1; nx <= 8; nx++)
      for (let ny = 1; ny <= 8; ny++) {
        const w = 340 / nx
        const d = 460 / ny
        const fits = (w <= 225 && d <= 225) || (d <= 225 && w <= 225)
        if (fits && (!best || nx * ny < best[0] * best[1])) best = [nx, ny]
      }
    expect(best).toEqual([2, 3])
    expect(model.parts).toHaveLength(6)
    expect(model.parts.map(p => p.name)).toEqual(['Terrain A1', 'Terrain B1', 'Terrain A2', 'Terrain B2', 'Terrain A3', 'Terrain B3'])
    for (const p of model.parts) expect(fitsBed(p.max[0] - p.min[0], p.max[1] - p.min[1], DEFAULT_PRINT)).toBe(true)
    // Each tile's size is the box round the piece actually cut, so on a skewed block most are smaller than
    // their grid cell. The widest tile in each column and the deepest in each row still add up to the
    // whole, the boxes together cover the whole, and the volumes add up.
    const whole = buildPrintModel(wasm, { plan: empty, survey, ground: terrain.grid }, settings(100)).parts[0]
    const W = whole.max[0] - whole.min[0]
    const Dd = whole.max[1] - whole.min[1]
    const w = (n: string) => model.parts.find(p => p.name === `Terrain ${n}`)!
    const width = (n: string) => w(n).max[0] - w(n).min[0]
    const depth = (n: string) => w(n).max[1] - w(n).min[1]
    expect(Math.max(width('A1'), width('A2'), width('A3')) + Math.max(width('B1'), width('B2'), width('B3'))).toBeCloseTo(W, 1)
    expect(Math.max(depth('A1'), depth('B1')) + Math.max(depth('A2'), depth('B2')) + Math.max(depth('A3'), depth('B3'))).toBeCloseTo(Dd, 1)
    expect(Math.min(...model.parts.map(p => p.min[0]))).toBeCloseTo(whole.min[0], 3)
    expect(Math.max(...model.parts.map(p => p.max[1]))).toBeCloseTo(whole.max[1], 3)
    expect(model.parts.reduce((t, p) => t + p.volume, 0)).toBeCloseTo(whole.volume, 0)
  }, 60_000)
})

// ===========================================================================
// The made-up sample block, with the made-up garage floor placed on it. Nothing here is a real place.

const SAMPLE_DXF = new URL('../../../samples/sample-block.dxf', import.meta.url)
/** Where the house sits on the sample block, and its floor level. */
const SAMPLE_PLACEMENT = { e: 5006, n: 8004, rotation: 0, ffl: 45.5 }

describe('sample survey and plan (made up)', () => {
  const text = readFileSync(SAMPLE_DXF, 'utf8')
  const { survey, terrain } = loadSite(text)
  const plan = normalizePlan({ ...garageFloor(), name: 'Sample house', placement: SAMPLE_PLACEMENT })
  const raw = rawDxf(text)
  const values: Record<string, unknown> = {}
  const record = (k: string, v: unknown) => {
    values[k] = v
  }

  // The boundary straight from the DXF, in world coordinates.
  const boundaryW: P2[] = (() => {
        const e = raw.ents.find(x => x.type === 'LWPOLYLINE' && x.layer === 'LOT_BOUNDARY')!
        const xs = e.codes.filter(([c]) => c === 10).map(([, v]) => Number(v))
        const ys = e.codes.filter(([c]) => c === 20).map(([, v]) => Number(v))
        const pts = xs.map((x, i) => [x, ys[i]] as P2)
        const last = pts[pts.length - 1]
        return Math.hypot(last[0] - pts[0][0], last[1] - pts[0][1]) < 1e-9 ? pts.slice(0, -1) : pts
      })()
  const boundaryL = boundaryW.map(([E, N]) => [E - (survey?.origin?.[0] ?? 0), N - (survey?.origin?.[1] ?? 0)] as P2)

  // The house outline (outside faces), worked out by hand from the wall centrelines and thicknesses:
  // garage_w x 0.15 − 0.15 = 0; garage_s y 4.25 − 0.15 = 4.1; office_w x 5.45 − 0.15 = 5.3;
  // south y 0.15 − 0.15 = 0; east x 9.95 + 0.15 = 10.1; hall_n y 13.85 + 0.15 = 14.0;
  // hall_w (110 mm) x 8.1 − 0.055 = 8.045; garage_n (110 mm) y 10.55 + 0.055 = 10.605.
  const OUTLINE: P2[] = [
    [0, 4.1],
    [5.3, 4.1],
    [5.3, 0],
    [10.1, 0],
    [10.1, 14.0],
    [8.045, 14.0],
    [8.045, 10.605],
    [0, 10.605],
  ]
  // Rooms on the inside faces of their walls, by hand.
  const ROOMS: Record<string, P2[]> = {
    Garage: [[0.3, 4.4], [8.045, 4.4], [8.045, 10.495], [0.3, 10.495]], // garage_s / laundry_n inside faces both at y 4.4
    Entry: [[8.155, 4.4], [9.8, 4.4], [9.8, 13.7], [8.155, 13.7]],
    Laundry: [[5.6, 3.2], [9.8, 3.2], [9.8, 4.29], [5.6, 4.29]],
    Study: [[5.6, 0.3], [9.8, 0.3], [9.8, 2.9], [5.6, 2.9]],
  }

  it('raw DXF: layer counts shown in the Survey layers panel', () => {
    const count = (layer: string, types: string[]) => raw.ents.filter(e => e.layer === layer && types.includes(e.type)).length
    const layers = analyzeLayers(parseDxf(text))
    const by = Object.fromEntries(layers.map(l => [l.name, l]))
    for (const l of layers) {
      expect(l.polylines).toBe(count(l.name, ['LWPOLYLINE', 'POLYLINE']))
      expect(l.points).toBe(count(l.name, ['POINT']))
      expect(l.texts).toBe(count(l.name, ['TEXT', 'MTEXT']))
    }
    record('layers', Object.fromEntries(layers.map(l => [l.name, { lines: l.polylines, points: l.points, labels: l.texts }])))
    expect(by['PRO_SPOTS'].points).toBe(60)
  })

  it('site area, perimeter and boundary side lengths from the raw boundary', () => {
    const area = areaOf(boundaryW)
    expect(terrain.stats.area).toBeCloseTo(area, 6)
    expect(terrain.stats.perimeter).toBeCloseTo(perimeterOf(boundaryW), 6)
    record('siteArea_m2', area)
    record('siteArea_shown', `${terrain.stats.area.toLocaleString('en-AU', { maximumFractionDigits: 0 })} m²`)
    record('perimeter_m', perimeterOf(boundaryW))
    record('boundarySides_m', sideLengths(boundaryW))
  })

  it('RL range sits inside the surveyed levels and the model matches the spot levels and the owner’s own check points', () => {
    const inB = (x: number, y: number) => inside(x, y, boundaryW)
    const zIn: number[] = []
    for (const e of raw.ents) {
      if (e.type !== 'VERTEX' && e.type !== 'POINT') continue
      if (!/CONTOUR|PRO_SPOTS/.test(e.layer)) continue
      if (inB(raw.num(e, 10), raw.num(e, 20))) zIn.push(raw.num(e, 30))
    }
    const lo = Math.min(...zIn)
    const hi = Math.max(...zIn)
    const zAll = raw.ents.filter(e => (e.type === 'VERTEX' || e.type === 'POINT') && /CONTOUR|PRO_SPOTS/.test(e.layer)).map(e => raw.num(e, 30))
    // A linear TIN (then light smoothing) can't go below or above what was surveyed. Nodes just inside the
    // boundary are interpolated towards survey points outside it, so the range can pass the inside-only range.
    expect(terrain.stats.minRL).toBeGreaterThanOrEqual(Math.min(...zAll) - 0.01)
    expect(terrain.stats.maxRL).toBeLessThanOrEqual(Math.max(...zAll) + 0.01)
    expect(terrain.stats.minRL).toBeLessThanOrEqual(lo + 0.05)
    expect(terrain.stats.maxRL).toBeGreaterThanOrEqual(hi - 0.05)
    const residual = (layer: string) => {
      const d = raw.ents
        .filter(e => e.type === 'POINT' && e.layer === layer && inB(raw.num(e, 10), raw.num(e, 20)))
        .map(e => raw.num(e, 30) - terrain.grid.sample(raw.num(e, 10) - survey.origin[0], raw.num(e, 20) - survey.origin[1]))
      return { n: d.length, meanAbs_mm: (1000 * d.reduce((t, x) => t + Math.abs(x), 0)) / d.length, max_mm: 1000 * Math.max(...d.map(Math.abs)) }
    }
    const spots = residual('PRO_SPOTS')
    const own = residual('SKETCH_POINTS')
    expect(spots.meanAbs_mm).toBeLessThan(30)
    record('surveyedRL_insideBoundary', [lo, hi])
    record('modelRL_range', [terrain.stats.minRL, terrain.stats.maxRL])
    record('RL_shown_sitePanel', `RL ${terrain.stats.minRL.toFixed(2)} to ${terrain.stats.maxRL.toFixed(2)}`)
    record('RL_shown_3Dlegend', [`RL ${terrain.stats.maxRL.toFixed(1)}`, `RL ${terrain.stats.minRL.toFixed(1)}`])
    record('spotLevelResiduals', spots)
    record('ownCheckPointResiduals', own)
  })

  // The TIN passes exactly through every professional spot level, but the 0.25 m grid it is sampled onto
  // and the two smoothing passes pull spot levels that sit above or below the contours back towards them.
  // The rule chosen (8 Nov 2026): where the miss is over 50 mm, use the average of the surveyed level and
  // the smoothed surface. So each spot is now within 50 mm, or within half of what smoothing alone missed by.
  it('the modelled RL at each professional spot level is within 50 mm, or halfway back from the smoothed miss', () => {
    const smoothedOnly = buildTerrain(survey, { honourSpots: false })
    const rows = raw.ents
      .filter(e => e.type === 'POINT' && e.layer === 'PRO_SPOTS' && inside(raw.num(e, 10), raw.num(e, 20), boundaryW))
      .map(e => {
        const x = raw.num(e, 10) - survey.origin[0]
        const y = raw.num(e, 20) - survey.origin[1]
        return { x, y, surveyed: raw.num(e, 30), tin: terrain.tin.heightAt(x, y), grid: terrain.grid.sample(x, y), smoothed: smoothedOnly.grid.sample(x, y) }
      })
    const worst = rows.reduce((a, b) => (Math.abs(b.smoothed - b.surveyed) > Math.abs(a.smoothed - a.surveyed) ? b : a))
    record('worstSpotLevel', { ...worst, smoothedMinusSurveyed_mm: 1000 * (worst.smoothed - worst.surveyed), gridMinusSurveyed_mm: 1000 * (worst.grid - worst.surveyed) })
    record('spotLevelResidualsAfterAveraging', {
      meanAbs_mm: (1000 * rows.reduce((t, r) => t + Math.abs(r.grid - r.surveyed), 0)) / rows.length,
      max_mm: 1000 * Math.max(...rows.map(r => Math.abs(r.grid - r.surveyed))),
    })
    for (const r of rows) expect(Math.abs(r.tin - r.surveyed)).toBeLessThan(1e-6)
    for (const r of rows) {
      const miss = Math.abs(r.smoothed - r.surveyed)
      const allowed = miss > 0.05 ? miss / 2 + 0.005 : 0.05
      expect(Math.abs(r.grid - r.surveyed)).toBeLessThanOrEqual(allowed)
    }
  })

  it('fall direction agrees with a least-squares plane through the surveyed points', () => {
    const xs: number[] = []
    const ys: number[] = []
    const zs: number[] = []
    for (const e of raw.ents) {
      if ((e.type === 'VERTEX' || e.type === 'POINT') && /CONTOUR|PRO_SPOTS/.test(e.layer) && inside(raw.num(e, 10), raw.num(e, 20), boundaryW)) {
        xs.push(raw.num(e, 10) - survey.origin[0])
        ys.push(raw.num(e, 20) - survey.origin[1])
        zs.push(raw.num(e, 30))
      }
    }
    // Normal equations for z = a + b x + c y.
    const n = xs.length
    const S = (f: (i: number) => number) => {
      let s = 0
      for (let i = 0; i < n; i++) s += f(i)
      return s
    }
    const M = [
      [n, S(i => xs[i]), S(i => ys[i])],
      [S(i => xs[i]), S(i => xs[i] ** 2), S(i => xs[i] * ys[i])],
      [S(i => ys[i]), S(i => xs[i] * ys[i]), S(i => ys[i] ** 2)],
    ]
    const v = [S(i => zs[i]), S(i => xs[i] * zs[i]), S(i => ys[i] * zs[i])]
    const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    const col = (j: number) => M.map((r, i) => r.map((x, k) => (k === j ? v[i] : x)))
    const b = det(col(1)) / det(M)
    const c = det(col(2)) / det(M)
    const fit = compass(-b, -c)
    const diff = Math.abs(((terrain.stats.fallBearing - fit + 540) % 360) - 180)
    expect(diff).toBeLessThan(15)
    record('fallBearing_deg', terrain.stats.fallBearing)
    record('fallBearing_lsPlane_deg', fit)
    record('fall_shown', `${bearingName(terrain.stats.fallBearing)} (${terrain.stats.fallBearing.toFixed(0)}°)`)
    record('meanSlopePct', terrain.stats.meanSlopePct)
    record('lsPlaneSlopePct', 100 * Math.hypot(b, c))
    record('maxSlopePct', terrain.stats.maxSlopePct)
    record('slope_shown', `${terrain.stats.meanSlopePct.toFixed(0)}% (1 in ${(100 / terrain.stats.meanSlopePct).toFixed(1)})`)
    // The mean of slope magnitudes can't be less than the slope of the best-fit plane by much.
    expect(terrain.stats.meanSlopePct).toBeGreaterThan(100 * Math.hypot(b, c) * 0.8)
  })

  it('room areas and floor area match the hand-derived inside and outside faces', () => {
    const faces = planarFaces(plan.walls)
    for (const r of plan.rooms) {
      const mine = areaOf(ROOMS[r.name])
      expect(roomShape(r, faces)!.area).toBeCloseTo(mine, 6)
    }
    const gross = buildingOutline(faces)
    expect(gross.area).toBeCloseTo(areaOf(OUTLINE), 6)
    record(
      'rooms_m2',
      Object.fromEntries(plan.rooms.map(r => [r.name, areaOf(ROOMS[r.name])])),
    )
    record('roomsTotal_m2', Object.values(ROOMS).reduce((t, p) => t + areaOf(p), 0))
    record('floorArea_outside_m2', areaOf(OUTLINE))
    record('areas_m2', Object.fromEntries(plan.areas.map(a => [a.name, areaOf(a.pts as P2[])])))
    record('wallLengths_mm', Object.fromEntries(plan.walls.map(w => [w.id, show.mm(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]))])))
    record('overallDims_mm', [show.mm(10.1), show.mm(14.0)])
    for (const w of plan.walls) expect(wallLength(w)).toBeCloseTo(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), 12)
  })

  it('boundary distances from the outside of the walls to each side', () => {
    const ring = OUTLINE.map(p => houseToSite(p, plan.placement, survey.origin))
    const app = boundaryClearances(buildingOutline(planarFaces(plan.walls)).outlines, plan.placement, survey)
    const b = survey.boundary as P2[]
    const out = b.map((p, i) => {
      const q = b[(i + 1) % b.length]
      const d = ringsToSegDist([ring], p, q)
      const name = compassName(compass(q[1] - p[1], -(q[0] - p[0])))
      expect(app[i].dist).toBeCloseTo(d, 6)
      expect(app[i].name).toBe(name)
      return { side: name, dist_m: d, shown_mm: show.mm(d) }
    })
    record('boundaryDistances', out)
  })

  it('levels: FFL, house pad, ground under the house', () => {
    expect(plan.placement.ffl).toBe(SAMPLE_PLACEMENT.ffl)
    record('FFL_shown', show.rl(plan.placement.ffl))
    record('housePad_shown', show.rl(plan.placement.ffl - 0.3))
    // The Position panel samples the natural ground at the outline's corners only.
    const outlineApp = buildingOutline(planarFaces(plan.walls)).outlines.flat() as P2[]
    const corners = outlineApp.map(p => {
      const s = houseToSite(p, plan.placement, survey.origin)
      return terrain.grid.sample(s[0], s[1])
    })
    // Dense sampling of the whole footprint, 50 mm apart, plus its edges and corners.
    let lo = Infinity
    let hi = -Infinity
    const at = (p: P2) => {
      const s = houseToSite(p, plan.placement, survey.origin)
      const z = terrain.grid.sample(s[0], s[1])
      lo = Math.min(lo, z)
      hi = Math.max(hi, z)
    }
    for (let x = 0.025; x < 9.208; x += 0.05) for (let y = 0.025; y < 13.0545; y += 0.05) if (inside(x, y, OUTLINE)) at([x, y])
    OUTLINE.forEach((a, i) => {
      const b = OUTLINE[(i + 1) % OUTLINE.length]
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05)
      for (let k = 0; k <= n; k++) at([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
    })
    record('groundUnderHouse_corners', [Math.min(...corners), Math.max(...corners)])
    record('groundUnderHouse_dense', [lo, hi])
    record('groundUnderHouse_shown', `RL ${Math.min(...corners).toFixed(2)} to ${Math.max(...corners).toFixed(2)}`)
    record('floorVsHighest_shown', `${Math.abs(83 - Math.max(...corners)).toFixed(2)} m ${83 >= Math.max(...corners) ? 'above' : 'below'}`)
    record('floorVsLowest_shown', `${Math.abs(83 - Math.min(...corners)).toFixed(2)} m ${83 >= Math.min(...corners) ? 'above' : 'below'}`)
    // On this block the corners do bracket the ground under the house, to within display precision.
    expect(Math.min(...corners) - lo).toBeLessThan(0.005)
    expect(hi - Math.max(...corners)).toBeLessThan(0.005)
  })

  it('cut and fill: the app agrees with an exact-distance integration of the house pad and both slabs', () => {
    const ew = earthworksOf(plan)
    const pl = plan.placement
    const pads: MyPad[] = [
      { rings: OUTLINE.map(p => houseToSite(p, pl, survey.origin)), level: pl.ffl - 0.3, fill: true },
      // Both outdoor areas have no kind, which the app reads as concrete slabs (older plans): top at FFL, 100 mm thick.
      ...plan.areas.map(a => ({ rings: (a.pts as P2[]).map(p => houseToSite(p, pl, survey.origin)), level: pl.ffl + (a.top ?? 0) - 0.1, fill: true })),
    ]
    const nat = (x: number, y: number) => terrain.grid.sample(x, y)
    const s = sampleSite(nat, survey.boundary as P2[], pads, ew, 0.1)
    const mine = myEarthworks(s, pads, ew)
    const { prep, result } = earthFor(plan, survey, terrain)
    expect(Math.abs(result.cut / mine.cut - 1)).toBeLessThan(0.03)
    expect(Math.abs(result.fill / mine.fill - 1)).toBeLessThan(0.03)
    expect(Math.abs(result.maxCut - mine.maxCut)).toBeLessThan(0.05)
    expect(Math.abs(result.maxFill - mine.maxFill)).toBeLessThan(0.05)
    expect(result.boundaryEdges).toEqual(mine.edges)
    const shiftApp = balancingShift(prep)!
    const shiftMine = myBalance(s, pads, ew)!
    expect(Math.abs(shiftApp - shiftMine)).toBeLessThan(0.02)
    // How much more there would be if the batters were allowed past the boundary.
    const pad = 30
    const big: P2[] = [
      [Math.min(...boundaryL.map(p => p[0])) - pad, Math.min(...boundaryL.map(p => p[1])) - pad],
      [Math.max(...boundaryL.map(p => p[0])) + pad, Math.min(...boundaryL.map(p => p[1])) - pad],
      [Math.max(...boundaryL.map(p => p[0])) + pad, Math.max(...boundaryL.map(p => p[1])) + pad],
      [Math.min(...boundaryL.map(p => p[0])) - pad, Math.max(...boundaryL.map(p => p[1])) + pad],
    ]
    const unbounded = myEarthworks(sampleSite(nat, big, pads, ew, 0.1), pads, ew)
    record('cut_m3', { app: result.cut, independent: mine.cut, shownPanel: `${result.cut.toFixed(1)} m³`, shownPdf: result.cut.toFixed(0) })
    record('fill_m3', { app: result.fill, independent: mine.fill, shownPanel: `${result.fill.toFixed(1)} m³`, shownPdf: result.fill.toFixed(0) })
    record('net_m3', { shown: `${result.cut >= result.fill ? 'Left over to take away' : 'Extra fill to bring in'} ${Math.abs(result.cut - result.fill).toFixed(1)} m³` })
    record('deepest', { cut: result.maxCut, fill: result.maxFill, independentCut: mine.maxCut, independentFill: mine.maxFill })
    const sb = survey.boundary as P2[]
    record('earthworksHitBoundary', result.boundaryEdges.map(i => compassName(compass(sb[(i + 1) % sb.length][1] - sb[i][1], -(sb[(i + 1) % sb.length][0] - sb[i][0])))))
    record('balance', { app: shiftApp, independent: shiftMine, shown: `Floor moved to RL ${(Math.round((pl.ffl + shiftApp) * 100) / 100).toFixed(2)}` })
    record('ifBattersCouldCrossBoundary_m3', { cut: unbounded.cut, fill: unbounded.fill })
  })

  it('PDF: sheet count, scale, true scale of the boundary, key numbers', () => {
    const { result } = earthFor(plan, survey, terrain)
    const base: PlanSetInput = {
      plan,
      survey,
      siteArea: terrain.stats.area,
      earthworks: { cut: result.cut, fill: result.fill },
      ground: result.grid,
      up: 'house',
      paper: 'A3',
      title: 'House plan',
      date: '8 November 2026',
    }
    const out: Record<string, unknown> = {}
    for (const paper of ['A3', 'A4'] as const) {
      for (const up of ['house', 0] as const) {
        const pages = pdfPages(planSetPdf({ ...base, paper, up }))
        const turn = up === 'house' ? 0 : up + plan.placement.rotation
        const bHouse = (survey.boundary as P2[]).map(q => siteToHouse(q, plan.placement, survey.origin))
        const siteScale = expectedScale([...bHouse, ...OUTLINE], turn, paper, 100)
        const floorScale = expectedScale([...OUTLINE, ...plan.areas.flatMap(a => a.pts as P2[])], turn, paper, 50)
        expect(pages[0].texts).toContain(`Scale 1:${siteScale} at ${paper}`)
        expect(pages[1].texts).toContain(`Scale 1:${floorScale} at ${paper}`)
        const drawn = pathAfter(pages[0].stream, '1.7 w').map(mm => (mm * siteScale) / 1000).sort((a, b) => a - b)
        const real = sideLengths(boundaryW).sort((a, b) => a - b)
        drawn.forEach((d, i) => expect(Math.abs(d - real[i])).toBeLessThan(0.002 * real[i] + 0.01))
        out[`${paper}/${up === 'house' ? 'square-to-house' : 'north-up'}`] = { sheets: pages.length, site: `1:${siteScale}`, floor: `1:${floorScale}` }
        if (paper === 'A3' && up === 'house') {
          const tx = pages[0].texts
          const row = (k: string) => tx[tx.indexOf(k) + 1]
          const coverage = (areaOf(OUTLINE) / areaOf(boundaryW)) * 100
          expect(row('Site area')).toBe(`${areaOf(boundaryW).toFixed(0)} m²`)
          // One storey, so the footprint is the floor area to the outside of the walls (2 dp, as the Areas panel).
          expect(row('Building footprint (all floors)')).toBe(`${areaOf(OUTLINE).toFixed(2)} m²`)
          expect(row('Site coverage')).toBe(`${coverage.toFixed(1)}%`)
          // The ground floor's "Above ground floor" is 0, so its FFL is the placement's.
          expect(sortedLevels(plan)[0].elevation).toBe(0)
          expect(row('Ground floor FFL')).toBe(`RL ${plan.placement.ffl.toFixed(2)}`)
          expect(tx).toContain(`FFL RL ${plan.placement.ffl.toFixed(2)}`)
          expect(row('Cut / fill')).toBe(`${result.cut.toFixed(1)} / ${result.fill.toFixed(1)} m³`)
          // No driveway is drawn, so no grade row.
          expect(tx).not.toContain('Average grade along the drive')
          out.keyNumbers = ['Site area', 'Building footprint (all floors)', 'Site coverage', 'Ground floor FFL', 'Cut / fill'].map(k => `${k}: ${row(k)}`)
          out.coveragePct = coverage
          out.floorSheetNote = pages[1].texts.find(t => t.startsWith('Ground floor: FFL'))
          out.sheetNames = pages.map(p => p.texts[p.texts.indexOf('House plan') + 1])
          out.titleBlock = pages.map(p => p.texts.filter(t => /^(Sheet|Scale) /.test(t) || /^\d+(\.\d+)? m$/.test(t)))
          // Floor sheet: each room's area and each wall's centreline length, as on screen.
          const fl = pages[1].texts
          for (const r of plan.rooms) expect(fl).toContain(show.m2(areaOf(ROOMS[r.name])))
          for (const w of plan.walls) expect(fl).toContain(show.mm(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])))
          out.floorSheetOverallDims = fl.filter(t => /^\d{4,5}$/.test(t) && Number(t) > 9000 && !plan.walls.some(w => show.mm(wallLength(w)) === t))
          out.floorSheetAreas = fl.filter(t => / m²$/.test(t))
          // Boundary distances on the site plan are the same mm figures as the sidebar.
          const ring = OUTLINE.map(p => houseToSite(p, plan.placement, survey.origin))
          const b = survey.boundary as P2[]
          for (let i = 0; i < b.length; i++) expect(tx).toContain(show.mm(ringsToSegDist([ring], b[i], b[(i + 1) % b.length])))
        }
      }
    }
    record('pdf', out)
  })

  it('3D print part sizes at 1:100 and 1:200', async () => {
    const wasm = await Module()
    wasm.setup()
    const ground = earthFor(plan, survey, terrain).result.grid
    const out: Record<string, unknown> = {}
    for (const scale of [100, 200]) {
      const k = 1000 / scale
      for (const tiles of [false, true]) {
        const model = buildPrintModel(wasm, { plan, survey, ground }, { ...DEFAULT_PRINT, scale, tiles })
        const parts = model.parts.map(p => {
          const s = [0, 1, 2].map(i => p.max[i] - p.min[i])
          return { name: p.name, size: s, shown: `${s.map(show.printSize).join(' × ')} mm`, cm3: p.volume }
        })
        out[`1:${scale}${tiles ? ` tiled ${DEFAULT_PRINT.bedX}×${DEFAULT_PRINT.bedY}` : ''}`] = { parts, totalShown: `About ${Math.round(model.parts.reduce((t, p) => t + p.volume, 0))} cm³`, notes: model.notes }
        if (tiles) continue
        // Floor: the outline turned −10.3°, 300 mm floor + 2.7 m walls, plus the 1.2 mm key under it.
        const floor = parts.find(p => p.name === 'Ground floor')!
        const [fw, fd] = bboxSize(OUTLINE.map(p => houseToSite(p, plan.placement, survey.origin)))
        // Internal walls under 1.2 mm as printed are thickened, which moves two outside faces out a
        // fraction of a millimetre; allow 0.1 mm.
        expect(Math.abs(floor.size[0] - fw * k)).toBeLessThan(0.1)
        expect(Math.abs(floor.size[1] - fd * k)).toBeLessThan(0.1)
        expect(floor.size[2]).toBeCloseTo(3.0 * k + 1.2, 1)
        // Terrain: the boundary's extent; highest to lowest finished ground plus the 3 mm base.
        const terrainPart = parts.find(p => p.name === 'Terrain')!
        const [bw, bd] = bboxSize(boundaryL)
        expect(terrainPart.size[0]).toBeCloseTo(bw * k, 1)
        expect(terrainPart.size[1]).toBeCloseTo(bd * k, 1)
        let lo = Infinity
        let hi = -Infinity
        for (let x = 0; x < 30; x += 0.05)
          for (let y = 0; y < 40; y += 0.05) {
            if (!inside(x, y, boundaryL)) continue
            const z = ground.sample(x, y)
            lo = Math.min(lo, z)
            hi = Math.max(hi, z)
          }
        expect(Math.abs(terrainPart.size[2] - ((hi - lo) * k + 3))).toBeLessThan(0.3)
      }
    }
    record('print', out)
  }, 120_000)

  it('hypothetical 22.5° hip roof with 450 mm eaves over the house (for mockups)', () => {
    const outline = levelOutlines(plan.walls)[0]
    const withRoof = addRoof(plan, L0, outline, { type: 'hip', pitch: 22.5, overhang: 0.45 })
    const g = roofGeometry(withRoof.roofs[0])
    // Every face slopes at the pitch, so area = plan area of the grown outline / cos(pitch). Growing a
    // rectilinear outline by o adds perimeter × o + 4 o² (convex corners minus reflex corners = 4).
    const o = 0.45
    const grown = areaOf(OUTLINE) + perimeterOf(OUTLINE) * o + 4 * o * o
    expect(g.area).toBeCloseTo(grown / Math.cos(22.5 * D2R), 4)
    // Highest point: the widest square that fits in the grown outline is 7.405 m (the 6.505 m garage
    // depth plus 2 × 450), so the ridge is 3.7025 m in from the eaves.
    expect(g.height).toBeCloseTo(0.15 + 3.7025 * Math.tan(22.5 * D2R), 3)
    record('hypotheticalHipRoof', {
      area_m2: g.area,
      height_aboveWalls_m: g.height,
      topRL: plan.placement.ffl + 2.7 + g.height,
      shown: [`RL ${(plan.placement.ffl + 2.7 + g.height).toFixed(2)}`, `${g.area.toFixed(1)} m²`],
    })
  })

  it('suspect (1): a hypothetical driveway from the garage to the north boundary, grades along the drive', () => {
    const { result } = earthFor(plan, survey, terrain)
    const pl = plan.placement
    const toS = (p: P2) => houseToSite(p, pl, survey.origin)
    // 6 m wide (x 0.5 → 6.5), from just past the north edge of the patio (y 16.7) to 0.3 m short of the boundary.
    const inB = (p: P2) => inside(...toS(p), survey.boundary as P2[])
    let y1 = 16.7
    while (inB([0.5, y1 + 0.35]) && inB([6.5, y1 + 0.35])) y1 += 0.05
    const rect = { x0: 0.5, x1: 6.5, y0: 16.7, y1 }
    const poly: P2[] = [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x1, rect.y1], [rect.x0, rect.y1]].map(p => toS(p as P2))
    const g = drivewayGrade(result.grid, poly)!
    const mine = drivewayGrades((x, y) => result.grid.sample(x, y), rect, toS)
    // 6 m wide and longer than that, so the long axis is the house's y axis and the centreline is x = 3.5.
    expect(g.length).toBeCloseTo(rect.y1 - rect.y0, 6)
    expect(Math.abs(g.average - mine.endToEnd)).toBeLessThan(0.001)
    expect(Math.abs(g.steepest - mine.steepestAlong3m)).toBeLessThan(0.01)
    expect(Math.abs(g.crossFall - mine.crossEdgeToEdge)).toBeLessThan(0.01)
    record('hypotheticalDriveway', {
      houseFrame: rect,
      length_m: rect.y1 - rect.y0,
      shown: { average: gradeText(g.average), steepest3m: gradeText(g.steepest), crossFall: `${(g.crossFall * 100).toFixed(0)}%`, verdict: driveVerdict(g) },
      siteSteepest: `${terrain.stats.maxSlopePct.toFixed(0)}%`,
      meanSlopePct: 100 * mine.meanSlope,
      endToEndPct: 100 * mine.endToEnd,
      steepestAlong1mPct: 100 * mine.steepestAlong1m,
      steepestAlong3mPct: 100 * mine.steepestAlong3m,
      steepestCross1mPct: 100 * mine.steepestCross1m,
      crossEdgeToEdgePct: 100 * mine.crossEdgeToEdge,
    })
  })

  it('suspect (2): setting each room on piers, and suspect (8): the starting FFL before the plan is imported', () => {
    const ew = (p: Plan) => earthFor(p, survey, terrain).result
    const out: Record<string, unknown> = {}
    for (const ffl of [plan.placement.ffl, plan.placement.ffl + 0.15]) {
      const base: Plan = { ...plan, placement: { ...plan.placement, ffl } }
      const r0 = ew(base)
      out[`FFL ${ffl.toFixed(2)} all slab`] = { cut: r0.cut.toFixed(1), fill: r0.fill.toFixed(1), deepestCut: r0.maxCut.toFixed(2) }
      for (const room of plan.rooms) {
        const r = ew({ ...base, rooms: base.rooms.map(x => (x.id === room.id ? { ...x, foundation: 'piers' } : x)) })
        out[`FFL ${ffl.toFixed(2)} ${room.name} on piers`] = { cut: r.cut.toFixed(1), fill: r.fill.toFixed(1), deepestCut: r.maxCut.toFixed(2) }
        expect(r.cut).toBeGreaterThan(r0.cut - 1e-6)
      }
    }
    record('piers', out)
    // An empty plan starts at the block's centroid with the floor at the ground there, to the nearest 50 mm.
    const start = defaultPlacement(survey, terrain)
    const c = centroid(survey.boundary as P2[])
    expect(start.ffl).toBeCloseTo(Math.round(terrain.grid.sample(c[0], c[1]) * 20) / 20, 9)
    record('startingPlacement_beforeImport', start)
    record('importedPlacement', plan.placement)
  })

  it('suspect (5): the 1:100 tiles add up to the whole terrain', async () => {
    const wasm = await Module()
    wasm.setup()
    const ground = earthFor(plan, survey, terrain).result.grid
    const tiled = buildPrintModel(wasm, { plan, survey, ground }, { ...DEFAULT_PRINT, scale: 100 }).parts.filter(p => p.kind === 'terrain')
    const whole = buildPrintModel(wasm, { plan, survey, ground }, { ...DEFAULT_PRINT, scale: 100, tiles: false }).parts.find(p => p.kind === 'terrain')!
    const by = (n: string) => tiled.find(p => p.name === `Terrain ${n}`)!
    const wd = (n: string) => [by(n).max[0] - by(n).min[0], by(n).max[1] - by(n).min[1]]
    const W = whole.max[0] - whole.min[0]
    const Dd = whole.max[1] - whole.min[1]
    expect(tiled.map(p => p.name)).toEqual(['Terrain A1', 'Terrain B1', 'Terrain A2', 'Terrain B2'])
    expect(Math.max(wd('A1')[0], wd('A2')[0]) + Math.max(wd('B1')[0], wd('B2')[0])).toBeCloseTo(W, 1)
    expect(Math.max(wd('A1')[1], wd('B1')[1]) + Math.max(wd('A2')[1], wd('B2')[1])).toBeCloseTo(Dd, 1)
    expect(tiled.reduce((t, p) => t + p.volume, 0)).toBeCloseTo(whole.volume, 0)
    record('tilesAddUp', { whole: [W, Dd], cell: [W / 2, Dd / 2], tiles: Object.fromEntries(['A1', 'B1', 'A2', 'B2'].map(n => [n, wd(n)])), volume: { tiles: tiled.reduce((t, p) => t + p.volume, 0), whole: whole.volume } })
  }, 120_000)

  it('saves the measured values', () => {
    record('placement', plan.placement)
    record('surveyOrigin', survey.origin)
    record('meanSlope_shown', `${terrain.stats.meanSlopePct.toFixed(0)}%`)
    record('maxSlope_shown', `${terrain.stats.maxSlopePct.toFixed(0)}%`)
    record('totalFall_m', terrain.stats.maxRL - terrain.stats.minRL)
    record('retainingWalls', retainingProfiles(plan, survey.origin, terrain.grid).length)
    record('levels', sortedLevels(plan).map(l => ({ name: l.name, rl: (plan.placement.ffl + l.elevation).toFixed(2), ceiling_mm: show.mm(l.height) })))
    console.log(JSON.stringify(values, null, 2))
    if (process.env.AUDIT_OUT) writeFileSync(process.env.AUDIT_OUT, JSON.stringify(values, null, 2))
  })
})
