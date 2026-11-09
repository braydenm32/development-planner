import { pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import { triangulate } from '../lib/triangulate'
import { buildingOutline, planarFaces } from './geometry'
import type { Roof, Wall } from './model'
import { straightSkeleton } from './skeleton'

/** Depth of the roof at its edge (fascia and roof sheeting), m. */
export const ROOF_EDGE = 0.15
/** Total depth of a flat roof, m. */
export const FLAT_ROOF = 0.3

/** A closed solid: xyz triples in the plan's frame, z measured up from the top of the walls. */
export interface RoofMesh {
  pos: number[]
  tris: number[]
}

export interface RoofGeometry {
  /** Outline including the overhang. */
  outline: Vec2[]
  /** Ridges, hips and valleys seen from above. */
  lines: [Vec2, Vec2][]
  mesh: RoofMesh
  /** Highest point above the top of the walls. */
  height: number
  /** Area of the sloping roof surface. */
  area: number
  /** Why the roof could not be built, if it couldn't. */
  error: string | null
}

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1]
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0]
const unit = (v: Vec2): Vec2 => {
  const l = Math.hypot(v[0], v[1]) || 1
  return [v[0] / l, v[1] / l]
}

/** Drop repeated points and corners where the outline runs straight on. Returns the
 * kept points and, for each kept edge, the index of the original edge it starts with. */
export function simplifyRing(pts: Vec2[]): { pts: Vec2[]; edges: number[] } {
  let idx = pts.map((_, i) => i)
  for (let changed = true; changed && idx.length >= 3; ) {
    changed = false
    for (let k = 0; k < idx.length; k++) {
      const a = pts[idx[(k - 1 + idx.length) % idx.length]]
      const b = pts[idx[k]]
      const c = pts[idx[(k + 1) % idx.length]]
      const u = sub(b, a)
      const v = sub(c, b)
      const lu = Math.hypot(u[0], u[1])
      const lv = Math.hypot(v[0], v[1])
      const straight = lu > 1e-6 && lv > 1e-6 && Math.abs(cross(u, v)) / (lu * lv) < 1e-6 && dot(u, v) > 0
      if (lv <= 1e-6 || straight) {
        // drop b: the edge a->b carries on to c
        idx = idx.filter((_, i) => i !== k)
        changed = true
        break
      }
    }
  }
  // Each kept point starts the edge that leaves it.
  return { pts: idx.map(i => pts[i]), edges: idx }
}

/** Move every edge of a counter-clockwise ring outwards by d. */
export function growRing(pts: Vec2[], d: number): Vec2[] {
  if (Math.abs(d) < 1e-9) return pts.map(p => [p[0], p[1]] as Vec2)
  const n = pts.length
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n]
    const next = pts[(i + 1) % n]
    const u = unit(sub(p, prev))
    const v = unit(sub(next, p))
    const nu: Vec2 = [u[1], -u[0]] // right of the edge = outside
    const nv: Vec2 = [v[1], -v[0]]
    const den = cross(u, v)
    if (Math.abs(den) < 1e-9) return [p[0] + nu[0] * d, p[1] + nu[1] * d] as Vec2
    // intersection of the two shifted edge lines
    const a: Vec2 = [p[0] + nu[0] * d, p[1] + nu[1] * d]
    const b: Vec2 = [p[0] + nv[0] * d, p[1] + nv[1] * d]
    const s = cross(sub(b, a), v) / den
    return [a[0] + u[0] * s, a[1] + u[1] * s] as Vec2
  })
}

/** Outer outlines (outside face of the walls) of the buildings on one level, counter-clockwise. */
export function levelOutlines(walls: Wall[]): Vec2[][] {
  return buildingOutline(planarFaces(walls))
    .outlines.map(o => simplifyRing([...o].reverse()).pts)
    .filter(o => o.length >= 3 && signedArea(o) > 0)
}

/** The outline of the building around point p, or null. */
export function outlineAround(walls: Wall[], p: Vec2): Vec2[] | null {
  return levelOutlines(walls).find(o => pointInPolygon(p[0], p[1], o)) ?? null
}

/** Gable ends for a new gable roof: the short end edges of each wing. */
export function defaultGables(pts: Vec2[]): boolean[] {
  const n = pts.length
  const len = pts.map((p, i) => Math.hypot(pts[(i + 1) % n][0] - p[0], pts[(i + 1) % n][1] - p[1]))
  const convex = pts.map((p, i) => cross(sub(p, pts[(i - 1 + n) % n]), sub(pts[(i + 1) % n], p)) > 0)
  const ends = pts.map((_, i) => convex[i] && convex[(i + 1) % n])
  let g = pts.map((_, i) => ends[i] && len[i] < len[(i - 1 + n) % n] - 1e-6 && len[i] < len[(i + 1) % n] - 1e-6)
  if (!g.some(Boolean)) {
    // e.g. a square: take the first end edge and any end edge running the opposite way
    const first = ends.findIndex(Boolean)
    if (first >= 0) {
      const d = unit(sub(pts[(first + 1) % n], pts[first]))
      g = pts.map((p, i) => {
        if (!ends[i]) return false
        const e = unit(sub(pts[(i + 1) % n], p))
        return i === first || dot(d, e) < -0.999
      })
    }
  }
  // Two gables can't share a corner.
  for (let i = 0; i < n; i++) if (g[i] && g[(i + 1) % n]) g[(i + 1) % n] = false
  return g
}

/**
 * Click a gable roof's end marker: a hipped end becomes a gable and a gable end becomes hipped.
 * Two gable ends can't share a corner, so a new gable hips the ends either side of it; `hipped`
 * says how many that changed, for the plan to say so.
 */
export function toggleGable(gables: boolean[], n: number, m: number): { gables: boolean[]; hipped: number } {
  const g = Array.from({ length: n }, (_, i) => !!gables[i])
  g[m] = !g[m]
  let hipped = 0
  if (g[m])
    for (const j of [(m + 1) % n, (m - 1 + n) % n])
      if (j !== m && g[j]) {
        g[j] = false
        hipped++
      }
  return { gables: g, hipped }
}

class MeshBuilder {
  pos: number[] = []
  tris: number[] = []
  add(x: number, y: number, z: number): number {
    this.pos.push(x, y, z)
    return this.pos.length / 3 - 1
  }
  /** Add a triangle, flipped if needed so it faces along `out`. */
  tri(a: number, b: number, c: number, out: [number, number, number]) {
    const P = this.pos
    const ux = P[3 * b] - P[3 * a]
    const uy = P[3 * b + 1] - P[3 * a + 1]
    const uz = P[3 * b + 2] - P[3 * a + 2]
    const vx = P[3 * c] - P[3 * a]
    const vy = P[3 * c + 1] - P[3 * a + 1]
    const vz = P[3 * c + 2] - P[3 * a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    if (nx * out[0] + ny * out[1] + nz * out[2] >= 0) this.tris.push(a, b, c)
    else this.tris.push(a, c, b)
  }
  /** Triangulate a planar polygon given its 2D coordinates in some frame of its plane. */
  polygon(ids: number[], flat: Vec2[], out: [number, number, number]) {
    for (const [a, b, c] of triangulate(flat)) this.tri(ids[a], ids[b], ids[c], out)
  }
  /** Bottom face and vertical sides of a prism whose top corners are `top`. */
  base(ring: Vec2[], top: number[]) {
    const bottom = ring.map(p => this.add(p[0], p[1], 0))
    this.polygon(bottom, ring, [0, 0, -1])
    const n = ring.length
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const d = unit(sub(ring[j], ring[i]))
      const out: [number, number, number] = [d[1], -d[0], 0]
      this.tri(bottom[i], bottom[j], top[j], out)
      this.tri(bottom[i], top[j], top[i], out)
    }
  }
}

const cache = new WeakMap<Roof, RoofGeometry>()

/** `edge` is the roof's depth at the eaves; printing asks for a thicker one at small scales. */
export function roofGeometry(roof: Roof, edge = ROOF_EDGE): RoofGeometry {
  if (edge !== ROOF_EDGE) return buildRoof(roof, edge)
  const hit = cache.get(roof)
  if (hit) return hit
  const g = buildRoof(roof, edge)
  cache.set(roof, g)
  return g
}

function failed(outline: Vec2[], error: string): RoofGeometry {
  return { outline, lines: [], mesh: { pos: [], tris: [] }, height: 0, area: 0, error }
}

function buildRoof(roof: Roof, edge: number): RoofGeometry {
  const simple = simplifyRing(roof.pts)
  if (simple.pts.length < 3) return failed(roof.pts, 'The roof outline needs at least three corners.')
  if (signedArea(simple.pts) <= 0) return failed(roof.pts, 'The roof outline crosses itself.')
  const outline = growRing(simple.pts, roof.overhang)
  if (signedArea(outline) <= 0) return failed(outline, 'The roof outline crosses itself.')
  const n = outline.length
  const m = new MeshBuilder()
  const tan = Math.tan((Math.min(Math.max(roof.pitch, 1), 75) * Math.PI) / 180)

  if (roof.type === 'flat' || roof.type === 'skillion') {
    let heights = outline.map(() => Math.max(FLAT_ROOF, edge))
    if (roof.type === 'skillion') {
      // the kept edge that the chosen low edge became part of
      let low = simple.edges.length - 1
      for (let k = 0; k < simple.edges.length; k++) if (simple.edges[k] <= roof.lowEdge) low = k
      const a = outline[low]
      const nrm = unit(sub(outline[(low + 1) % n], a))
      const inward: Vec2 = [-nrm[1], nrm[0]]
      heights = outline.map(p => edge + dot(sub(p, a), inward) * tan)
    }
    const top = outline.map((p, i) => m.add(p[0], p[1], heights[i]))
    m.base(outline, top)
    const normal: [number, number, number] = [0, 0, 1]
    m.polygon(top, outline, normal)
    const area = roof.type === 'flat' ? Math.abs(signedArea(outline)) : Math.abs(signedArea(outline)) / Math.cos(Math.atan(tan))
    return { outline, lines: [], mesh: m, height: Math.max(...heights), area, error: null }
  }

  // Hip and gable roofs: every edge slopes at the pitch, except gable ends which stand upright.
  const gable = simple.edges.map(e => roof.type === 'gable' && !!roof.gables[e])
  for (let i = 0; i < n; i++) if (gable[i] && gable[(i + 1) % n]) gable[(i + 1) % n] = false
  const speeds = gable.map(g => (g ? 0 : 1 / tan))
  let sk
  try {
    sk = straightSkeleton(outline, speeds)
  } catch (e) {
    return failed(outline, (e as Error).message)
  }
  const ids = sk.nodes.map(nd => m.add(nd.p[0], nd.p[1], edge + nd.t))
  m.base(
    outline,
    ids.slice(0, n),
  )
  let area = 0
  sk.faces.forEach((face, i) => {
    const p = outline[i]
    const d = unit(sub(outline[(i + 1) % n], p))
    const inward: Vec2 = [-d[1], d[0]]
    const out: [number, number, number] = [-inward[0], -inward[1], speeds[i]]
    const flat = face.map(k => [dot(sub(sk.nodes[k].p, p), d), sk.nodes[k].t] as Vec2)
    m.polygon(
      face.map(k => ids[k]),
      flat,
      out,
    )
    if (speeds[i] > 0) area += Math.abs(signedArea(face.map(k => sk.nodes[k].p))) / Math.cos(Math.atan(tan))
  })

  // Lines worth drawing: skip ones on a gable end, or between two faces in one plane.
  const facesOf = (a: number, b: number) => sk.faces.flatMap((f, i) => (f.includes(a) && f.includes(b) ? [i] : []))
  const lines: [Vec2, Vec2][] = []
  for (const [a, b] of sk.arcs) {
    const fs = facesOf(a, b)
    if (fs.some(i => gable[i])) continue
    if (fs.length === 2) {
      const [i, j] = fs
      const di = unit(sub(outline[(i + 1) % n], outline[i]))
      const dj = unit(sub(outline[(j + 1) % n], outline[j]))
      const inPlane = dot(di, dj) > 0.9999 && Math.abs(cross(di, sub(outline[j], outline[i]))) < 1e-6
      if (inPlane) continue
    }
    lines.push([sk.nodes[a].p, sk.nodes[b].p])
  }
  const height = edge + Math.max(...sk.nodes.map(nd => nd.t))
  return { outline, lines, mesh: m, height, area, error: null }
}
