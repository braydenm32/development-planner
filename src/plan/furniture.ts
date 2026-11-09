import { pointInPolygon, type Vec2 } from '../lib/geom'
import { catalogItem, catalogSolids, catalogSymbol, type SymbolPart, type Solid } from './furnitureCatalog'
import { newId, wallDir, wallLength, type Furniture, type Wall } from './model'

export { CATALOG, FURNITURE_GROUPS, catalogItem, type CatalogItem, type FurnitureGroup } from './furnitureCatalog'

/** A new item from the catalog at its usual size, or null for a key the catalog doesn't have. */
export function newFurniture(kind: string, level: string, at: Vec2, rotation = 0): Furniture | null {
  const item = catalogItem(kind)
  if (!item) return null
  const [width, depth, height] = item.size
  return { id: newId('furniture'), level, kind, at: [at[0], at[1]], rotation: normDeg(rotation), width, depth, height }
}

export function furnitureName(f: Pick<Furniture, 'kind' | 'label'>): string {
  return f.label?.trim() || catalogItem(f.kind)?.name || 'Furniture'
}

/** Angle in degrees, in [0, 360). */
export function normDeg(a: number): number {
  const r = ((a % 360) + 360) % 360
  return r >= 360 - 1e-9 ? 0 : r
}

type Placed = Pick<Furniture, 'at' | 'rotation' | 'width' | 'depth'>

/** A point in the item's own frame (x across, y front to back) to the plan. */
export function furnitureToPlan(f: Pick<Furniture, 'at' | 'rotation'>, p: Vec2): Vec2 {
  const t = (f.rotation * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  return [f.at[0] + p[0] * c - p[1] * s, f.at[1] + p[0] * s + p[1] * c]
}

/** Unit vector from the item's centre towards its back. */
export function backDir(rotation: number): Vec2 {
  const t = (rotation * Math.PI) / 180
  return [-Math.sin(t), Math.cos(t)]
}

/** Footprint corners, anticlockwise. */
export function furnitureCorners(f: Placed): Vec2[] {
  const w = f.width / 2
  const d = f.depth / 2
  return (
    [
      [-w, -d],
      [w, -d],
      [w, d],
      [-w, d],
    ] as Vec2[]
  ).map(p => furnitureToPlan(f, p))
}

export function furnitureContains(f: Placed, p: Vec2): boolean {
  return pointInPolygon(p[0], p[1], furnitureCorners(f))
}

/** The plan symbol in the plan frame, with the appliance note (REF, DW) if it has one. */
export function furnitureSymbol(f: Furniture): { parts: SymbolPart[]; code: string | null } {
  const item = catalogItem(f.kind)
  const parts = catalogSymbol(item, f.width, f.depth).map(p => ({ pts: p.pts.map(q => furnitureToPlan(f, q)), closed: p.closed }))
  return { parts, code: item?.code ?? null }
}

/** The 3D shape in the plan frame, heights above the floor. */
export function furnitureSolids(f: Furniture): Solid[] {
  return catalogSolids(catalogItem(f.kind), f.width, f.depth, f.height).map(s => ({ ...s, pts: s.pts.map(q => furnitureToPlan(f, q)) }))
}

/** Change an item's size, keeping its back where it is (so it stays against its wall). */
export function resized(f: Furniture, size: Partial<Pick<Furniture, 'width' | 'depth' | 'height'>>): Furniture {
  const next = { ...f, ...size }
  const b = backDir(f.rotation)
  const shift = (f.depth - next.depth) / 2
  next.at = [f.at[0] + b[0] * shift, f.at[1] + b[1] * shift]
  return next
}

/** Snap a turn to square (within 7° of it), otherwise to 5° steps; `free` keeps whole degrees. */
export function snapRotation(deg: number, free = false): number {
  const a = normDeg(deg)
  if (free) return normDeg(Math.round(a))
  const square = Math.round(a / 90) * 90
  if (Math.abs(a - square) <= 7) return normDeg(square)
  return normDeg(Math.round(a / 5) * 5)
}

/** The rotation that puts an item's back against a wall face whose normal (out of the wall) is n. */
export function facingAway(n: Vec2): number {
  return normDeg(Math.round(((Math.atan2(n[0], -n[1]) * 180) / Math.PI) * 1e6) / 1e6)
}

interface Face {
  wall: string
  /** Unit normal pointing out of the wall, into the room. */
  n: Vec2
  /** A point on the face, and the face's direction and length. */
  p: Vec2
  dir: Vec2
  len: number
}

function wallFaces(walls: Wall[]): Face[] {
  const faces: Face[] = []
  for (const w of walls) {
    const len = wallLength(w)
    if (len < 1e-3) continue
    const d = wallDir(w)
    const left: Vec2 = [-d[1], d[0]]
    for (const s of [1, -1]) {
      const n: Vec2 = [left[0] * s, left[1] * s]
      faces.push({ wall: w.id, n, p: [w.a[0] + (n[0] * w.thickness) / 2, w.a[1] + (n[1] * w.thickness) / 2], dir: d, len })
    }
  }
  return faces
}

const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1]
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]

/** How far the item reaches from its centre in direction u (u is square to one of its sides). */
function reach(f: Placed, u: Vec2): number {
  const b = backDir(f.rotation)
  return Math.abs(dot(b, u)) * (f.depth / 2) + Math.abs(b[1] * u[0] - b[0] * u[1]) * (f.width / 2)
}

/** Is one of the item's sides square to a face with normal n (within about a degree)? */
const squareTo = (rotation: number, n: Vec2) => {
  const b = backDir(rotation)
  const c = Math.abs(dot(b, n))
  return c > 0.9998 || c < 0.0175
}

export interface FurnitureFit {
  at: Vec2
  rotation: number
  /** 'wall' when pushed flush against a wall, 'corner' when against two. */
  snapped: 'wall' | 'corner' | null
  /** Where it touches the first wall, for a snap marker. */
  touch: Vec2 | null
}

export interface FitOptions {
  /** How close (m) an edge must come to a wall face to snap to it. */
  tol: number
  /** No snapping at all (Shift held). */
  free?: boolean
}

/**
 * Where an item dragged to `raw` should go. Items that stand against a wall have their
 * back pushed flush to a nearby wall face and turn to face out from it; an item already
 * square to a wall can also have a side pushed flush. Once against one wall, it slides
 * along it into a corner if a square wall is close. Otherwise it goes to the nearest 10 mm.
 */
export function fitFurniture(item: Furniture, raw: Vec2, walls: Wall[], opts: FitOptions): FurnitureFit {
  if (opts.free) return { at: [round(raw[0], 0.001), round(raw[1], 0.001)], rotation: item.rotation, snapped: null, touch: null }
  const grid: FurnitureFit = { at: [round(raw[0], 0.01), round(raw[1], 0.01)], rotation: item.rotation, snapped: null, touch: null }
  if (!catalogItem(item.kind)?.wall) return grid

  const faces = wallFaces(walls)
  let best: { face: Face; rotation: number; at: Vec2; score: number } | null = null
  for (const face of faces) {
    const s = dot(sub(raw, face.p), face.n)
    const along = dot(sub(raw, face.p), face.dir)
    if (s <= 0 || along < 0 || along > face.len) continue
    const options: number[] = [facingAway(face.n)]
    // Already square to the wall: a side (or the back) can go flush without turning, but never the front.
    if (squareTo(item.rotation, face.n) && dot(backDir(item.rotation), face.n) < 0.5) options.push(item.rotation)
    for (const rotation of options) {
      const e = reach({ ...item, rotation }, face.n)
      const score = Math.abs(s - e) + (rotation === item.rotation ? 0 : 1e-6)
      if (score > opts.tol || (best && score >= best.score)) continue
      best = { face, rotation, at: [raw[0] + face.n[0] * (e - s), raw[1] + face.n[1] * (e - s)], score }
    }
  }
  if (!best) return grid

  // Along the wall it moves in 10 mm steps, or slides into a corner if a square wall face is close to its side.
  const along = dot(sub(best.at, best.face.p), best.face.dir)
  const nudge = round(along, 0.01) - along
  const placed = { ...item, rotation: best.rotation, at: [best.at[0] + best.face.dir[0] * nudge, best.at[1] + best.face.dir[1] * nudge] as Vec2 }
  const n1 = best.face.n
  let corner: { at: Vec2; score: number } | null = null
  for (const face of faces) {
    if (face.wall === best.face.wall || Math.abs(dot(face.n, n1)) > 0.02) continue
    const s = dot(sub(placed.at, face.p), face.n)
    const e = reach(placed, face.n)
    const along = dot(sub(placed.at, face.p), face.dir)
    const side = reach(placed, face.dir)
    if (s <= 0 || along < -side || along > face.len + side) continue
    const score = Math.abs(s - e)
    if (score > opts.tol || (corner && score >= corner.score)) continue
    corner = { at: [placed.at[0] + face.n[0] * (e - s), placed.at[1] + face.n[1] * (e - s)], score }
  }
  const at = corner?.at ?? placed.at
  const e = reach(placed, n1)
  const touch: Vec2 = [at[0] - n1[0] * e, at[1] - n1[1] * e]
  return { at, rotation: best.rotation, snapped: corner ? 'corner' : 'wall', touch }
}

const round = (v: number, step: number) => Math.round(v / step) * step

export type FurnitureSide = 'back' | 'right' | 'front' | 'left'

export interface WallClearance {
  side: FurnitureSide
  /** Middle of the item's side, and the point on the wall straight out from it. */
  from: Vec2
  to: Vec2
  dist: number
}

/**
 * Distance from the middle of each side of an item straight out to the nearest wall,
 * using the wall outlines (so it measures to the wall's face). Sides with no wall within
 * `max` metres are left out; a side touching or inside a wall reads 0.
 */
export function wallClearances(f: Placed, polys: Vec2[][], max = 20): WallClearance[] {
  const b = backDir(f.rotation)
  const r: Vec2 = [b[1], -b[0]]
  const sides: [FurnitureSide, Vec2, number][] = [
    ['back', b, f.depth / 2],
    ['right', r, f.width / 2],
    ['front', [-b[0], -b[1]], f.depth / 2],
    ['left', [-r[0], -r[1]], f.width / 2],
  ]
  const out: WallClearance[] = []
  for (const [side, u, e] of sides) {
    const from: Vec2 = [f.at[0] + u[0] * e, f.at[1] + u[1] * e]
    if (polys.some(p => pointInPolygon(from[0], from[1], p))) {
      out.push({ side, from, to: from, dist: 0 })
      continue
    }
    let t = Infinity
    for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
        const hit = rayHit(from, u, poly[i], poly[(i + 1) % poly.length])
        if (hit !== null && hit < t) t = hit
      }
    }
    if (t > max) continue
    out.push({ side, from, to: [from[0] + u[0] * t, from[1] + u[1] * t], dist: t })
  }
  return out
}

/** Distance along the ray o + t*u (t >= 0) to segment pq, or null. */
function rayHit(o: Vec2, u: Vec2, p: Vec2, q: Vec2): number | null {
  const e: Vec2 = [q[0] - p[0], q[1] - p[1]]
  const den = u[0] * e[1] - u[1] * e[0]
  if (Math.abs(den) < 1e-12) return null
  const op: Vec2 = [p[0] - o[0], p[1] - o[1]]
  const t = (op[0] * e[1] - op[1] * e[0]) / den
  const s = (op[0] * u[1] - op[1] * u[0]) / den
  if (s < -1e-9 || s > 1 + 1e-9 || t < -1e-6) return null
  return Math.max(0, t)
}
