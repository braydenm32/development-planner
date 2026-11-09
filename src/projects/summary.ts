import type { Vec2 } from '../lib/geom'
import { buildingOutline, planarFaces } from '../plan/geometry'
import { floorRL, sortedLevels, toSite, type Plan } from '../plan/model'
import type { ProjectNumbers, ProjectThumbnail } from './types'

/** What the card needs from the open project's site, as the app already has it. */
export interface SiteForSummary {
  boundary: Vec2[]
  origin: Vec2
  /** The Site panel's area (terrain stats), so the card shows the very same number. */
  area: number
}

/**
 * Floor area of every level to the outside of its walls, each worked out exactly as the Areas
 * panel's "Floor area (outside of walls)" does, then added up.
 */
export function totalFloorArea(plan: Plan): number {
  return sortedLevels(plan).reduce((t, l) => t + buildingOutline(planarFaces(plan.walls.filter(w => w.level === l.id))).area, 0)
}

export function projectNumbers(site: SiteForSummary | null, plan: Plan | null): ProjectNumbers {
  return {
    siteArea: site ? site.area : null,
    floorArea: plan ? totalFloorArea(plan) : null,
    ffl: plan ? floorRL(plan) : null,
  }
}

/** Every level's outline in the site frame (x east, y north of the survey origin). */
function houseOutlines(plan: Plan, origin: Vec2): Vec2[][] {
  return plan.levels.flatMap(l =>
    buildingOutline(planarFaces(plan.walls.filter(w => w.level === l.id))).outlines.map(o => o.map(p => toSite(p, plan.placement, origin))),
  )
}

/** Ramer–Douglas–Peucker, for long curved boundaries. */
function simplify(pts: Vec2[], tol: number): Vec2[] {
  if (pts.length <= 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = pts[a]
    const [bx, by] = pts[b]
    const len = Math.hypot(bx - ax, by - ay) || 1
    let far = -1
    let farD = tol
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len
      if (d > farD) {
        farD = d
        far = i
      }
    }
    if (far > 0) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** A north-up sketch of the block with the house on it, fitted into a 100-unit box. */
export function projectThumbnail(site: Pick<SiteForSummary, 'boundary' | 'origin'> | null, plan: Plan | null): ProjectThumbnail | null {
  if (!site || site.boundary.length < 3) return null
  const house = plan ? houseOutlines(plan, site.origin) : []
  const all = [...site.boundary, ...house.flat()]
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of all) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  const span = Math.max(x1 - x0, y1 - y0, 1e-6)
  const pad = span * 0.04
  const k = 100 / (span + 2 * pad)
  const w = r1((x1 - x0 + 2 * pad) * k)
  const h = r1((y1 - y0 + 2 * pad) * k)
  const P = ([x, y]: Vec2): Vec2 => [r1((x - x0 + pad) * k), r1((y1 + pad - y) * k)]
  const path = (ring: Vec2[], tol: number) => {
    // The ring is open here (first and last points differ), so the simplifier keeps both ends.
    const pts = simplify(ring.map(P), tol)
    return 'M' + pts.map(p => `${p[0]} ${p[1]}`).join('L') + 'Z'
  }
  return {
    viewBox: `0 0 ${w} ${h}`,
    block: path(site.boundary, 0.3),
    house: house.map(o => path(o, 0.15)).join(''),
  }
}
