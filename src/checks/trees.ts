// Tree protection zones (AS 4970-2009, which Wollongong DCP E17 cites) and how much of each
// one the design takes. This is the one place that's worked out: Approvals › Checks reads it, and
// so do Site › Features' "To check" warnings (src/site/warnings.ts), so the two always show the
// same share. The share counts the house, hard areas, retaining walls and any change to the
// ground together, each overlap counted once.

import { pointInPolygon, signedArea, unionArea, type Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import { buildingOutline, planarFaces, wallPolygons } from '../plan/geometry'
import { areaKind, houseWalls, isRetaining, toSite, type Plan } from '../plan/model'
import type { Measures } from './measure'
import { distToRing } from './measure'
import type { CheckTree } from './types'

/** AS 4970-2009 rule of thumb: the tree protection zone's radius is 12 × trunk diameter (at 1.4 m), kept between 2 m and 15 m. */
export function tpzRadius(trunk: number): number {
  return Math.min(15, Math.max(2, 12 * trunk))
}

/**
 * AS 4970-2009 structural root zone: R = (D × 50)^0.42 × 0.64, at least 1.5 m. D is the trunk
 * diameter just above the root buttress; the trunk diameter at 1.4 m stands in for it.
 */
export function srzRadius(trunk: number): number {
  return Math.max(1.5, Math.pow(Math.max(trunk, 0) * 50, 0.42) * 0.64)
}

/** Over this share of its protection zone, AS 4970-2009 calls the encroachment major. */
export const MAJOR_ENCROACHMENT = 0.1

/** Share of a TPZ that can be built in without detailed root investigation (AS 4970-2009). */
export const MINOR_ENCROACHMENT = MAJOR_ENCROACHMENT

/** E17 13.3: a tree with its base this close to a DA-approved building may then be removed. */
export const E17_REMOVAL_DISTANCE = 3

/** A circle as a polygon with enough sides that its area is within 0.2% of the circle's. */
export function circlePolygon(c: Vec2, r: number, n = 96): Vec2[] {
  const pts: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI
    pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)])
  }
  return pts
}

/** Area where a polygon and a set of polygons overlap: |A| + |∪W| − |A ∪ W|, all exact. */
export function overlapArea(a: Vec2[], with_: Vec2[][]): number {
  const ws = with_.filter(w => w.length >= 3)
  if (a.length < 3 || !ws.length) return 0
  const v = Math.abs(signedArea(a)) + unionArea(ws) - unionArea([a, ...ws])
  return v > 1e-6 ? v : 0
}

export interface Works {
  name: string
  /** Outlines in the survey's local frame. */
  polys: Vec2[][]
}

/** What is being built, in the survey's local frame: the house, slabs, decks, driveways and retaining walls. */
export function worksOf(plan: Plan, origin: Vec2): Works[] {
  const site = (ring: Vec2[]) => ring.map(p => toSite(p, plan.placement, origin))
  const out: Works[] = []
  const house = plan.levels.flatMap(l => buildingOutline(planarFaces(houseWalls(plan.walls.filter(w => w.level === l.id)))).outlines).map(site)
  if (house.length) out.push({ name: 'The house', polys: house })
  const names = { slab: 'Slab', deck: 'Deck', driveway: 'Driveway' } as const
  for (const kind of ['slab', 'deck', 'driveway'] as const) {
    for (const a of plan.areas.filter(x => areaKind(x) === kind && x.pts.length >= 3)) out.push({ name: a.name?.trim() || names[kind], polys: [site(a.pts)] })
  }
  const retaining = [...wallPolygons(plan.walls.filter(isRetaining)).values()].map(site)
  if (retaining.length) out.push({ name: 'Retaining wall', polys: retaining })
  return out
}

/** Change in ground level that counts as digging or filling (m). */
const LEVEL_CHANGE = 0.05

/**
 * Where the ground is cut or filled, within a box, as strips of grid cells (local frame).
 * Pads, batters and anything else the earthworks reshape.
 */
export function levelChanges(natural: Heightfield, finished: Heightfield, box: { minX: number; minY: number; maxX: number; maxY: number }): Vec2[][] {
  const { cell, x0, y0, nx, ny } = finished
  const out: Vec2[][] = []
  const h = cell / 2
  const i0 = Math.max(0, Math.floor((box.minX - x0) / cell))
  const i1 = Math.min(nx - 1, Math.ceil((box.maxX - x0) / cell))
  const j0 = Math.max(0, Math.floor((box.minY - y0) / cell))
  const j1 = Math.min(ny - 1, Math.ceil((box.maxY - y0) / cell))
  for (let j = j0; j <= j1; j++) {
    const y = y0 + j * cell
    let run = -1
    for (let i = i0; i <= i1 + 1; i++) {
      const x = x0 + i * cell
      const changed = i <= i1 && Math.abs(finished.at(i, j) - natural.sample(x, y)) > LEVEL_CHANGE
      if (changed && run < 0) run = i
      if (!changed && run >= 0) {
        const xa = x0 + run * cell - h
        const xb = x0 + (i - 1) * cell + h
        out.push([
          [xa, y - h],
          [xb, y - h],
          [xb, y + h],
          [xa, y + h],
        ])
        run = -1
      }
    }
  }
  return out
}

/** The natural ground and the finished ground, once there's cut or fill. */
export type WorksGround = { natural: Heightfield; finished: Heightfield } | null | undefined

export interface ZoneCover {
  /** Radii (m) and the zone's area (m²). */
  tpz: number
  srz: number
  zoneArea: number
  /** Share of the zone under any of the works, overlaps counted once (0 to 1). */
  share: number
  /**
   * Each of the works that reach in, in order, with its part of the share: what it adds over the
   * works named before it, so the parts add up to the share. The house comes before cut and fill.
   */
  parts: { works: string; overlap: number; share: number }[]
  /** The works that reach the structural root zone. */
  srzHits: string[]
}

/** How much of a tree's protection zone the works (and any cut and fill) cover, worked out exactly from the outlines. */
export function zoneCover(at: Vec2, trunk: number, works: Works[], ground?: WorksGround): ZoneCover {
  const tpz = tpzRadius(trunk)
  const srz = srzRadius(trunk)
  const zone = circlePolygon(at, tpz)
  const zoneArea = Math.abs(signedArea(zone))
  const box = { minX: at[0] - tpz, minY: at[1] - tpz, maxX: at[0] + tpz, maxY: at[1] + tpz }
  const all: Works[] = [...works]
  const dug = ground ? levelChanges(ground.natural, ground.finished, box) : []
  if (dug.length) all.push({ name: 'Cut and fill', polys: dug })
  const hits = all.map(w => ({ w, overlap: overlapArea(zone, w.polys) })).filter(x => x.overlap >= 0.01)
  const parts: ZoneCover['parts'] = []
  let covered = 0
  for (let i = 0; i < hits.length; i++) {
    const upTo = i === 0 ? hits[0].overlap : overlapArea(zone, hits.slice(0, i + 1).flatMap(x => x.w.polys))
    const overlap = Math.max(0, upTo - covered)
    parts.push({ works: hits[i].w.name, overlap, share: overlap / zoneArea })
    covered = Math.max(covered, upTo)
  }
  const srzZone = circlePolygon(at, srz, 48)
  const srzHits = hits.filter(x => overlapArea(srzZone, x.w.polys) >= 0.01).map(x => x.w.name)
  return { tpz, srz, zoneArea, share: covered / zoneArea, parts, srzHits }
}

/** More than a minor encroachment (AS 4970-2009): over the minor share, or into the structural root zone. */
export const isMajor = (share: number, inSrz: boolean, minor = MINOR_ENCROACHMENT) => inSrz || share > minor + 1e-9

export interface Encroachment {
  tpz: number
  srz: number
  /** Share of the TPZ's area taken by the house, hard areas, retaining walls and ground level changes. */
  share: number
  /** Something sits inside the structural root zone. */
  inSrz: boolean
  /** Closest the house comes to the trunk (m); null with no house. */
  toHouse: number | null
  /** Which way the trunk is from the nearest part of the house ("SW"); null with no house, or a trunk under it. */
  side: string | null
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** The closest point to `p` on a ring's edges. */
function nearestOnRing(p: Vec2, ring: Vec2[]): Vec2 {
  let best: Vec2 = ring[0]
  let d = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
    const q: Vec2 = [a[0] + t * dx, a[1] + t * dy]
    const dq = Math.hypot(p[0] - q[0], p[1] - q[1])
    if (dq < d) [d, best] = [dq, q]
  }
  return best
}

/** How much of a tree's protection zone the design takes: the same numbers Site › Features shows. */
export function encroachment(t: CheckTree, m: Measures): Encroachment {
  const z = zoneCover(t.at, t.trunk, m.works, m.ground)
  const under = m.outlines.some(r => pointInPolygon(t.at[0], t.at[1], r))
  const toHouse = m.outlines.length ? (under ? 0 : Math.min(...m.outlines.map(r => distToRing(t.at, r)))) : null
  let side: string | null = null
  if (toHouse !== null && toHouse > 0) {
    // The survey's grid north is up, as everywhere else the app names a side.
    const near = m.outlines.map(r => nearestOnRing(t.at, r)).reduce((a, b) => (Math.hypot(t.at[0] - b[0], t.at[1] - b[1]) < Math.hypot(t.at[0] - a[0], t.at[1] - a[1]) ? b : a))
    const bearing = (Math.atan2(t.at[0] - near[0], t.at[1] - near[1]) * 180) / Math.PI
    side = COMPASS[Math.round((bearing + 360) / 45) % 8]
  }
  return { tpz: z.tpz, srz: z.srz, share: z.share, inSrz: z.srzHits.length > 0, toHouse, side }
}

/**
 * Names for the tree rows, distinct within the list: a schedule code reads "Tree T4" or
 * "Neighbour’s tree T4"; a label that already says what it is ("Planted tree") stands alone, with
 * "(neighbour’s)" after it next door; and trees that would read the same are numbered in turn.
 */
export function treeTitles(trees: Pick<CheckTree, 'label' | 'neighbour'>[]): string[] {
  const parts = trees.map(t => {
    const label = t.label.trim()
    const code = label !== '' && !/\s/.test(label) && label.length <= 6
    const owner = t.neighbour ? 'Neighbour’s tree' : 'Tree'
    if (!label || code) return { name: code ? `${owner} ${label}` : owner, after: '' }
    return { name: label, after: t.neighbour ? ' (neighbour’s)' : '' }
  })
  const key = (p: { name: string; after: string }) => `${p.name}${p.after}`
  const seen = new Map<string, number>()
  return parts.map(p => {
    const all = parts.filter(q => key(q) === key(p)).length
    if (all === 1) return key(p)
    const n = (seen.get(key(p)) ?? 0) + 1
    seen.set(key(p), n)
    return `${p.name} ${n}${p.after}`
  })
}
