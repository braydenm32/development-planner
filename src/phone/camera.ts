// The 3D view's camera presets as plain maths: Street view, From above (north up), Rear,
// and turning north up, plus the smooth move between them and remembering the camera for
// each project. Scene units are metres: x = east, y = up, z = south (as SiteView draws).

import { ease } from './gestures'

export type Vec3 = [number, number, number]
type Vec2 = [number, number]

export type Preset = 'street' | 'above' | 'rear'
export type CameraCommand = Preset | 'north'

export interface Pose {
  position: Vec3
  target: Vec3
}

export interface Frame {
  /** What the camera looks at: the middle of the house, or of the block before there is a house. */
  target: Vec3
  /** The radius of the house (or the block) to keep in view, in metres. */
  radius: number
  /** The radius of the whole block, in metres. */
  blockRadius: number
  /** Compass bearing (degrees) from the house towards the street. */
  street: number
}

export const PRESETS: { id: Preset; label: string; long: string }[] = [
  { id: 'street', label: 'Street view', long: 'Street view' },
  { id: 'above', label: 'From above', long: 'From above, north up' },
  { id: 'rear', label: 'Rear', long: 'From the rear' },
]

/** How high Street view looks down from, above the horizon. */
export const VIEW_ELEVATION = 24
/** The rear is most often the high side, so it looks down from higher, over the bank. */
export const REAR_ELEVATION = 34

const RAD = Math.PI / 180

/** A unit step along the ground towards a compass bearing. */
export function towards(bearing: number): Vec3 {
  return [Math.sin(bearing * RAD), 0, -Math.cos(bearing * RAD)]
}

/** The camera distance that fits a sphere of `r` into the view, whichever way the screen is turned. */
export function fitDistance(r: number, fovDeg: number, aspect: number): number {
  const v = (fovDeg / 2) * RAD
  const h = Math.atan(Math.tan(v) * Math.max(aspect, 0.1))
  return r / Math.sin(Math.min(v, h))
}

/** Where a preset puts the camera. */
export function presetPose(preset: Preset, f: Frame, fovDeg: number, aspect: number): Pose {
  const t = f.target
  if (preset === 'above') {
    // Straight down, a hair south of the target, so north is at the top of the screen.
    const d = fitDistance(f.blockRadius * 1.02, fovDeg, aspect)
    return { position: [t[0], t[1] + d, t[2] + d * 1e-3], target: [...t] }
  }
  const bearing = preset === 'street' ? f.street : f.street + 180
  // The house, with enough of the block around it to read the slope.
  const r = Math.max(f.radius * 1.4, f.blockRadius * 0.45)
  const d = fitDistance(r, fovDeg, aspect)
  const dir = towards(bearing)
  const e = (preset === 'street' ? VIEW_ELEVATION : REAR_ELEVATION) * RAD
  return {
    position: [t[0] + dir[0] * d * Math.cos(e), t[1] + d * Math.sin(e), t[2] + dir[2] * d * Math.cos(e)],
    target: [...t],
  }
}

/** Spherical parts of an offset from the target: distance, angle from straight up, and azimuth (0 = looking north). */
export function toSpherical(o: Vec3): { r: number; phi: number; theta: number } {
  const r = Math.hypot(o[0], o[1], o[2])
  if (r === 0) return { r: 0, phi: 0, theta: 0 }
  return { r, phi: Math.acos(Math.min(Math.max(o[1] / r, -1), 1)), theta: Math.atan2(o[0], o[2]) }
}

export function fromSpherical(r: number, phi: number, theta: number): Vec3 {
  return [r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta)]
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

/** Turn the camera about its target so it looks north, keeping its height and distance. */
export function northUp(p: Pose): Pose {
  const s = toSpherical(sub(p.position, p.target))
  return { position: add(p.target, fromSpherical(s.r, s.phi, 0)), target: [...p.target] }
}

/** The shortest turn from angle a to angle b, in radians. */
export function shortestTurn(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return d
}

/**
 * Part of the way from one pose to another (t from 0 to 1, eased): the camera swings
 * around the target the short way and closes the distance in equal ratios, so it arcs
 * over the block instead of cutting through it.
 */
export function between(a: Pose, b: Pose, t: number): Pose {
  const e = ease(t)
  const target: Vec3 = [a.target[0] + (b.target[0] - a.target[0]) * e, a.target[1] + (b.target[1] - a.target[1]) * e, a.target[2] + (b.target[2] - a.target[2]) * e]
  const sa = toSpherical(sub(a.position, a.target))
  const sb = toSpherical(sub(b.position, b.target))
  const r = sa.r > 0 && sb.r > 0 ? sa.r * (sb.r / sa.r) ** e : sa.r + (sb.r - sa.r) * e
  const phi = sa.phi + (sb.phi - sa.phi) * e
  // Looking straight down, the azimuth only says which way is up: turn it the short way too.
  const theta = sa.theta + shortestTurn(sa.theta, sb.theta) * e
  return { position: add(target, fromSpherical(r, phi, theta)), target }
}

/** How long the move between two poses takes, in ms: longer for bigger turns, never sluggish. */
export function moveDuration(a: Pose, b: Pose): number {
  const sa = toSpherical(sub(a.position, a.target))
  const sb = toSpherical(sub(b.position, b.target))
  const turn = Math.abs(shortestTurn(sa.theta, sb.theta)) + Math.abs(sb.phi - sa.phi)
  return Math.round(Math.min(900, 450 + turn * 160))
}

// ---------------------------------------------------------------------------
// Which way the street is

export type StreetSide = 'auto' | 'N' | 'E' | 'S' | 'W'
export const STREET_SIDES: StreetSide[] = ['auto', 'N', 'E', 'S', 'W']
const SIDE_BEARING = { N: 0, E: 90, S: 180, W: 270 }

/** The bearing straight out of each side of the block, with the side's length. */
export function edgeNormals(boundary: Vec2[]): { bearing: number; length: number }[] {
  const n = boundary.length
  let area = 0
  for (let i = 0; i < n; i++) {
    const [x1, y1] = boundary[i]
    const [x2, y2] = boundary[(i + 1) % n]
    area += x1 * y2 - x2 * y1
  }
  const ccw = area > 0
  const out: { bearing: number; length: number }[] = []
  for (let i = 0; i < n; i++) {
    const [x1, y1] = boundary[i]
    const [x2, y2] = boundary[(i + 1) % n]
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.hypot(dx, dy)
    if (length < 1e-6) continue
    // Outward: to the right of the way round for an anticlockwise boundary, to the left otherwise.
    const nx = ccw ? dy : -dy
    const ny = ccw ? -dx : dx
    out.push({ bearing: ((Math.atan2(nx, ny) / RAD) % 360 + 360) % 360, length })
  }
  return out
}

/**
 * The side of the block the street is on, as the bearing straight out of that side. Until
 * the street is marked, it is taken to be the low side (where the block falls to, as most
 * blocks drain to the street), or the side picked by hand; either way it snaps to the
 * longest side that faces that way, so the view looks square across the block.
 */
export function streetBearing(boundary: Vec2[], fallBearing: number, side: StreetSide = 'auto'): number {
  const want = side === 'auto' ? fallBearing : SIDE_BEARING[side]
  let best: number | null = null
  let score = 0
  for (const e of edgeNormals(boundary)) {
    const c = Math.cos(shortestTurn(want * RAD, e.bearing * RAD))
    if (c <= 0.5) continue
    const s = e.length * c * c
    if (s > score) {
      score = s
      best = e.bearing
    }
  }
  return best ?? ((want % 360) + 360) % 360
}

/** A compass bearing in words: north, north-east, and so on. */
export function bearingWord(b: number): string {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
  return names[Math.round((((b % 360) + 360) % 360) / 45) % 8]
}

// ---------------------------------------------------------------------------
// Remembering the camera, for each project

interface Store {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

const store = (): Store | null => {
  try {
    return localStorage
  } catch {
    return null
  }
}

/** A key for the project: its survey file, which a project keeps for life. */
export function projectKey(p: { fileName: string; dxfText: string }): string {
  let h = 0
  for (let i = 0; i < p.dxfText.length; i += 97) h = (h * 31 + p.dxfText.charCodeAt(i)) | 0
  return `${p.fileName}#${p.dxfText.length}:${(h >>> 0).toString(36)}`
}

const finite3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n))
const round = (v: Vec3): Vec3 => v.map(n => Math.round(n * 1000) / 1000) as Vec3

/** A remembered camera, with the Top of view bearing it was left under. */
export interface SavedPose extends Pose {
  up?: number
}

export function loadPose(key: string, s: Store | null = store()): SavedPose | null {
  try {
    const raw = s?.getItem(`camera-v1:${key}`)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<SavedPose>
    if (!finite3(p.position) || !finite3(p.target)) return null
    return typeof p.up === 'number' && Number.isFinite(p.up) ? { position: p.position, target: p.target, up: p.up } : { position: p.position, target: p.target }
  } catch {
    return null
  }
}

export function savePose(key: string, p: Pose, up?: number, s: Store | null = store()): void {
  try {
    s?.setItem(`camera-v1:${key}`, JSON.stringify({ position: round(p.position), target: round(p.target), up }))
  } catch {
    // Storage can be full or blocked; the camera then starts at Street view next time.
  }
}

/** Forget the camera, so the project's 3D view opens at Street view again. */
export function forgetPose(key: string, s: Store | null = store()): void {
  try {
    s?.removeItem(`camera-v1:${key}`)
  } catch {
    // as above
  }
}

export function loadStreetSide(key: string, s: Store | null = store()): StreetSide {
  try {
    const v = s?.getItem(`street-side-v1:${key}`) as StreetSide | null
    return v && STREET_SIDES.includes(v) ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function saveStreetSide(key: string, side: StreetSide, s: Store | null = store()): void {
  try {
    s?.setItem(`street-side-v1:${key}`, side)
  } catch {
    // as above
  }
}
