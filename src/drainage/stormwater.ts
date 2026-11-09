// The stormwater concept, as plain maths: how much roof catches rain, what a tank of a given
// size holds from it, which way the block falls, and where the water would have to go (the
// street by gravity, or the low corner). A concept for a DA's stormwater sketch, not a design:
// a hydraulic engineer sizes the pipes, pits and any on-site detention.

import { centroidOf, signedArea, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import { bearingName, type Heightfield, type Terrain } from '../lib/terrain'
import { frontEdgeOf } from '../plan/streetSide'
import { buildingOutline, planarFaces } from '../plan/geometry'
import { sortedLevels, toSite, type Plan, type RoofType } from '../plan/model'
import { roofGeometry } from '../plan/roof'
import { stormwaterOf } from './model'

// ---------------------------------------------------------------------------
// Sources. Every number or rule the concept leans on is listed here with how sure it is, in the
// form docs/research/compliance-and-swept-path-sources.md uses: read | secondary | unverified.
// There is deliberately no litres-per-m² rule, no suggested tank size and no on-site detention
// trigger: none was found in the research notes with a clause to cite, so the tank size is the
// person's own setting and detention is named as something council decides.

export type Confidence = 'read' | 'secondary' | 'unverified'

export interface SourceNote {
  /** The instrument or page. */
  instrument: string
  /** Clause or section, where there is one. */
  clause?: string
  /** Version or the date the research read it. */
  asAt: string
  url?: string
  confidence: Confidence
  /** What the app takes from it, in plain words. */
  gives: string
}

export const SOURCES: SourceNote[] = [
  {
    instrument: 'Arithmetic (not a rule)',
    asAt: 'always',
    confidence: 'read',
    gives: '1 mm of rain on 1 m² of roof is 1 litre. The tank figures below are that sum and nothing more: losses to first-flush, splash and overflow are not counted.',
  },
  {
    instrument: 'SEPP (Sustainable Buildings) 2022 and the BASIX standards',
    clause: 'BASIX water target',
    asAt: 'BASIX standards in force from 1 Oct 2023; page updated 10 Mar 2025',
    url: 'https://www.planningportal.nsw.gov.au/BASIX-standards',
    confidence: 'read',
    gives: 'A new home needs a BASIX certificate with a water target. The tank size that meets it comes out of the BASIX tool, not from here.',
  },
  {
    instrument: 'Wollongong DCP 2009, Chapter E14 Stormwater Management',
    asAt: 'dated 26 Mar 2020 in the research notes; the chapter itself was not read',
    confidence: 'unverified',
    gives: 'Council’s stormwater rules for a DA, including when on-site detention is needed. No trigger or size is taken from it.',
  },
  {
    instrument: 'Wollongong DCP 2009, Chapter E15 Water Sensitive Urban Design',
    asAt: 'dated 28 Nov 2025 in the research notes; the chapter itself was not read',
    confidence: 'unverified',
    gives: 'Council’s water sensitive design rules, which can ask for rainwater reuse. No number is taken from it.',
  },
]

// ---------------------------------------------------------------------------
// Roof catchment

export interface RoofCatchment {
  id: string
  level: string
  type: RoofType
  /** Plan area of the roof including its eaves (m²): what the rain falls on, as seen from above. */
  planArea: number
  /** Area of the sloping surface (m²), as Design › Roofs shows it. */
  surfaceArea: number
}

/** Each roof that builds, with the plan area it catches rain on. */
export function roofCatchments(plan: Plan): RoofCatchment[] {
  return plan.roofs.flatMap(r => {
    const g = roofGeometry(r)
    if (g.error || g.outline.length < 3) return []
    return [{ id: r.id, level: r.level, type: r.type, planArea: Math.abs(signedArea(g.outline)), surfaceArea: g.area }]
  })
}

export const totalCatchment = (roofs: RoofCatchment[]) => roofs.reduce((t, r) => t + r.planArea, 0)

/** The roofs that drain to the tank: those ticked, or all of them. */
export function tankRoofs(plan: Plan, roofs: RoofCatchment[]): RoofCatchment[] {
  const picked = stormwaterOf(plan).tankRoofs
  return picked ? roofs.filter(r => picked.includes(r.id)) : roofs
}

/** Litres that `mm` of rain puts on `area` m² of roof (1 mm × 1 m² = 1 L; see SOURCES). */
export const litresFromRain = (area: number, mm: number) => area * mm

/** How many mm of rain on `area` m² of roof fill a tank of `litres`; null with no roof. */
export const rainHeldByTank = (litres: number, area: number) => (area > 0 ? litres / area : null)

/** The convex corners of each roof's eaves line: where downpipes most often go (a concept, not a design). */
export function downpipeSpots(plan: Plan): Vec2[] {
  const out: Vec2[] = []
  for (const r of plan.roofs) {
    const g = roofGeometry(r)
    if (g.error) continue
    const o = g.outline
    const n = o.length
    const ccw = signedArea(o) > 0
    for (let i = 0; i < n; i++) {
      const a = o[(i - 1 + n) % n]
      const b = o[i]
      const c = o[(i + 1) % n]
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
      if ((ccw ? cross : -cross) > 1e-9) out.push(b)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// The block's sides and its fall

export interface BoundaryEdge {
  index: number
  a: Vec2
  b: Vec2
  length: number
  /** Compass bearing straight out of this side. */
  outBearing: number
  /** "north side". */
  name: string
}

export function boundaryEdges(boundary: Vec2[]): BoundaryEdge[] {
  const n = boundary.length
  const ccw = signedArea(boundary) > 0
  return boundary.map((a, i) => {
    const b = boundary[(i + 1) % n]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const length = Math.hypot(dx, dy)
    // Outward is to the right of the way round for an anticlockwise boundary, to the left otherwise.
    const nx = ccw ? dy : -dy
    const ny = ccw ? -dx : dx
    const outBearing = ((Math.atan2(nx, ny) * 180) / Math.PI + 360) % 360
    return { index: i, a, b, length, outBearing, name: `${bearingName(outBearing)} side` }
  })
}

/**
 * The side of the block that faces a bearing: the longest side within 60° of it, weighted the
 * way the 3D view's Street view picks its side (see streetBearing in src/phone/camera.ts).
 */
export function edgeFacing(boundary: Vec2[], bearing: number): number | null {
  let best: number | null = null
  let score = 0
  for (const e of boundaryEdges(boundary)) {
    if (e.length < 1e-6) continue
    const d = (((e.outBearing - bearing) % 360) + 540) % 360 - 180
    const c = Math.cos((d * Math.PI) / 180)
    if (c <= 0.5) continue
    const s = e.length * c * c
    if (s > score) {
      score = s
      best = e.index
    }
  }
  return best
}

/** Where the street side came from, so the panel can say how sure it is. */
export type StreetFrom = 'set' | 'low-side'

/**
 * Which side of the block the street is on: the plan's street side (set under Approvals › Checks ›
 * Lot facts, or for Street view in 3D) when there is one, else the low side, which is where most
 * blocks drain to.
 */
export function streetEdgeOf(plan: Plan, survey: Survey, fallBearing: number): { edge: number; from: StreetFrom } | null {
  const b = survey.boundary
  if (b.length < 3) return null
  const front = frontEdgeOf(plan, b)
  if (front !== undefined) return { edge: front, from: 'set' }
  const e = edgeFacing(b, fallBearing)
  return e === null ? null : { edge: e, from: 'low-side' }
}

export interface GroundPoint {
  /** Survey local frame. */
  p: Vec2
  rl: number
}

/** The lowest ground along the boundary, sampled every `step` metres, with the side it is on. */
export function boundaryLowPoint(boundary: Vec2[], grid: Heightfield, step = 0.5): (GroundPoint & { edge: number }) | null {
  let best: (GroundPoint & { edge: number }) | null = null
  for (const e of boundaryEdges(boundary)) {
    const n = Math.max(1, Math.ceil(e.length / step))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const p: Vec2 = [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t]
      const rl = grid.sample(p[0], p[1])
      if (!best || rl < best.rl) best = { p, rl, edge: e.index }
    }
  }
  return best
}

function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  if (l2 < 1e-12) return a
  const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return [a[0] + dx * t, a[1] + dy * t]
}

/** The corners of the ground floor's outline, in the survey's local frame. */
export function houseCorners(plan: Plan, survey: Survey): Vec2[] {
  const ground = sortedLevels(plan)[0]
  if (!ground) return []
  const rings = buildingOutline(planarFaces(plan.walls.filter(w => w.level === ground.id))).outlines
  return rings.flat().map(p => toSite(p, plan.placement, survey.origin))
}

/** Where the water goes. */
export type Verdict = 'street' | 'away' | 'no-house' | 'no-street'

export interface FallReport {
  /** Where the water leaves the house: the ground floor corner nearest the side it heads for. */
  house: GroundPoint | null
  /** The street side and the point on it the water would reach. */
  street: (GroundPoint & { edge: number; name: string; from: StreetFrom }) | null
  /** The lowest ground along the boundary. */
  low: (GroundPoint & { edge: number; name: string }) | null
  verdict: Verdict
  /** Fall from the house point to the discharge point (m, positive is downhill) and the run between them. */
  fall: number | null
  run: number | null
  /** The concept path: survey local frame, house point first. */
  path: Vec2[]
  /** Compass bearing the block generally falls towards (the overland flow direction). */
  fallBearing: number
  /** Middle of the house, for the fall arrow; the middle of the block without one. */
  centre: Vec2
}

const nearest = (pts: Vec2[], e: BoundaryEdge): { from: Vec2; to: Vec2; dist: number } | null => {
  let best: { from: Vec2; to: Vec2; dist: number } | null = null
  for (const p of pts) {
    const q = closestOnSegment(p, e.a, e.b)
    const d = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (!best || d < best.dist) best = { from: p, to: q, dist: d }
  }
  return best
}

/**
 * Which way the water has to go. The house's discharge point is its ground floor corner nearest
 * the street side; if the street boundary there is lower, the water drains to the street by
 * gravity. Otherwise the block falls away from the street, and the path runs to the low point
 * of the boundary instead, where an easement through a downhill neighbour or a pump is needed.
 */
export function fallReport(plan: Plan, survey: Survey, terrain: Terrain, street: { edge: number; from: StreetFrom } | null): FallReport {
  const grid = terrain.grid
  const edges = boundaryEdges(survey.boundary)
  const at = (p: Vec2): GroundPoint => ({ p, rl: grid.sample(p[0], p[1]) })
  const corners = houseCorners(plan, survey)
  const lowRaw = boundaryLowPoint(survey.boundary, grid)
  const low = lowRaw ? { ...lowRaw, name: edges[lowRaw.edge].name } : null
  const centre = corners.length ? centroidOf(corners) : survey.boundary.length ? centroidOf(survey.boundary) : ([0, 0] as Vec2)
  const base = { low, fallBearing: terrain.stats.fallBearing, centre }
  if (!corners.length) {
    const s = street ? edges[street.edge] : null
    const mid: Vec2 | null = s ? [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2] : null
    return { ...base, house: null, street: s && mid ? { ...at(mid), edge: s.index, name: s.name, from: street!.from } : null, verdict: 'no-house', fall: null, run: null, path: [] }
  }
  if (!street) {
    // No street side known: the water can only be shown heading for the low point.
    const n = low ? nearest(corners, edges[low.edge]) : null
    const house = n ? at(n.from) : null
    return { ...base, house, street: null, verdict: 'no-street', fall: house && low ? house.rl - low.rl : null, run: n ? n.dist : null, path: house && low ? [house.p, low.p] : [] }
  }
  const s = edges[street.edge]
  const toStreet = nearest(corners, s)!
  const house = at(toStreet.from)
  const streetPoint = { ...at(toStreet.to), edge: s.index, name: s.name, from: street.from }
  if (streetPoint.rl < house.rl) {
    return { ...base, house, street: streetPoint, verdict: 'street', fall: house.rl - streetPoint.rl, run: toStreet.dist, path: [house.p, streetPoint.p] }
  }
  // Falls away from the street: head for the low point from the corner nearest it.
  const n = low ? nearest(corners, edges[low.edge]) : null
  const houseLow = n ? at(n.from) : house
  return {
    ...base,
    house: houseLow,
    street: streetPoint,
    verdict: 'away',
    fall: low ? houseLow.rl - low.rl : null,
    run: n ? Math.hypot(low!.p[0] - houseLow.p[0], low!.p[1] - houseLow.p[1]) : null,
    path: low ? [houseLow.p, low.p] : [],
  }
}

/** The verdict in a sentence, the way the panel and the PDF say it. */
export function verdictText(r: FallReport): string {
  switch (r.verdict) {
    case 'street':
      return `To the street by gravity: the ${r.street!.name} boundary (RL ${r.street!.rl.toFixed(2)}) is ${r.fall!.toFixed(2)} m below the house’s discharge point (RL ${r.house!.rl.toFixed(2)}).`
    case 'away':
      return `The block falls away from the street: the ${r.street!.name} boundary (RL ${r.street!.rl.toFixed(2)}) is no lower than the house’s discharge point (RL ${r.house!.rl.toFixed(2)}). Water would need an easement through a downhill neighbour or a pump; ask a hydraulic engineer.`
    case 'no-street':
      return 'Which side the street is on isn’t known yet, so the path heads for the low point of the block.'
    case 'no-house':
      return 'Draw the ground floor walls to see where the water would leave the house.'
  }
}

/** The point the water heads for, in words: "the street (south side)" or "the low corner (west side)". */
export function destinationText(r: FallReport): string {
  if (r.verdict === 'street' && r.street) return `the street (${r.street.name})`
  if (r.low) return `the low point of the block (${r.low.name})`
  return 'the boundary'
}

/** The stormwater concept as the PDF site plan prints it: the dashed path (survey local frame) and its key numbers. */
export interface StormwaterSheet {
  path: Vec2[]
  /** What the path is, for its label: "Stormwater concept: to the street (south side)". */
  label: string
  rows: [string, string][]
  /** The verdict in a sentence, for the DA pack's stormwater sheet. */
  verdict?: string
  /** Where downpipes most often go (the roofs' convex eaves corners), in the house frame. */
  downpipes?: Vec2[]
  /** Which way the block falls: an arrow from `at` (survey local frame) towards `bearing`, and its words. */
  fall?: { at: Vec2; bearing: number; text: string }
}

export function stormwaterSheet(plan: Plan, survey: Survey, terrain: Terrain): StormwaterSheet | null {
  const roofs = roofCatchments(plan)
  const report = fallReport(plan, survey, terrain, streetEdgeOf(plan, survey, terrain.stats.fallBearing))
  if (!roofs.length && !report.house) return null
  const sw = stormwaterOf(plan)
  const rows: [string, string][] = []
  if (roofs.length) rows.push(['Roof catchment (plan area)', `${totalCatchment(roofs).toFixed(1)} m²`])
  if (sw.tankLitres > 0) rows.push(['Rainwater tank (planned)', `${sw.tankLitres.toLocaleString()} L from ${totalCatchment(tankRoofs(plan, roofs)).toFixed(1)} m² of roof`])
  if (report.verdict === 'street') rows.push(['Stormwater concept', `to the street by gravity, ${report.fall!.toFixed(2)} m fall over ${report.run!.toFixed(1)} m`])
  else if (report.verdict === 'away') rows.push(['Stormwater concept', 'falls away from the street: easement or pump, see engineer'])
  else if (report.verdict === 'no-street' && report.low) rows.push(['Stormwater concept', `to the low point of the block (${report.low.name})`])
  return {
    path: report.path,
    label: `Stormwater concept: to ${destinationText(report)}`,
    rows,
    verdict: verdictText(report),
    downpipes: downpipeSpots(plan),
    fall: { at: report.centre, bearing: report.fallBearing, text: `The block falls to the ${bearingName(report.fallBearing)}` },
  }
}
