import { pointInPolygon, type Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import type { Plan } from '../plan/model'
import { isMajor, overlapArea, treeTitles, worksOf, zoneCover } from '../checks/trees'
import { featureName, type SiteFeature } from './model'

// The zones and the works in them are worked out once, in src/checks/trees.ts, so these warnings
// and Design › Checks always give a tree the same share. Re-exported for the code that reads them here.
export { circlePolygon, levelChanges, MAJOR_ENCROACHMENT, overlapArea, srzRadius, tpzRadius, worksOf, type Works } from '../checks/trees'

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
  const isNeighbours = (at: Vec2) => !!boundary && boundary.length >= 3 && !pointInPolygon(at[0], at[1], boundary)
  // The trees' names as Design › Checks gives them, so "Planted tree" isn't "Tree Planted tree" and two alike are numbered.
  const zoned = features.filter(f => f.type === 'tree' && f.geom.kind === 'point' && f.trunk)
  const titles = new Map(treeTitles(zoned.map(f => ({ label: f.label ?? '', neighbour: f.geom.kind === 'point' && isNeighbours(f.geom.at) }))).map((t, i) => [zoned[i].id, t.replace(/’/g, "'")]))
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
      // The same cover Design › Checks measures (src/checks/trees.ts).
      const z = zoneCover(at, f.trunk, works, ground)
      if (!z.parts.length) continue
      const { tpz: r, srz: sr, zoneArea, share, srzHits } = z
      const overlap = share * zoneArea
      const severity = isMajor(share, srzHits.length > 0) ? 'attn' : 'note'
      const neighbour = isNeighbours(at)
      const tree = neighbour ? "neighbour's tree" : 'tree'
      const title = titles.get(f.id)!
      // An unnamed tree on its own is "a tree"; otherwise it goes by its name.
      const whose = !f.label && title.toLowerCase() === tree ? `A ${tree}'s` : `${title}'s`
      const shown = z.parts.filter(x => x.overlap >= 0.01)
      const pcts = splitPercents(share, shown.map(x => x.share))
      const split = shown.length > 1 ? ` (${shown.map((x, i) => `${shortName(x.works)} ${pcts[i] ? `${pcts[i]}%` : 'under 1%'}`).join(', ')})` : ` (${shortName(shown[0]?.works ?? z.parts[0].works)})`
      const who = joinNames(z.parts.map(x => x.works))
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
            : severity === 'attn'
              ? 'Over 10% is a major encroachment: an arborist usually has to show the tree will survive. '
              : 'Under 10% and clear of the structural root zone is usually a minor encroachment. ') +
          'Check with an arborist and council: trees 5 m or taller are usually protected.',
        overlap,
        share,
        srz: srzHits.length > 0,
        parts: shown.map(x => ({ works: x.works, share: x.share })),
        neighbour,
      })
    }
  }
  return out
}
