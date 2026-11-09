import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import { pointInPolygon, type Vec2 } from '../lib/geom'
import { BUILDING_HEIGHT, FENCE_HEIGHT, TREE_DEFAULT, type SiteFeature } from './model'

/**
 * Site features for the 3D print, standing on the terrain: trees as a trunk and a canopy,
 * buildings and sheds that stay as blocks, and fences as thin walls. Everything is in metres
 * in the survey's local frame (z = RL); the caller trims them to the lot and joins them on.
 */
export interface FeatureSolidTools {
  Manifold: ManifoldToplevel['Manifold']
  /** Extrude rings between two levels. */
  prism: (rings: Vec2[][], z0: number, z1: number) => Manifold | null
  keep: <T extends { delete(): void }>(x: T) => T
  groundAt: (p: Vec2) => number
  /** Thinnest thing worth printing (m). */
  minW: number
}

export function featureSolids(features: SiteFeature[], boundary: Vec2[], t: FeatureSolidTools): { solids: Manifold[]; summary: string | null } {
  const solids: Manifold[] = []
  let trees = 0
  let buildings = 0
  let fences = 0
  const inside = (p: Vec2) => pointInPolygon(p[0], p[1], boundary)
  for (const f of features) {
    const g = f.geom
    if (f.type === 'tree' && g.kind === 'point' && !f.remove && inside(g.at)) {
      const h = f.height ?? TREE_DEFAULT.height
      const r = Math.max((f.canopy ?? TREE_DEFAULT.canopy) / 2, t.minW)
      const crown = Math.max(Math.min(h * 0.3, r * 1.1), t.minW)
      const trunk = Math.max((f.trunk ?? TREE_DEFAULT.trunk) / 2, t.minW)
      const z = t.groundAt(g.at)
      const stem = t.keep(t.Manifold.cylinder(h - crown + 0.2, trunk, trunk * 0.8, 12)).translate([g.at[0], g.at[1], z - 0.2])
      const ball = t.keep(t.keep(t.Manifold.sphere(1, 16)).scale([r, r, crown])).translate([g.at[0], g.at[1], z + h - crown])
      solids.push(t.keep(stem), t.keep(ball))
      trees++
    } else if (f.type === 'building' && g.kind === 'area' && !f.remove && !f.neighbour && g.pts.some(inside)) {
      const base = Math.min(...g.pts.map(t.groundAt))
      const m = t.prism([g.pts], base - 0.2, base + (f.height ?? BUILDING_HEIGHT))
      if (m) {
        solids.push(m)
        buildings++
      }
    } else if (f.type === 'fence' && g.kind === 'line') {
      const w = Math.max(0.05, t.minW) / 2
      let any = false
      for (let i = 0; i + 1 < g.pts.length; i++) {
        const a = g.pts[i]
        const b = g.pts[i + 1]
        if (!inside(a) && !inside(b) && !inside([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) continue
        const L = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (L < 1e-6) continue
        const n: Vec2 = [(-(b[1] - a[1]) / L) * w, ((b[0] - a[0]) / L) * w]
        const ring: Vec2[] = [
          [a[0] - n[0], a[1] - n[1]],
          [b[0] - n[0], b[1] - n[1]],
          [b[0] + n[0], b[1] + n[1]],
          [a[0] + n[0], a[1] + n[1]],
        ]
        const lo = Math.min(t.groundAt(a), t.groundAt(b))
        const hi = Math.max(t.groundAt(a), t.groundAt(b))
        const m = t.prism([ring], lo - 0.2, hi + (f.height ?? FENCE_HEIGHT))
        if (m) {
          solids.push(m)
          any = true
        }
      }
      if (any) fences++
    }
  }
  const parts = [
    trees ? `${trees} tree${trees > 1 ? 's' : ''}` : null,
    buildings ? `${buildings} building${buildings > 1 ? 's' : ''}` : null,
    fences ? `${fences} fence${fences > 1 ? 's' : ''}` : null,
  ].filter(Boolean)
  return { solids, summary: parts.length ? `The terrain carries ${parts.join(', ')} from Site features, trimmed to the block.` : null }
}
