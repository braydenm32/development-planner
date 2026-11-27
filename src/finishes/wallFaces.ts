// The outside walls in 3D sorted by finish (a wall's own, or the house's): each piece of wall
// between its doors and windows is cut where its two finishes change over, and the faces are
// gathered into one mesh per finish and colour, however many walls share it. A gable end takes
// the (upper) finish of the wall below it, as a built one does. Built once with the house's 3D.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { wallPieces } from '../plan/geometry'
import { wallDir, wallLength, type Opening, type Plan, type Roof, type Wall } from '../plan/model'
import { ROOF_EDGE, type RoofMesh } from '../plan/roof'
import { band, bandWords, houseUpper, wallBands, type Band } from './model'
import { metreUVs, splitInsideFaces, type InsideTest } from './surfaces'

export interface FinishPiece {
  s0: number
  s1: number
  z0: number
  z1: number
  /** Which finish its faces are drawn in; null for an inside wall. */
  band: Band | null
}

/**
 * A wall's pieces (wallPieces: round its doors and windows), each with its finish: an outside
 * wall with two finishes has the pieces that cross the change cut in two there.
 */
export function finishPieces(plan: Plan, w: Wall, len: number, height: number, openings: Pick<Opening, 'offset' | 'width' | 'height' | 'sill'>[]): FinishPiece[] {
  const pieces = wallPieces(len, height, openings)
  if (w.kind !== 'external') return pieces.map(p => ({ ...p, band: null }))
  const { upper, lower, at } = wallBands(plan.finishes, w.finish, height)
  if (!lower || at === undefined) return pieces.map(p => ({ ...p, band: upper }))
  return pieces.flatMap(p => {
    if (p.z1 <= at + 1e-6) return [{ ...p, band: lower }]
    if (p.z0 >= at - 1e-6) return [{ ...p, band: upper }]
    return [
      { ...p, z1: at, band: lower },
      { ...p, z0: at, band: upper },
    ]
  })
}

export interface WallMesh {
  key: string
  /** "outside walls" for the house's own finish; "outside walls, weatherboard, sage" for another. */
  name: string
  band: Band
  geometry: THREE.BufferGeometry
}

/** A new non-indexed geometry of some of `g`'s triangles (by number), with its attributes. */
function pickTris(g: THREE.BufferGeometry, tris: number[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry()
  for (const name of Object.keys(g.attributes)) {
    const attr = g.getAttribute(name) as THREE.BufferAttribute
    const size = attr.itemSize
    const src = attr.array as Float32Array
    const dst = new Float32Array(tris.length * 3 * size)
    tris.forEach((t, k) => dst.set(src.subarray(t * 3 * size, (t + 1) * 3 * size), k * 3 * size))
    out.setAttribute(name, new THREE.BufferAttribute(dst, size, attr.normalized))
  }
  return out
}

/** The outside walls' geometry being gathered, by finish. */
export class OutsideWalls {
  private parts = new Map<string, THREE.BufferGeometry[]>()
  private bands = new Map<string, Band>()
  private readonly house: Band
  private readonly plan: Plan

  constructor(plan: Plan) {
    this.plan = plan
    this.house = band(houseUpper(plan.finishes))
  }

  /** Some outside wall geometry, in a finish (a FinishPiece's band). */
  add(b: Band, g: THREE.BufferGeometry) {
    if (!this.bands.has(b.key)) this.bands.set(b.key, b)
    const list = this.parts.get(b.key)
    if (list) list.push(g)
    else this.parts.set(b.key, [g])
  }

  /**
   * Take the gable ends of a roof (its upright faces above the eaves) out of the roof's geometry,
   * into the wall finish: the upper finish of the outside wall each stands over (that wall's own,
   * or the house's), and the house's where no wall is under it. `mesh` is the roof in plan
   * metres; `flat` is the same triangles in the scene, in order. Returns what's left of the roof
   * (`flat` itself when it has no gable end).
   */
  takeGables(roof: Roof, mesh: RoofMesh, flat: THREE.BufferGeometry): THREE.BufferGeometry {
    if (roof.type !== 'gable') return flat
    const walls = this.plan.walls.filter(w => w.level === roof.level && w.kind === 'external')
    const P = mesh.pos
    let zMin = Infinity
    for (let i = 2; i < P.length; i += 3) zMin = Math.min(zMin, P[i])
    const bandOf = new Map<number, Band>()
    const nTris = mesh.tris.length / 3
    for (let k = 0; k < nTris; k++) {
      const v = [0, 1, 2].map(j => mesh.tris[k * 3 + j] * 3)
      const [a, b, c] = v.map(i => new THREE.Vector3(P[i], P[i + 1], P[i + 2]))
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
      const len = n.length()
      // Upright, and wholly above the eaves' edge: a gable end, not the fascia under the eaves.
      if (len < 1e-9 || Math.abs(n.z) / len > 1e-3 || Math.min(a.z, b.z, c.z) < zMin + ROOF_EDGE / 2) continue
      const nx = n.x / len
      const ny = n.y / len
      const mx = (a.x + b.x + c.x) / 3
      const my = (a.y + b.y + c.y) / 3
      let best: Wall | null = null
      let bestOverlap = 0
      for (const w of walls) {
        const d = wallDir(w)
        // Along the gable, and under it: no further out than the eaves and half the wall.
        if (Math.abs(d[0] * nx + d[1] * ny) > 0.05) continue
        const off = Math.abs((mx - w.a[0]) * -d[1] + (my - w.a[1]) * d[0])
        if (off > roof.overhang + w.thickness / 2 + 0.3) continue
        const ts = [a, b, c].map(p => (p.x - w.a[0]) * d[0] + (p.y - w.a[1]) * d[1])
        const overlap = Math.min(Math.max(...ts), wallLength(w)) - Math.max(Math.min(...ts), 0)
        if (overlap > bestOverlap) {
          best = w
          bestOverlap = overlap
        }
      }
      bandOf.set(k, best ? wallBands(this.plan.finishes, best.finish, Infinity).upper : this.house)
    }
    if (!bandOf.size) return flat
    const rest: number[] = []
    const byKey = new Map<string, { band: Band; tris: number[] }>()
    for (let k = 0; k < nTris; k++) {
      const b = bandOf.get(k)
      if (!b) rest.push(k)
      else if (byKey.has(b.key)) byKey.get(b.key)!.tris.push(k)
      else byKey.set(b.key, { band: b, tris: [k] })
    }
    for (const { band: b, tris } of byKey.values()) this.add(b, pickTris(flat, tris))
    const left = pickTris(flat, rest)
    flat.dispose()
    return left
  }

  /** One mesh per finish, the house's own first: UVs in metres, and the room-facing faces apart. */
  build(inside: InsideTest): WallMesh[] {
    const keys = [...this.parts.keys()].sort((p, q) => (p === this.house.key ? -1 : q === this.house.key ? 1 : p.localeCompare(q)))
    const out: WallMesh[] = []
    for (const key of keys) {
      const list = this.parts.get(key)!
      // Pieces come with and without normals and UVs: both are made afresh below.
      for (const g of list) {
        g.deleteAttribute('normal')
        g.deleteAttribute('uv')
      }
      const m = mergeGeometries(list, false)
      list.forEach(g => g.dispose())
      if (!m) continue
      m.computeVertexNormals()
      const b = this.bands.get(key)!
      out.push({ key, name: key === this.house.key ? 'outside walls' : `outside walls, ${bandWords(b)}`, band: b, geometry: splitInsideFaces(metreUVs(m), inside) })
    }
    this.parts.clear()
    return out
  }
}
