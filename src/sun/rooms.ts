// Winter sun on a living area's windows. For each window to the outside, a few points just
// outside the glass are tested every quarter hour from 9 am to 3 pm: is the sun in front of the
// window, and does a straight line to it clear the house (walls, upper floors, eaves) and the
// ground? A window counts as sunny when at least half its points are. That leaves out trees,
// fences and the neighbours' houses, which the app doesn't know, and glass doors, which the plan
// doesn't mark as glass.

import { pointInPolygon, type Vec2 } from '../lib/geom'
import { faceAround, planarFaces } from '../plan/geometry'
import { floorRL, houseWalls, pointOnWall, toSite, wallDir, type Plan, type Room } from '../plan/model'
import { compassPoint } from './solar'
import type { Ground, SunRay } from './shadow'

/** Names that read as living areas when a room hasn't been ticked one way or the other. */
const LIVING_NAMES = /\b(living|lounge|family|rumpus|dining|sitting|meals|great room)\b/i

/** A living area: ticked as one, or (unticked) named like one. */
export const isLiving = (r: Pick<Room, 'living' | 'name'>) => r.living ?? LIVING_NAMES.test(r.name)

export interface RoomWindow {
  opening: string
  /** Points just outside the glass: x, y (survey frame) and RL. */
  pts: [number, number, number][]
  /** Unit vector out of the window, in the survey frame. */
  out: Vec2
}

/** The room's windows to the outside, with points to test on each. */
export function roomWindows(plan: Plan, room: Room, origin: Vec2): RoomWindow[] {
  const level = plan.levels.find(l => l.id === room.level)
  if (!level) return []
  const walls = houseWalls(plan.walls.filter(w => w.level === room.level))
  const faces = planarFaces(walls)
  const face = faceAround(room.at, faces)
  if (!face) return []
  const inRoom = (p: Vec2) => pointInPolygon(p[0], p[1], face.pts)
  const outside = (p: Vec2) => !faces.some(f => f.area > 0 && pointInPolygon(p[0], p[1], f.pts))
  const floor = floorRL(plan, room.level)
  const t = (plan.placement.rotation * Math.PI) / 180
  const out: RoomWindow[] = []
  for (const o of plan.openings) {
    if (o.kind !== 'window') continue
    const w = walls.find(x => x.id === o.wall)
    if (!w) continue
    const d = wallDir(w)
    const left: Vec2 = [-d[1], d[0]]
    const c = pointOnWall(w, o.offset)
    const e = w.thickness / 2 + 0.05
    const pl: Vec2 = [c[0] + left[0] * e, c[1] + left[1] * e]
    const pr: Vec2 = [c[0] - left[0] * e, c[1] - left[1] * e]
    const sign = inRoom(pl) && outside(pr) ? -1 : inRoom(pr) && outside(pl) ? 1 : 0
    if (!sign) continue
    const n: Vec2 = [left[0] * sign, left[1] * sign]
    const pts: [number, number, number][] = []
    const top = Math.min(o.sill + o.height, level.height)
    for (const along of [-1 / 3, 0, 1 / 3]) {
      const q = pointOnWall(w, o.offset + along * o.width)
      const p = toSite([q[0] + n[0] * (w.thickness / 2 + 0.03), q[1] + n[1] * (w.thickness / 2 + 0.03)], plan.placement, origin)
      for (const up of [0.25, 0.75]) pts.push([p[0], p[1], floor + o.sill + (top - o.sill) * up])
    }
    out.push({ opening: o.id, pts, out: [n[0] * Math.cos(t) - n[1] * Math.sin(t), n[0] * Math.sin(t) + n[1] * Math.cos(t)] })
  }
  return out
}

/** Sun more than this far round from square-on only grazes the glass (degrees). */
const GRAZING = 80

/** Möller–Trumbore: does the ray from o along d hit the triangle (nine numbers at k) in front of o? */
function hits(tris: Float64Array, k: number, o: [number, number, number], d: [number, number, number]): boolean {
  const ax = tris[k]
  const ay = tris[k + 1]
  const az = tris[k + 2]
  const e1x = tris[k + 3] - ax
  const e1y = tris[k + 4] - ay
  const e1z = tris[k + 5] - az
  const e2x = tris[k + 6] - ax
  const e2y = tris[k + 7] - ay
  const e2z = tris[k + 8] - az
  const px = d[1] * e2z - d[2] * e2y
  const py = d[2] * e2x - d[0] * e2z
  const pz = d[0] * e2y - d[1] * e2x
  const det = e1x * px + e1y * py + e1z * pz
  if (Math.abs(det) < 1e-12) return false
  const inv = 1 / det
  const tx = o[0] - ax
  const ty = o[1] - ay
  const tz = o[2] - az
  const u = (tx * px + ty * py + tz * pz) * inv
  if (u < 0 || u > 1) return false
  const qx = ty * e1z - tz * e1y
  const qy = tz * e1x - tx * e1z
  const qz = tx * e1y - ty * e1x
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv
  if (v < 0 || u + v > 1) return false
  return (e2x * qx + e2y * qy + e2z * qz) * inv > 1e-4
}

/** Does a straight line from p towards the sun clear the house and the ground? */
export function seesSun(p: [number, number, number], ray: SunRay, tris: Float64Array, ground: Ground, top: number): boolean {
  const d: [number, number, number] = [ray.dx, ray.dy, ray.tanE]
  for (let k = 0; k + 8 < tris.length; k += 9) if (hits(tris, k, p, d)) return false
  // The ground in front: walk out until the line is above anything there could be.
  for (let s = 0.5; s < 300; s += 0.5) {
    const z = p[2] + s * ray.tanE
    if (z > top) break
    if (ground.sample(p[0] + s * ray.dx, p[1] + s * ray.dy) > z) return false
  }
  return true
}

/** Is the window sunny with the sun on this ray: in front of it, and on half its points or more? */
export function windowSunny(w: RoomWindow, ray: SunRay, tris: Float64Array, ground: Ground, top: number): boolean {
  if (w.out[0] * ray.dx + w.out[1] * ray.dy < Math.cos((GRAZING * Math.PI) / 180)) return false
  let lit = 0
  for (const p of w.pts) if (seesSun(p, ray, tris, ground, top)) lit++
  return lit * 2 >= w.pts.length
}

export interface RoomSun {
  room: string
  name: string
  level: string
  /** Each window to the outside: which way it faces and its hours of sun. */
  windows: { opening: string; facing: string; hours: number }[]
  /** Hours from 9 am to 3 pm when at least one window has sun on half its glass or more. */
  hours: number
}

/** Each window's facing, as a compass point, given the true north offset (grid bearing less true bearing). */
export function facingOf(out: Vec2, trueNorth: number): string {
  return compassPoint((Math.atan2(out[0], out[1]) * 180) / Math.PI - trueNorth)
}
