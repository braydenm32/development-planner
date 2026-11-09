// The house as the sun sees it: each level's outline stood up from under its floor to the top
// of its walls, every house wall as its own block (so a wall that encloses nothing still throws a
// shadow), and the roofs as triangles. All in the survey's local frame (x east, y north of the
// survey origin) with heights as RLs. Decks, slabs and retaining walls sit near the ground and
// are left out; so are furniture and anything not drawn.

import type { Vec2 } from '../lib/geom'
import { triangulate } from '../lib/triangulate'
import { buildingOutline, planarFaces, wallPolygons } from '../plan/geometry'
import { FLOOR_STRUCTURE, floorRL, houseWalls, toSite, type Plan } from '../plan/model'
import { roofGeometry } from '../plan/roof'
import { roofEavesRL } from '../plan/roofline'

/** A polygon stood up between two RLs. */
export interface Prism {
  ring: Vec2[]
  z0: number
  z1: number
}

export interface HouseSolids {
  prisms: Prism[]
  /** Roof triangles: nine numbers each (x, y, RL for three corners). */
  roofTris: number[]
  /** Highest RL of anything here; -Infinity when there's nothing. */
  top: number
}

export function houseSolids(plan: Plan, origin: Vec2): HouseSolids {
  const pl = plan.placement
  const site = (p: Vec2) => toSite(p, pl, origin)
  const prisms: Prism[] = []
  const roofTris: number[] = []
  let top = -Infinity
  for (const level of plan.levels) {
    const walls = houseWalls(plan.walls.filter(w => w.level === level.id))
    if (!walls.length) continue
    const floor = floorRL(plan, level.id)
    const z0 = floor - FLOOR_STRUCTURE
    const z1 = floor + level.height
    for (const ring of buildingOutline(planarFaces(walls)).outlines) if (ring.length >= 3) prisms.push({ ring: ring.map(site), z0, z1 })
    for (const poly of wallPolygons(walls).values()) if (poly.length >= 3) prisms.push({ ring: poly.map(site), z0, z1 })
    top = Math.max(top, z1)
  }
  for (const r of plan.roofs) {
    const level = plan.levels.find(l => l.id === r.level)
    if (!level) continue
    const g = roofGeometry(r)
    if (g.error || !g.mesh.tris.length) continue
    const base = roofEavesRL(plan, r)
    const { pos, tris } = g.mesh
    for (const i of tris) {
      const s = site([pos[i * 3], pos[i * 3 + 1]])
      const z = base + pos[i * 3 + 2]
      roofTris.push(s[0], s[1], z)
      top = Math.max(top, z)
    }
  }
  return { prisms, roofTris, top }
}

/** True when there's nothing to throw a shadow. */
export const isEmpty = (s: HouseSolids) => !s.prisms.length && !s.roofTris.length

/** Every surface of the solids as triangles (nine numbers each), for tracing rays against. */
export function solidTriangles(s: HouseSolids): Float64Array {
  const out: number[] = [...s.roofTris]
  for (const p of s.prisms) {
    const n = p.ring.length
    for (let i = 0; i < n; i++) {
      const a = p.ring[i]
      const b = p.ring[(i + 1) % n]
      out.push(a[0], a[1], p.z0, b[0], b[1], p.z0, b[0], b[1], p.z1)
      out.push(a[0], a[1], p.z0, b[0], b[1], p.z1, a[0], a[1], p.z1)
    }
    // Caps, so a ray from under an overhanging upper floor meets its underside.
    for (const [i, j, k] of triangulate(p.ring)) {
      for (const z of [p.z0, p.z1]) out.push(p.ring[i][0], p.ring[i][1], z, p.ring[j][0], p.ring[j][1], z, p.ring[k][0], p.ring[k][1], z)
    }
  }
  return Float64Array.from(out)
}
