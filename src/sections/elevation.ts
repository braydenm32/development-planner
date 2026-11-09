// An elevation: the house seen square-on from one of its four sides, each named by the compass
// direction it faces most nearly. Pure geometry in metres: the walls' outside faces per floor
// (levelOutlines), their windows and doors, the roof's faces from roofGeometry's mesh, the
// natural and finished ground along the face, and the house's highest point above the natural
// ground as the checks measure it (houseHeight).

import { houseHeight } from '../checks/measure'
import { pointInPolygon, type Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import { levelOutlines, roofGeometry, type RoofMesh } from '../plan/roof'
import {
  FLOOR_STRUCTURE,
  floorRL,
  houseWalls,
  levelById,
  pointOnWall,
  sortedLevels,
  toSite,
  wallDir,
  type OpeningKind,
  type Plan,
} from '../plan/model'
import { compassWord, postStations, stations, type Box, type DrawingInput, type LevelMark, type Pt } from './common'
import { roofEavesRL } from '../plan/roofline'

export type Side = 'north' | 'east' | 'south' | 'west'
export const SIDES: Side[] = ['north', 'east', 'south', 'west']

/** Something on an elevation, drawn far to near so the nearer hides what is behind it. */
export type ElevationShape =
  | { kind: 'wall'; depth: number; pts: Pt[]; openings: { kind: OpeningKind; box: Box }[] }
  | { kind: 'roof'; depth: number; tris: Pt[][]; edges: [Pt, Pt][] }

export interface ElevationDrawing {
  kind: 'elevation'
  id: Side
  side: Side
  title: string
  /** Across the drawing (m): from s0 on the left to s1 on the right. */
  s0: number
  s1: number
  shapes: ElevationShape[]
  /** Piers and posts seen under the floors. */
  piers: Box[]
  /** The ground along the face, inside the block: as surveyed, and after cut and fill. */
  natural: Pt[][]
  finished: Pt[][]
  /** The house's highest point above the natural ground (houseHeight), and where it is. */
  height: { s: number; top: number; ground: number; value: number } | null
  levels: LevelMark[]
  /** Which way each side of the drawing points, in words: [left, right]. */
  ends: [string, string]
  /** The house has walls to draw. */
  any: boolean
  zMin: number
  zMax: number
}

/** How far the ground runs past the house each side (m). */
const GROUND_PAST = 3
const POST_W = 0.1

/**
 * The four sides of the house, square to its own axes, with the compass direction each faces.
 * Each name goes to one side even when the house sits at 45°.
 */
export function elevationSides(plan: Pick<Plan, 'placement'>): { side: Side; out: Vec2 }[] {
  const t = (plan.placement.rotation * Math.PI) / 180
  // The house's +x axis on the site, as a bearing; each quarter turn anticlockwise takes 90° off it.
  const bearing = ((Math.atan2(Math.cos(t), Math.sin(t)) * 180) / Math.PI + 360) % 360
  const first = Math.round(bearing / 90)
  const outs: Vec2[] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ]
  return outs.map((out, k) => ({ side: SIDES[(((first - k) % 4) + 4) % 4], out }))
}

/** The house's highest point above the natural ground, where houseHeight (in the checks) finds it: a roof's corner or the top of a wall. */
export function highestPoint(plan: Plan, origin: Vec2, natural: Heightfield): { p: Vec2; top: number; ground: number } | null {
  let best: { p: Vec2; top: number; ground: number } | null = null
  const consider = (p: Vec2, top: number) => {
    const s = toSite(p, plan.placement, origin)
    const ground = natural.sample(s[0], s[1])
    if (!best || top - ground > best.top - best.ground) best = { p, top, ground }
  }
  for (const r of plan.roofs) {
    const level = levelById(plan, r.level)
    const g = roofGeometry(r)
    if (g.error) continue
    if (!level) continue
    const base = roofEavesRL(plan, r)
    for (let i = 0; i < g.mesh.pos.length; i += 3) consider([g.mesh.pos[i], g.mesh.pos[i + 1]], base + g.mesh.pos[i + 2])
  }
  for (const w of houseWalls(plan.walls)) {
    const level = levelById(plan, w.level)
    if (!level) continue
    const top = floorRL(plan, w.level) + level.height
    for (const p of [w.a, w.b]) consider(p, top)
  }
  return best
}

/** A roof mesh's faces, one group per plane, with the edges round each group (not the triangles' own seams). */
function roofFaces(mesh: RoofMesh): { normal: [number, number, number]; tris: number[][]; edges: [number, number][] }[] {
  const P = mesh.pos
  const groups = new Map<string, { normal: [number, number, number]; tris: number[][] }>()
  for (let i = 0; i < mesh.tris.length; i += 3) {
    const tri = [mesh.tris[i], mesh.tris[i + 1], mesh.tris[i + 2]]
    const [a, b, c] = tri.map(k => [P[3 * k], P[3 * k + 1], P[3 * k + 2]])
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const l = Math.hypot(n[0], n[1], n[2])
    if (l < 1e-12) continue
    const normal: [number, number, number] = [n[0] / l, n[1] / l, n[2] / l]
    const off = normal[0] * a[0] + normal[1] * a[1] + normal[2] * a[2]
    const key = [...normal, off].map(x => Math.round(x * 1e3)).join(',')
    const g = groups.get(key)
    if (g) g.tris.push(tri)
    else groups.set(key, { normal, tris: [tri] })
  }
  // Corners repeat in the mesh with their own indices, so edges are matched by position.
  const pkey = (k: number) => `${Math.round(P[3 * k] * 1e4)},${Math.round(P[3 * k + 1] * 1e4)},${Math.round(P[3 * k + 2] * 1e4)}`
  return [...groups.values()].map(g => {
    const count = new Map<string, { n: number; e: [number, number] }>()
    for (const tri of g.tris)
      for (let e = 0; e < 3; e++) {
        const p = tri[e]
        const q = tri[(e + 1) % 3]
        const [kp, kq] = [pkey(p), pkey(q)]
        const key = kp < kq ? `${kp}|${kq}` : `${kq}|${kp}`
        const hit = count.get(key)
        if (hit) hit.n++
        else count.set(key, { n: 1, e: [p, q] })
      }
    return { ...g, edges: [...count.values()].filter(x => x.n === 1).map(x => x.e) }
  })
}

/** An elevation of the house from one side. */
export function elevationDrawing(side: Side, input: DrawingInput): ElevationDrawing {
  const { plan, survey, terrain } = input
  const natural = terrain.grid
  const finished = input.finished ?? natural
  const out = elevationSides(plan).find(x => x.side === side)!.out
  // Looking at the side, in along `look`; `right` is to the right on the drawing.
  const look: Vec2 = [-out[0], -out[1]]
  const right: Vec2 = [look[1], -look[0]]
  const U = (p: Vec2) => p[0] * right[0] + p[1] * right[1]
  const D = (p: Vec2) => p[0] * look[0] + p[1] * look[1]
  const site = (p: Vec2) => toSite(p, plan.placement, survey.origin)
  const levels = sortedLevels(plan)
  const outlinesBy = levels.map(l => levelOutlines(houseWalls(plan.walls.filter(w => w.level === l.id))))

  const shapes: ElevationShape[] = []
  const piers: Box[] = []
  levels.forEach((level, li) => {
    const rl = floorRL(plan, level.id)
    const z0 = rl - FLOOR_STRUCTURE
    const z1 = rl + level.height
    const walls = houseWalls(plan.walls.filter(w => w.level === level.id))
    const lower = outlinesBy.slice(0, li).flat()
    for (const ring of outlinesBy[li]) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]
        const q = ring[(i + 1) % ring.length]
        const len = Math.hypot(q[0] - p[0], q[1] - p[1])
        if (len < 1e-6) continue
        const e: Vec2 = [(q[0] - p[0]) / len, (q[1] - p[1]) / len]
        const n: Vec2 = [e[1], -e[0]]
        // Only the faces turned towards us show.
        if (n[0] * out[0] + n[1] * out[1] < 1e-6) continue
        const openings: { kind: OpeningKind; box: Box }[] = []
        for (const o of plan.openings) {
          const w = walls.find(x => x.id === o.wall)
          if (!w) continue
          const d = wallDir(w)
          // The wall must run along this face, with its outside face on it.
          if (Math.abs(d[0] * e[1] - d[1] * e[0]) > 0.02) continue
          const c = pointOnWall(w, o.offset)
          const face: Vec2 = [c[0] + n[0] * (w.thickness / 2), c[1] + n[1] * (w.thickness / 2)]
          const t = (face[0] - p[0]) * e[0] + (face[1] - p[1]) * e[1]
          const off = Math.abs((face[0] - p[0]) * n[0] + (face[1] - p[1]) * n[1])
          if (off > 0.01 || t < -0.01 || t > len + 0.01) continue
          const ua = U([face[0] - d[0] * (o.width / 2), face[1] - d[1] * (o.width / 2)])
          const ub = U([face[0] + d[0] * (o.width / 2), face[1] + d[1] * (o.width / 2)])
          openings.push({ kind: o.kind, box: { s0: Math.min(ua, ub), s1: Math.max(ua, ub), z0: rl + o.sill, z1: Math.min(rl + o.sill + o.height, z1) } })
        }
        shapes.push({
          kind: 'wall',
          depth: (D(p) + D(q)) / 2,
          pts: [
            [U(p), z0],
            [U(q), z0],
            [U(q), z1],
            [U(p), z1],
          ],
          openings,
        })
        // Piers under the face where the floor stands clear of the finished ground, and no lower floor is under it.
        for (const t of postStations(0, len)) {
          const at: Vec2 = [p[0] + e[0] * t, p[1] + e[1] * t]
          const inward: Vec2 = [at[0] - n[0] * 0.15, at[1] - n[1] * 0.15]
          if (lower.some(r => pointInPolygon(inward[0], inward[1], r))) continue
          const s = site(at)
          const g = finished.sample(s[0], s[1])
          if (z0 - g > 0.15) piers.push({ s0: U(at) - POST_W / 2, s1: U(at) + POST_W / 2, z0: g, z1: z0 })
        }
      }
    }
  })

  for (const r of plan.roofs) {
    const level = levelById(plan, r.level)
    const g = roofGeometry(r)
    if (!level || g.error) continue
    const base = roofEavesRL(plan, r)
    const P = g.mesh.pos
    const at = (k: number): Pt => [U([P[3 * k], P[3 * k + 1]]), base + P[3 * k + 2]]
    for (const f of roofFaces(g.mesh)) {
      if (f.normal[0] * out[0] + f.normal[1] * out[1] < 1e-6) continue
      const depth = f.tris.reduce((t, tri) => t + tri.reduce((u, k) => u + D([P[3 * k], P[3 * k + 1]]), 0) / 3, 0) / f.tris.length
      shapes.push({ kind: 'roof', depth, tris: f.tris.map(tri => tri.map(at)), edges: f.edges.map(([p, q]) => [at(p), at(q)]) })
    }
  }
  // Far to near.
  shapes.sort((p, q) => q.depth - p.depth)

  // The extent of the house across the drawing.
  const across = [
    ...outlinesBy.flat(2).map(U),
    ...shapes.flatMap(s => (s.kind === 'wall' ? s.pts.map(p => p[0]) : s.tris.flat().map(p => p[0]))),
  ]
  const any = outlinesBy.some(o => o.length > 0)
  const u0 = across.length ? Math.min(...across) : -5
  const u1 = across.length ? Math.max(...across) : 5

  // The ground along the house's face nearest us, carried on straight past its ends.
  const base = outlinesBy.find(o => o.length) ?? []
  const us = stations(u0 - GROUND_PAST, u1 + GROUND_PAST, 0.25)
  const front = us.map(u => {
    let best = Infinity
    for (const ring of base)
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]
        const q = ring[(i + 1) % ring.length]
        const up = U(p)
        const uq = U(q)
        if (Math.abs(uq - up) < 1e-9 || u < Math.min(up, uq) - 1e-9 || u > Math.max(up, uq) + 1e-9) continue
        const t = (u - up) / (uq - up)
        best = Math.min(best, D(p) + (D(q) - D(p)) * t)
      }
    return best
  })
  const firstHit = front.findIndex(d => d < Infinity)
  const lastHit = front.length - 1 - [...front].reverse().findIndex(d => d < Infinity)
  const depths = front.map((d, i) => (d < Infinity ? d : firstHit < 0 ? 0 : i < firstHit ? front[firstHit] : front[lastHit]))
  const nat: Pt[][] = []
  const fin: Pt[][] = []
  let run: [Pt[], Pt[]] | null = null
  us.forEach((u, i) => {
    const p: Vec2 = [right[0] * u + look[0] * depths[i], right[1] * u + look[1] * depths[i]]
    const s = site(p)
    if (!pointInPolygon(s[0], s[1], survey.boundary)) {
      run = null
      return
    }
    if (!run) {
      run = [[], []]
      nat.push(run[0])
      fin.push(run[1])
    }
    run[0].push([u, natural.sample(s[0], s[1])])
    run[1].push([u, finished.sample(s[0], s[1])])
  })

  // The highest point above the natural ground: the number the checks use, where they find it.
  const hp = any || plan.roofs.length ? highestPoint(plan, survey.origin, natural) : null
  const value = hp ? houseHeight(plan, survey, terrain) : 0
  const height = hp ? { s: U(hp.p), top: hp.top, ground: hp.top - value, value } : null

  const marks: LevelMark[] = levels.flatMap((l, i) =>
    outlinesBy[i].length ? [{ rl: floorRL(plan, l.id), text: 'FFL', name: l.name, at: Math.min(...outlinesBy[i].flat().map(U)) }] : [],
  )
  const roofPts = shapes.flatMap(s => (s.kind === 'roof' ? s.tris.flat() : []))
  if (roofPts.length) {
    const peak = roofPts.reduce((p, q) => (q[1] > p[1] ? q : p))
    marks.push({ rl: peak[1], text: 'Roof', at: peak[0] })
  }

  const zs = [
    ...nat.flat().map(p => p[1]),
    ...fin.flat().map(p => p[1]),
    ...shapes.flatMap(s => (s.kind === 'wall' ? s.pts.map(p => p[1]) : s.tris.flat().map(p => p[1]))),
    ...piers.flatMap(b => [b.z0, b.z1]),
    ...(height ? [height.ground, height.top] : []),
  ]
  const rot = plan.placement.rotation
  return {
    kind: 'elevation',
    id: side,
    side,
    title: `${side[0].toUpperCase()}${side.slice(1)} elevation`,
    s0: u0 - GROUND_PAST,
    s1: u1 + GROUND_PAST,
    shapes,
    piers,
    natural: nat,
    finished: fin,
    height,
    levels: marks,
    ends: [compassWord([-right[0], -right[1]], rot), compassWord(right, rot)],
    any,
    zMin: zs.length ? Math.min(...zs) : floorRL(plan) - 1,
    zMax: zs.length ? Math.max(...zs) : floorRL(plan) + 3,
  }
}
