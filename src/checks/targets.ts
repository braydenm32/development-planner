// Where a check's result is on the plan, so Approvals › Checks can pin it there and point it out:
// the boundary a setback is measured to, the tree and its protection zone, the walls over the
// limit, the house, the cut and fill, the driveway's crossing. And where in the app it's fixed.
// Everything is in the survey's local (site) frame, as Measures has it.

import type { Vec2 } from '../lib/geom'
import type { Target } from '../costs/estimate'
import type { AreaId } from '../nav/menu'
import type { Edge, Measures } from './measure'
import { isDriveCheck } from './crossing'
import { topicOf } from './topics'
import { srzRadius, tpzRadius } from './trees'
import type { CheckResult } from './types'

export interface CheckTarget {
  /** Where the row's pin goes. */
  at: Vec2
  /** Lines drawn in red while the row is pointed at: a boundary, a retaining wall. */
  lines: [Vec2, Vec2][]
  /** The distance a setback measures, from the house to the boundary. */
  gaps: [Vec2, Vec2][]
  /** A tree's protection zone and root zone. */
  circles: { at: Vec2; r: number; kind: 'tpz' | 'srz' }[]
  /** What the Costs highlight points out on the plan: the house, the walls, the cut or fill. */
  plan: Target | null
}

const mid = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

/** The middle of the house's outline (its bounding box), or null with no house. */
function houseMiddle(ms: Measures): Vec2 | null {
  const pts = ms.outlines.flat()
  if (!pts.length) return null
  const xs = pts.map(p => p[0])
  const ys = pts.map(p => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

/** The edge of `es` the house comes closest to (or furthest over). */
function closestEdge(es: Edge[]): Edge | null {
  return es.reduce<Edge | null>((b, e) => (e.clearance !== null && (!b || e.clearance < (b.clearance ?? Infinity)) ? e : b), null)
}

function edgeTarget(e: Edge | null | undefined): CheckTarget | null {
  if (!e) return null
  return { at: e.near ? mid(e.near[0], e.near[1]) : mid(e.a, e.b), lines: [[e.a, e.b]], gaps: e.near ? [e.near] : [], circles: [], plan: null }
}

const SETBACK_EDGES: Record<string, (ms: Measures) => Edge[]> = {
  'hc-front': ms => ms.edges.filter(e => e.role === 'front'),
  'da-front': ms => ms.edges.filter(e => e.role === 'front'),
  'hc-side': ms => ms.edges.filter(e => e.role === 'side'),
  'da-side': ms => ms.edges.filter(e => e.role === 'side'),
  'da-side-rear': ms => ms.edges.filter(e => e.role !== 'front'),
  'hc-rear': ms => ms.edges.filter(e => e.role === 'rear'),
  'da-rear': ms => ms.edges.filter(e => e.role === 'rear'),
  'da-rear-upper': ms => ms.edges.filter(e => e.role === 'rear'),
}

/** Where a result is on the plan; null for one with no place there (the zone, a fact not given yet). */
export function targetOf(r: CheckResult, ms: Measures): CheckTarget | null {
  if (r.status === 'unknown' || r.id.startsWith('map:')) return null
  const house = houseMiddle(ms)
  const atHouse = (plan: Target | null): CheckTarget | null => (house ? { at: house, lines: [], gaps: [], circles: [], plan } : null)

  if (r.tree) {
    const t = ms.trees.find(x => x.id === r.tree)
    if (!t) return null
    const circles: CheckTarget['circles'] = t.remove ? [] : [
      { at: t.at, r: tpzRadius(t.trunk), kind: 'tpz' },
      { at: t.at, r: srzRadius(t.trunk), kind: 'srz' },
    ]
    return { at: t.at, lines: [], gaps: [], circles, plan: null }
  }
  if (r.walls?.length) {
    const walls = ms.walls.filter(w => r.walls!.includes(w.id))
    if (!walls.length) return null
    return { at: mid(walls[0].a, walls[0].b), lines: walls.map(w => [w.a, w.b] as [Vec2, Vec2]), gaps: [], circles: [], plan: { kind: 'retaining', ids: walls.map(w => w.id) } }
  }
  if (r.id === 'lot-inside') {
    const over = ms.edges.filter(e => e.clearance !== null && e.clearance < 0)
    if (!over.length) return null
    const worst = closestEdge(over)!
    return { ...edgeTarget(worst)!, lines: over.map(e => [e.a, e.b] as [Vec2, Vec2]), gaps: over.flatMap(e => (e.near ? [e.near] : [])) }
  }
  if (SETBACK_EDGES[r.id]) return ms.hasHouse ? edgeTarget(closestEdge(SETBACK_EDGES[r.id](ms))) : null
  if (isDriveCheck(r.id)) {
    const id = r.id.split(':')[1]
    const d = ms.drives.find(x => x.id === id) ?? ms.drives[0]
    if (!d) return null
    return { at: d.boundary ?? d.garage, lines: [], gaps: d.boundary ? [[d.garage, d.boundary]] : [], circles: [], plan: { kind: 'areas', ids: [d.id] } }
  }
  if (r.status === 'incomplete' || r.status === 'info') return null
  switch (topicOf(r.id)) {
    case 'earth':
      return atHouse({ kind: r.id === 'hc-fill' ? 'fill' : 'cut' })
    case 'size':
    case 'sun':
      return atHouse({ kind: 'ground' })
    default:
      return null
  }
}

export interface FixLink {
  area: AreaId
  tab: string
  /** Where it goes, as the menu names it: "Earthworks › Place". */
  where: string
}

const go = (area: AreaId, tab: string, where: string): FixLink => ({ area, tab, where })

/** Where in the app a result is fixed; null where the row itself is the place (a fact to type in). */
export function fixOf(r: CheckResult): FixLink | null {
  if (r.id === 'hc-height' || r.id === 'da-height') return go('design', 'roofs', 'Design › Roofs')
  if (r.id === 'hc-landscaped' || r.id === 'da-landscaped' || r.id === 'da-coverage') return go('design', 'rooms', 'Design › Rooms & areas')
  if (r.walls || r.id.endsWith('-retaining')) return go('earthworks', 'retaining-walls', 'Earthworks › Retaining walls')
  switch (topicOf(r.id)) {
    case 'land':
      return go('site', 'map', 'Site › Map')
    case 'setbacks':
      return go('earthworks', 'place', 'Earthworks › Place')
    case 'earth':
      return go('earthworks', 'cut-fill', 'Earthworks › Cut & fill')
    case 'trees':
      return go('site', 'features', 'Site › Features')
    case 'sun':
      return go('site', 'sun', 'Site › Sun')
    case 'driveway':
      return go('earthworks', 'driveway', 'Earthworks › Driveway')
    case 'size':
      return go('design', 'floors', 'Design › Floors')
  }
}
