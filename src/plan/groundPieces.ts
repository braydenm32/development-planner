// Pools and tanks in the ground or on a level base: what the card's "Sits" sets (Furniture.ground)
// turned into earthworks and heights. In the ground, the piece's footprint is dug straight down
// from the ground to its floor (its shell or the tank holds the sides, so no batter); above it,
// it stands on a level pad of its own, cut and filled like a small slab. A piece with no setting
// (an older plan's) stands at its floor level as drawn and moves no earth, exactly as before.
//
// The levels that follow the ground are read off the natural ground, so they don't move when the
// earthworks they make change the finished ground.

import type { Platform } from '../lib/earthworks'
import { pointInPolygon, type Vec2 } from '../lib/geom'
import type { WallStrip } from '../lib/terrainMesh'
import { furnitureCorners, furnitureSolids, furnitureToPlan } from './furniture'
import { buildingOutline, planarFaces } from './geometry'
import { houseWalls, sortedLevels, toSite, type Furniture, type PieceGround, type Plan } from './model'

/** The pieces that can go in the ground (how a new one sits is its catalogue entry's `sits`): their usual and deepest depths. */
const KINDS: Record<string, { depth: (f: Furniture) => number; max: (f: Furniture) => number }> = {
  pool: { depth: () => 1.5, max: () => 3.5 },
  // Buried to its own height, its lid is at the ground.
  tank: { depth: f => f.height, max: f => f.height },
}

/** Ids of the earthworks a piece makes start with this, so they can be told from the house's. */
export const PIECE_PREFIX = 'piece:'
export const isPieceId = (id: string | undefined) => !!id?.startsWith(PIECE_PREFIX)
export const piecePlatformId = (furnitureId: string) => `${PIECE_PREFIX}${furnitureId}`

/** Whether a kind of piece has the ground options at all (a pool, a tank). */
export const sitsInGround = (kind: string) => kind in KINDS

/** How deep it goes (m): as typed, or its usual depth. */
export function pieceDepth(f: Furniture): number {
  const k = KINDS[f.kind]
  const d = f.ground?.depth
  return d !== undefined && Number.isFinite(d) && d > 0 ? d : (k?.depth(f) ?? f.height)
}

/** The most it can go into the ground (m): a tank no deeper than its own height. */
export const maxDepth = (f: Furniture) => KINDS[f.kind]?.max(f) ?? 3.5

/**
 * Whether the ground options apply to this piece where it is: a pool or tank on the lowest level,
 * outside the house. Elsewhere (an upper level, inside the house) it's drawn at its floor, as always.
 */
export function groundApplies(plan: Plan, f: Furniture): boolean {
  if (!sitsInGround(f.kind)) return false
  const lowest = sortedLevels(plan)[0]
  if (!lowest || f.level !== lowest.id) return false
  const outlines = buildingOutline(planarFaces(houseWalls(plan.walls.filter(w => w.level === lowest.id)))).outlines
  return !outlines.some(r => pointInPolygon(f.at[0], f.at[1], r))
}

/** The piece's footprint in the plan frame: its round body for a tank, its corners otherwise. */
export function pieceRing(f: Furniture): Vec2[] {
  const solids = furnitureSolids(f)
  return solids.length === 1 ? solids[0].pts : furnitureCorners(f)
}

/** What the earthworks need of one piece, before the ground is read: worked out from the plan alone. */
export interface PieceSpec {
  id: string
  sits: PieceGround['sits']
  /** Its footprint, in the survey's local frame. */
  ring: Vec2[]
  depth: number
  top?: number
  base?: number
  /** Its sides are walls (a pool's shell): the 3D ground steps straight down inside them. */
  walled: boolean
}

const finite = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v : undefined)

/** The pieces set in or on the ground, as the earthworks read them. */
export function pieceSpecs(plan: Plan, origin: Vec2): PieceSpec[] {
  const out: PieceSpec[] = []
  for (const f of plan.furniture) {
    const g = f.ground
    if (!g || (g.sits !== 'in' && g.sits !== 'above') || !groundApplies(plan, f)) continue
    const ring = pieceRing(f).map(p => toSite(p, plan.placement, origin))
    out.push({
      id: f.id,
      sits: g.sits,
      ring,
      depth: pieceDepth(f),
      ...(finite(g.top) !== undefined ? { top: g.top } : {}),
      ...(finite(g.base) !== undefined ? { base: g.base } : {}),
      walled: ring.length === 4,
    })
  }
  return out
}

type Ground = { sample: (x: number, y: number) => number }

/** Points spread over a ring about `step` apart (and its corners), for reading the ground under it. */
function under(ring: Vec2[], step = 0.25): Vec2[] {
  const xs = ring.map(p => p[0])
  const ys = ring.map(p => p[1])
  const pts: Vec2[] = []
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step)
    for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) if (pointInPolygon(x, y, ring)) pts.push([x, y])
  return pts.length ? pts : ring
}

/** The ground at the highest corner of its footprint: a top edge there buries nothing. */
export const highestGround = (ring: Vec2[], ground: Ground) => Math.max(...ring.map(p => ground.sample(p[0], p[1])))

/**
 * The mean ground under its footprint: a base there is cut on the high side and filled on the low
 * side about equally, the usual way to set a pad on a slope.
 */
export function meanGround(ring: Vec2[], ground: Ground): number {
  const pts = under(ring)
  return pts.reduce((t, p) => t + ground.sample(p[0], p[1]), 0) / pts.length
}

/** A piece's levels once the ground is read: in the ground, its top edge and floor; above it, its base. */
export type PieceLevels = { sits: 'in'; top: number; floor: number } | { sits: 'above'; base: number }

export function pieceLevels(spec: Pick<PieceSpec, 'sits' | 'ring' | 'depth' | 'top' | 'base'>, natural: Ground): PieceLevels {
  if (spec.sits === 'in') {
    const top = spec.top ?? highestGround(spec.ring, natural)
    return { sits: 'in', top, floor: top - spec.depth }
  }
  return { sits: 'above', base: spec.base ?? meanGround(spec.ring, natural) }
}

/** Half the thickness of a pool's shell, for the 3D ground's step at its edge (m): thin, so the step sits inside the shell wall. */
const SHELL_HALF = 0.02

/** The earthworks the pieces make, and the 3D ground's steps at the walled ones' edges. */
export function piecePlatforms(specs: PieceSpec[], natural: Ground): { platforms: Platform[]; strips: WallStrip[] } {
  const platforms: Platform[] = []
  const strips: WallStrip[] = []
  for (const s of specs) {
    const lv = pieceLevels(s, natural)
    if (lv.sits === 'in') {
      // Dug straight down to its floor; where its top stands above the ground, it stands proud (no fill).
      platforms.push({ id: piecePlatformId(s.id), include: [s.ring], exclude: [], level: lv.floor, fill: false, fixed: true, sheer: true })
      if (s.walled) s.ring.forEach((a, i) => strips.push({ a, b: s.ring[(i + 1) % s.ring.length], half: SHELL_HALF, shell: true }))
    } else {
      // A level base the size of its footprint plus the usual margin, as a slab's.
      platforms.push({ id: piecePlatformId(s.id), include: [s.ring], exclude: [], level: lv.base, fill: true, fixed: true })
    }
  }
  return { platforms, strips }
}

/** How far under its top edge a pool's water sits (m). */
export const WATER_DOWN = 0.15

/** The levels for one piece of the plan, or null when it stands at its floor as drawn. */
export function levelsOf(plan: Plan, f: Furniture, origin: Vec2, natural: Ground): PieceLevels | null {
  const spec = pieceSpecs({ ...plan, furniture: [f] }, origin)[0]
  return spec ? pieceLevels(spec, natural) : null
}

/** A block of a piece's 3D shape at RLs, in the plan frame. */
export interface PieceSolid {
  pts: Vec2[]
  z0: number
  z1: number
}

/**
 * A grounded piece's 3D shape at its real levels, and a pool's water: a pool's shell walls from its
 * floor up to its coping, a tank standing on its floor or its base.
 */
export function pieceShape(f: Furniture, lv: PieceLevels): { solids: PieceSolid[]; water: { pts: Vec2[]; z: number } | null } {
  const floor = lv.sits === 'in' ? lv.floor : lv.base
  if (f.kind !== 'pool') return { solids: furnitureSolids(f).map(s => ({ pts: s.pts, z0: floor + s.z0, z1: floor + s.z1 })), water: null }
  const top = lv.sits === 'in' ? lv.top : lv.base + pieceDepth(f)
  // The catalogue's pool is its coping ring and a thin floor: the ring goes down to the floor.
  const solids = furnitureSolids(f).map(s => (s.z1 >= f.height - 1e-9 && s.z1 > 0.02 ? { pts: s.pts, z0: floor, z1: top } : { pts: s.pts, z0: floor, z1: floor + s.z1 }))
  const c = Math.min(0.3, f.width / 6, f.depth / 6)
  const w = f.width / 2 - c
  const d = f.depth / 2 - c
  const inner: Vec2[] = (
    [
      [-w, -d],
      [w, -d],
      [w, d],
      [-w, d],
    ] as Vec2[]
  ).map(p => furnitureToPlan(f, p))
  return { solids, water: top - WATER_DOWN > floor ? { pts: inner, z: top - WATER_DOWN } : null }
}
