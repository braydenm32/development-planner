import { pointInPolygon, signedArea, unionArea, type Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import { buildingOutline, planarFaces, wallPolygons } from '../plan/geometry'
import { areaKind, houseWalls, isRetaining, toSite, type Plan } from '../plan/model'
import { featureName, type SiteFeature } from './model'

/**
 * Warnings about the house and works meeting site features: building over an easement,
 * and works inside a tree's protection zone. They are prompts to check with council (and,
 * for trees, an arborist), not rulings.
 */
export interface SiteWarning {
  id: string
  kind: 'easement' | 'tree'
  /** Amber: needs looking into. A note: worth knowing, likely fine. */
  severity: 'attn' | 'note'
  /** The feature it is about. */
  feature: string
  /** What the works are: "The house", "Deck", "Retaining wall", or several. */
  works: string
  /** Short chip text. */
  text: string
  /** The tooltip: the numbers and what to do. */
  detail: string
  /** Area of the overlap (m²). */
  overlap: number
  /** Trees: share of the protection zone covered (0 to 1). */
  share?: number
  /** Trees: works reach the structural root zone. */
  srz?: boolean
  /**
   * Trees: each of the works' part of the share, in the order of the works, adding up to the
   * share. Where works overlap, the part goes to the one named first: the house before cut and fill.
   */
  parts?: { works: string; share: number }[]
  /** Trees: the trunk stands outside the block, on the neighbour's land. */
  neighbour?: boolean
}

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
    for (const a of plan.areas.filter(x => areaKind(x) === kind)) out.push({ name: a.name?.trim() || names[kind], polys: [site(a.pts)] })
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

/** "Deck" stays "Deck" mid-sentence only when it reads as a name: "BBQ" does, "Open area" becomes "open area". */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)

/** "The house, deck and cut and fill". */
function joinNames(names: string[]): string {
  if (names.length === 1) return names[0]
  const rest = names.slice(1).map(lowerFirst)
  return `${[names[0], ...rest.slice(0, -1)].join(', ')} and ${rest[rest.length - 1]}`
}

/** "house", "deck", "cut and fill": a works' name inside a sentence. */
const shortName = (s: string) => lowerFirst(s.replace(/^The /, ''))

const m2 = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1))
const pct = (s: number) => `${Math.max(1, Math.round(s * 100))}%`

/**
 * Whole percentages for the parts of a share that add up to the share's own percentage
 * (largest remainders), so "72% (house 31%, cut and fill 41%)" never reads 72 = 31 + 42.
 */
export function splitPercents(total: number, parts: number[]): number[] {
  const want = Math.max(1, Math.round(total * 100))
  const raw = parts.map(p => (p / (total || 1)) * want)
  const out = raw.map(Math.floor)
  let left = want - out.reduce((t, v) => t + v, 0)
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i)
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i]++
  return out
}

/**
 * Every easement the works reach onto, and every tree protection zone they reach into.
 * Features are in the survey's local frame; `ground` adds the cut and fill when there is any.
 */
export function siteWarnings(
  plan: Plan | null,
  features: SiteFeature[],
  origin: Vec2,
  ground?: { natural: Heightfield; finished: Heightfield } | null,
  /** The block's boundary (local frame), to tell the neighbours' trees from yours. */
  boundary?: Vec2[] | null,
): SiteWarning[] {
  if (!plan) return []
  const works = worksOf(plan, origin)
  const out: SiteWarning[] = []
  for (const f of features) {
    if (f.type === 'easement' && f.geom.kind === 'area') {
      const pts = f.geom.pts
      const hits = works.map(w => ({ w, overlap: overlapArea(pts, w.polys) })).filter(x => x.overlap >= 0.01)
      if (!hits.length) continue
      // The area under any of the works, counting overlaps between them once.
      const overlap = hits.length === 1 ? hits[0].overlap : overlapArea(pts, hits.flatMap(x => x.w.polys))
      const who = joinNames(hits.map(x => x.w.name))
      const what = [f.purpose, f.width !== undefined ? `${f.width} m wide` : null].filter(Boolean).join(', ')
      const each = hits.length > 1 ? ` (${hits.map(x => `${lowerFirst(x.w.name)} ${m2(x.overlap)} m²`).join(', ')})` : ''
      out.push({
        id: `${f.id}|easement`,
        kind: 'easement',
        severity: 'attn',
        feature: f.id,
        works: who,
        text: `${who} on ${f.label ? `easement ${f.label}` : 'an easement'}`,
        detail: `${who} cover${hits.length === 1 ? 's' : ''} ${m2(overlap)} m² of ${featureName(f).toLowerCase()}${what ? ` (${what})` : ''}${each}. Building over an easement usually needs the consent of whoever it serves, such as council or the water authority, and they may need to dig there. Check with council.`,
        overlap,
      })
    }
    if (f.type === 'tree' && f.geom.kind === 'point' && !f.remove && f.trunk) {
      const at = f.geom.at
      const r = tpzRadius(f.trunk)
      const zone = circlePolygon(at, r)
      const zoneArea = Math.abs(signedArea(zone))
      const box = { minX: at[0] - r, minY: at[1] - r, maxX: at[0] + r, maxY: at[1] + r }
      const all: Works[] = [...works]
      const dug = ground ? levelChanges(ground.natural, ground.finished, box) : []
      if (dug.length) all.push({ name: 'Cut and fill', polys: dug })
      const hits = all.map(w => ({ w, overlap: overlapArea(zone, w.polys) })).filter(x => x.overlap >= 0.01)
      if (!hits.length) continue
      // Each works' part: what it adds to the zone's cover over the works named before it, so
      // the parts add up to the whole and the house's footprint isn't counted again as cut and fill.
      const parts: { works: string; overlap: number }[] = []
      let covered = 0
      for (let i = 0; i < hits.length; i++) {
        const upTo = i === 0 ? hits[0].overlap : overlapArea(zone, hits.slice(0, i + 1).flatMap(x => x.w.polys))
        parts.push({ works: hits[i].w.name, overlap: Math.max(0, upTo - covered) })
        covered = Math.max(covered, upTo)
      }
      // The share of the zone under any of the works, counting overlaps between them once.
      const overlap = covered
      const share = overlap / zoneArea
      const sr = srzRadius(f.trunk)
      const srzHits = hits.filter(x => overlapArea(circlePolygon(at, sr, 48), x.w.polys) >= 0.01).map(x => x.w.name)
      const severity = share > MAJOR_ENCROACHMENT || srzHits.length ? 'attn' : 'note'
      const neighbour = !!boundary && boundary.length >= 3 && !pointInPolygon(at[0], at[1], boundary)
      const tree = neighbour ? "neighbour's tree" : 'tree'
      const whose = f.label ? `${tree[0].toUpperCase()}${tree.slice(1)} ${f.label}'s` : `A ${tree}'s`
      const shown = parts.filter(x => x.overlap >= 0.01)
      const pcts = splitPercents(share, shown.map(x => x.overlap / zoneArea))
      const split = shown.length > 1 ? ` (${shown.map((x, i) => `${shortName(x.works)} ${pcts[i] ? `${pcts[i]}%` : 'under 1%'}`).join(', ')})` : ` (${shortName(shown[0]?.works ?? hits[0].w.name)})`
      const who = joinNames(hits.map(x => x.w.name))
      out.push({
        id: `${f.id}|tpz`,
        kind: 'tree',
        severity,
        feature: f.id,
        works: who,
        text: `${whose} root zone · ${pct(share)}${split}`,
        detail:
          `Tree protection zone: 12 × trunk Ø ${f.trunk.toFixed(2)} m = ${r.toFixed(1)} m radius, ${m2(zoneArea)} m²; structural root zone ${sr.toFixed(1)} m (AS 4970 rules of thumb). ` +
          `In the zone: ${shown.map((x, i) => `${shortName(x.works)} ${i ? 'another ' : ''}${m2(x.overlap)} m²`).join(', ')}; ${pct(share)} of it in all. ` +
          (neighbour ? "The trunk is over the boundary, so it is the neighbour's tree; its roots are protected on your side all the same. " : '') +
          (srzHits.length
            ? `${joinNames(srzHits)} reach${srzHits.length === 1 ? 'es' : ''} the structural root zone, which usually rules works out there. `
            : share > MAJOR_ENCROACHMENT
              ? 'Over 10% is a major encroachment: an arborist usually has to show the tree will survive. '
              : 'Under 10% and clear of the structural root zone is usually a minor encroachment. ') +
          'Check with an arborist and council: trees 5 m or taller are usually protected.',
        overlap,
        share,
        srz: srzHits.length > 0,
        parts: shown.map(x => ({ works: x.works, share: x.overlap / zoneArea })),
        neighbour,
      })
    }
  }
  return out
}
