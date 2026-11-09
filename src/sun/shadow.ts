// The house's shadow on the ground at one moment. Every corner of the house is followed down its
// sun ray until the ray meets the ground (the surveyed ground, or the finished ground where it's
// cut or filled); beyond the survey the ground carries on at the level of its edge. Each face is
// filled into a grid between its cast corners, and the grid's outline is the shadow. Long edges
// are split first so a shadow running over a slope bends with the ground.

import { bounds, pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import { bearingName } from '../lib/terrain'
import { Raster, simplifyRing, traceRings } from './raster'
import type { HouseSolids } from './solids'
import { gridBearing, type SiteLocation } from './location'
import type { SunPosition } from './solar'

/** Anything with heights: a Heightfield, or a flat plane in tests. */
export interface Ground {
  sample(x: number, y: number): number
}

/** Which way the light comes from, in the survey's frame. */
export interface SunRay {
  /** Unit vector along the ground towards the sun (x east, y north). */
  dx: number
  dy: number
  /** Rise per metre along the ground towards the sun: tan(elevation). */
  tanE: number
}

/** Below this the sun is too low to cast a shadow worth drawing (degrees). */
export const LOW_SUN = 1

/** The sun as a ray in the survey's frame, or null when it's down (or nearly). */
export function sunRay(sun: Pick<SunPosition, 'azimuth' | 'elevation'>, loc: SiteLocation): SunRay | null {
  if (sun.elevation < LOW_SUN) return null
  const b = (gridBearing(sun.azimuth, loc) * Math.PI) / 180
  return { dx: Math.sin(b), dy: Math.cos(b), tanE: Math.tan((sun.elevation * Math.PI) / 180) }
}

/** No shadow is followed further than this from what casts it (m). */
export const MAX_REACH = 120

/**
 * Where the sun ray through a point meets the ground. A point below the ground is followed back
 * up the ray to where it comes out.
 */
export function castPoint(x: number, y: number, z: number, ray: SunRay, ground: Ground): Vec2 {
  const h = (s: number) => z - s * ray.tanE - ground.sample(x - s * ray.dx, y - s * ray.dy)
  const h0 = h(0)
  if (Math.abs(h0) < 1e-4) return [x, y]
  // Most ground is gentler than the sun is high, and then this settles in a few steps.
  let s = h0 / ray.tanE
  for (let k = 0; k < 8; k++) {
    const next = s + h(s) / ray.tanE
    if (Math.abs(next - s) < 1e-3) {
      s = next
      if (Math.abs(h(s)) < 0.01) return [x - s * ray.dx, y - s * ray.dy]
      break
    }
    s = next
  }
  // Ground as steep as the sun: walk along the ray, then halve the step that crosses.
  const dir = h0 > 0 ? 1 : -1
  const step = 0.25
  let a = 0
  let ha = h0
  for (let t = step; t <= MAX_REACH; t += step) {
    const ht = h(dir * t)
    if (Math.sign(ht) !== Math.sign(ha)) {
      let lo = a
      let hi = t
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2
        if (Math.sign(h(dir * mid)) === Math.sign(ha)) lo = mid
        else hi = mid
      }
      const sm = (dir * (lo + hi)) / 2
      return [x - sm * ray.dx, y - sm * ray.dy]
    }
    a = t
    ha = ht
  }
  const sm = dir * MAX_REACH
  return [x - sm * ray.dx, y - sm * ray.dy]
}

/** A ring with no side longer than `max` (extra points along the long ones). */
function split(ring: Vec2[], max: number): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / max))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}

/** Longest side of a cast face before it is split, so it follows the ground (m). */
const SPLIT = 1.5

/** Each face of the house cast onto the ground, as flat x, y lists, ready to fill. */
export function castFaces(solids: HouseSolids, ray: SunRay, ground: Ground): number[][] {
  const faces: number[][] = []
  const cast = (x: number, y: number, z: number) => castPoint(x, y, z, ray, ground)
  for (const p of solids.prisms) {
    const ring = split(p.ring, SPLIT)
    // Only what stands above the ground casts a shadow: a wall cut into a bank starts at the
    // ground, not at its footing (which, cast, would land back towards the sun).
    const g = ring.map(q => ground.sample(q[0], q[1]))
    const lo = ring.map((q, i) => cast(q[0], q[1], Math.max(p.z0, g[i])))
    const hi = ring.map((q, i) => cast(q[0], q[1], Math.max(p.z1, g[i])))
    faces.push(lo.flat(), hi.flat())
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length
      faces.push([...lo[i], ...lo[j], ...hi[j], ...hi[i]])
    }
  }
  const t = solids.roofTris
  const tri = (a: number[], b: number[], c: number[], depth: number) => {
    const long = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]))
    if (long > SPLIT * 2 && depth < 4) {
      const mid = (p: number[], q: number[]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]
      const ab = mid(a, b)
      const bc = mid(b, c)
      const ca = mid(c, a)
      for (const [p, q, r] of [
        [a, ab, ca],
        [ab, b, bc],
        [ca, bc, c],
        [ab, bc, ca],
      ])
        tri(p, q, r, depth + 1)
      return
    }
    faces.push([...cast(a[0], a[1], a[2]), ...cast(b[0], b[1], b[2]), ...cast(c[0], c[1], c[2])])
  }
  for (let k = 0; k + 8 < t.length; k += 9) tri([t[k], t[k + 1], t[k + 2]], [t[k + 3], t[k + 4], t[k + 5]], [t[k + 6], t[k + 7], t[k + 8]], 0)
  return faces
}

/** A grid big enough for the cast faces (or the frame given), with them filled in. */
export function shadowRaster(faces: number[][], cell: number, frame?: Raster): Raster {
  let r = frame?.blank()
  if (!r) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const f of faces)
      for (let k = 0; k < f.length; k += 2) {
        minX = Math.min(minX, f[k])
        maxX = Math.max(maxX, f[k])
        minY = Math.min(minY, f[k + 1])
        maxY = Math.max(maxY, f[k + 1])
      }
    if (!Number.isFinite(minX)) return new Raster(0, 0, cell, 1, 1)
    r = Raster.around(minX, minY, maxX, maxY, cell)
  }
  for (const f of faces) r.fill(f)
  return r
}

/** Cells whose centres are inside a polygon, in the same frame. */
export function polygonMask(frame: Raster, ring: Vec2[]): Raster {
  const m = frame.blank()
  m.fill(ring.flat())
  return m
}

/** The outline of a grid's covered cells, with straight runs merged (no point moves more than a third of a cell). */
export function outline(r: Raster): Vec2[][] {
  return traceRings(r)
    .map(ring => simplifyRing(ring, r.cell * 0.3))
    .filter(ring => Math.abs(signedArea(ring)) > r.cell * r.cell * 2)
}

export interface Shadow {
  /** Outline rings in the survey's frame: anticlockwise outsides, clockwise holes. */
  rings: Vec2[][]
  /** Ground in the shadow, under the house included (m²). */
  area: number
  /** The part over the boundary, on the neighbours' land. */
  over: { rings: Vec2[][]; area: number; sides: string[] }
  /** The point of the shadow furthest from the sun: where its label goes. */
  tip: Vec2
}

/** Cell size for drawn shadows (m). */
export const DRAW_CELL = 0.1

/** The house's shadow at one moment, with the part that falls over the boundary. */
export function shadowOf(solids: HouseSolids, ray: SunRay, ground: Ground, boundary: Vec2[], cell = DRAW_CELL): Shadow {
  const faces = castFaces(solids, ray, ground)
  const r = shadowRaster(faces, cell)
  const off = r.minus(polygonMask(r, boundary))
  const rings = outline(r)
  const overRings = outline(off)
  let tip: Vec2 = [0, 0]
  let far = -Infinity
  for (const ring of rings)
    for (const p of ring) {
      const d = -(p[0] * ray.dx + p[1] * ray.dy)
      if (d > far) {
        far = d
        tip = p
      }
    }
  return { rings, area: r.area(), over: { rings: overRings, area: off.area(), sides: sidesCrossed(off, boundary) }, tip }
}

/** Which way each side of the block faces ("south"), by edge. */
export function edgeFacings(boundary: Vec2[]): string[] {
  const ccw = signedArea(boundary) > 0
  return boundary.map((a, i) => {
    const b = boundary[(i + 1) % boundary.length]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    // Outward is on the right of an anticlockwise ring.
    const out: Vec2 = ccw ? [dy, -dx] : [-dy, dx]
    return bearingName(((Math.atan2(out[0], out[1]) * 180) / Math.PI + 360) % 360)
  })
}

/** The sides of the block a patch of shadow outside it lies beyond, nearest side for each cell. */
export function sidesCrossed(off: Raster, boundary: Vec2[]): string[] {
  if (boundary.length < 3) return []
  const names = edgeFacings(boundary)
  const counts = new Map<string, number>()
  const { nx, ny, x0, y0, cell } = off
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (!off.v[j * nx + i]) continue
      const p: Vec2 = [x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell]
      let best = Infinity
      let at = 0
      for (let k = 0; k < boundary.length; k++) {
        const a = boundary[k]
        const b = boundary[(k + 1) % boundary.length]
        const dx = b[0] - a[0]
        const dy = b[1] - a[1]
        const l2 = dx * dx + dy * dy || 1
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
        const d = Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1])
        if (d < best) {
          best = d
          at = k
        }
      }
      counts.set(names[at], (counts.get(names[at]) ?? 0) + 1)
    }
  // Ignore slivers of a few cells where a shadow only grazes a corner.
  const min = Math.max(4, 0.01 / (cell * cell))
  return [...counts].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).map(([s]) => s)
}

/** A frame for a run of shadows over a day: the block and the house, reaching out as far as the lowest sun throws. */
export function dayFrame(solids: HouseSolids, boundary: Vec2[], ground: Ground, lowestTanE: number, cell: number): Raster {
  const pts = [...boundary, ...solids.prisms.flatMap(p => p.ring)]
  for (let k = 0; k + 2 < solids.roofTris.length; k += 3) pts.push([solids.roofTris[k], solids.roofTris[k + 1]])
  const b = bounds(pts)
  let low = Infinity
  for (const p of pts) low = Math.min(low, ground.sample(p[0], p[1]))
  const reach = Math.min(MAX_REACH, Math.max(0, solids.top - low) / Math.max(lowestTanE, 0.05)) + 2
  return Raster.around(b.minX - reach, b.minY - reach, b.maxX + reach, b.maxY + reach, cell)
}

/** True when a point is on the block. */
export const onBlock = (p: Vec2, boundary: Vec2[]) => pointInPolygon(p[0], p[1], boundary)
