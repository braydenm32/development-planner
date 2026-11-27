// What the finishes need from the house's 3D surfaces: UVs in real metres laid on each face, so
// brick courses run level and roof ribs run down the slope at their true size, and the outside
// walls' faces sorted into the outside and the inside, so each side can have its own finish.
// Both run once when the house's 3D is built, never per frame.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { pointInPolygon, type Vec2 } from '../lib/geom'
import { planarFaces, roomShape, type Face } from '../plan/geometry'
import { floorRL, houseWalls, toSite, type Plan } from '../plan/model'
import { wallTopRL } from '../plan/roofline'
import { floorZoneOf, resolveFinishes, type FloorFinish } from './model'

const UP = new THREE.Vector3(0, 1, 0)

/**
 * Give a non-indexed geometry UVs in metres: on each face, u runs level along it and v runs up its
 * slope (or, on a level face, east and north). Returns the same geometry, for chaining.
 */
export function metreUVs<G extends THREE.BufferGeometry | null>(g: G): G {
  if (!g || g.index) return g
  const pos = g.getAttribute('position')
  const uv = new Float32Array(pos.count * 2)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  const across = new THREE.Vector3()
  const along = new THREE.Vector3()
  const p = new THREE.Vector3()
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i)
    b.fromBufferAttribute(pos, i + 1)
    c.fromBufferAttribute(pos, i + 2)
    n.subVectors(c, b).cross(p.subVectors(a, b)).normalize()
    const level = Math.abs(n.y) > 0.999 || n.lengthSq() < 0.5
    if (!level) {
      across.crossVectors(UP, n).normalize()
      along.crossVectors(n, across).normalize()
      if (along.y < 0) along.negate()
    }
    for (let k = 0; k < 3; k++) {
      p.fromBufferAttribute(pos, i + k)
      uv[(i + k) * 2] = level ? p.x : p.dot(across)
      uv[(i + k) * 2 + 1] = level ? -p.z : p.dot(along)
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

/** Says whether a point in the scene is inside a room of the house (scene x, y, z). */
export type InsideTest = (x: number, y: number, z: number) => boolean

/** The rooms of each level, in the scene, with the heights their walls stand between. */
export function insideTest(plan: Plan, origin: Vec2, refZ: number): InsideTest {
  const levels = plan.levels.map(l => {
    const walls = houseWalls(plan.walls.filter(w => w.level === l.id))
    const floor = floorRL(plan, l.id) - refZ
    const top = Math.max(floor + l.height, ...walls.map(w => wallTopRL(plan, w) - refZ))
    const rooms = planarFaces(walls)
      .filter((f: Face) => f.area > 0)
      .map(f => f.pts.map(q => toSite(q, plan.placement, origin)))
    return { floor, top, rooms }
  })
  return (x, y, z) => levels.some(l => y >= l.floor - 0.05 && y <= l.top + 0.05 && l.rooms.some(r => pointInPolygon(x, -z, r)))
}

/**
 * Sort a non-indexed geometry's faces into two groups for a pair of materials: group 0 faces the
 * outside, group 1 faces into a room. A face looks into a room when a point just in front of it
 * is inside one; tops, ends and the reveals round openings count as outside unless they do.
 */
export function splitInsideFaces<G extends THREE.BufferGeometry | null>(g: G, inside: InsideTest): G {
  if (!g || g.index) return g
  const names = Object.keys(g.attributes)
  const pos = g.getAttribute('position')
  const tris = pos.count / 3
  const out: number[] = []
  const inn: number[] = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  const t = new THREE.Vector3()
  for (let i = 0; i < tris; i++) {
    a.fromBufferAttribute(pos, i * 3)
    b.fromBufferAttribute(pos, i * 3 + 1)
    c.fromBufferAttribute(pos, i * 3 + 2)
    n.subVectors(c, b).cross(t.subVectors(a, b)).normalize()
    const mid = a.add(b).add(c).divideScalar(3)
    const front = mid.addScaledVector(n, 0.04)
    ;(Math.abs(n.y) < 0.5 && inside(front.x, front.y, front.z) ? inn : out).push(i)
  }
  const order = [...out, ...inn]
  for (const name of names) {
    const attr = g.getAttribute(name) as THREE.BufferAttribute
    const size = attr.itemSize
    const src = attr.array as Float32Array
    const dst = new Float32Array(src.length)
    order.forEach((tri, k) => dst.set(src.subarray(tri * 3 * size, (tri + 1) * 3 * size), k * 3 * size))
    g.setAttribute(name, new THREE.BufferAttribute(dst, size, attr.normalized))
  }
  g.clearGroups()
  g.addGroup(0, out.length * 3, 0)
  g.addGroup(out.length * 3, inn.length * 3, 1)
  return g
}

/** The floors' finishes (src/finishes/Floors3D.tsx): each finish in use, with its rooms' floors, inside their walls, as one geometry. */
export function floorGeometries(plan: Plan, origin: Vec2, refZ: number, showLevels: Set<string> | null): Map<FloorFinish, THREE.BufferGeometry> {
  const floors = resolveFinishes(plan.finishes).floors
  const parts = new Map<FloorFinish, THREE.BufferGeometry[]>()
  if (Object.values(floors).every(f => f === 'plain')) return new Map()
  for (const level of plan.levels) {
    if (showLevels && !showLevels.has(level.id)) continue
    const rooms = plan.rooms.filter(r => r.level === level.id && floors[floorZoneOf(r)] !== 'plain')
    if (!rooms.length) continue
    const faces = planarFaces(houseWalls(plan.walls.filter(w => w.level === level.id)))
    const y = floorRL(plan, level.id) - refZ + 0.004
    for (const room of rooms) {
      const shape = roomShape(room, faces)
      if (!shape || shape.inner.length < 3) continue
      const pts = shape.inner.map(p => toSite(p, plan.placement, origin))
      const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))))
      g.rotateX(-Math.PI / 2)
      g.translate(0, y, 0)
      const flat = g.toNonIndexed()
      g.dispose()
      flat.deleteAttribute('uv')
      const finish = floors[floorZoneOf(room)]
      parts.set(finish, [...(parts.get(finish) ?? []), flat])
    }
  }
  const out = new Map<FloorFinish, THREE.BufferGeometry>()
  for (const [finish, list] of parts) {
    const m = mergeGeometries(list, false)
    list.forEach(g => g.dispose())
    if (m) out.set(finish, metreUVs(m))
  }
  return out
}
