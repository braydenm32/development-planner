// The photo's camera: where it stood, which way it faced, how it was tipped and how wide its lens
// saw, and the sums that go between a point on the model and a point in the photo. Pure, so the
// lining-up solver (./solve.ts) and the tests can use it without a screen.
//
// Scene units are metres: x = east, y = up, z = south (as in the 3D view). Angles are degrees:
// the heading is a compass bearing from the survey's north, clockwise; tilt is up positive; lean
// (roll) is the camera turned clockwise, as a photo whose horizon rises to the right was held.

import * as THREE from 'three'
import type { Aim } from './model'
export { clampFov, FOV_MAX, FOV_MIN, wrap180, wrap360, type Aim } from './model'

const D = Math.PI / 180

export interface Shot extends Aim {
  /** Where the lens was, in scene metres. */
  eye: THREE.Vector3
  /** The photo's width over its height. */
  aspect: number
}

/** A normal phone's main lens, about 65° across its long side, when the photo doesn't say. */
export const PHONE_FOV_LONG = 65

/** The camera's turn for an aim: yaw by the heading, then tilt, then lean about the line of sight. */
export function aimQuaternion(a: Pick<Aim, 'heading' | 'tilt' | 'roll'>, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.setFromEuler(new THREE.Euler(a.tilt * D, -a.heading * D, -a.roll * D, 'YXZ'))
}

/** tan of half the lens angle across the photo's width, and up its height. */
export function halfTans(s: Pick<Shot, 'fov' | 'aspect'>): { x: number; y: number } {
  const x = Math.tan((s.fov * D) / 2)
  return { x, y: x / s.aspect }
}

/** The vertical lens angle (what three.js's camera calls fov), degrees. */
export const verticalFov = (s: Pick<Shot, 'fov' | 'aspect'>): number => (2 * Math.atan(halfTans(s).y)) / D

const tmpQ = new THREE.Quaternion()
const tmpV = new THREE.Vector3()

/**
 * Where a scene point lands in the photo, as [u, v] from its top-left (0..1 across and down; outside
 * that range is off the photo), or null when it is behind the camera.
 */
export function project(s: Shot, p: THREE.Vector3): [number, number] | null {
  aimQuaternion(s, tmpQ).invert()
  const c = tmpV.copy(p).sub(s.eye).applyQuaternion(tmpQ)
  if (c.z > -1e-6) return null
  const t = halfTans(s)
  const x = c.x / -c.z / t.x
  const y = c.y / -c.z / t.y
  return [(x + 1) / 2, (1 - y) / 2]
}

/** The direction (unit, scene) of the ray through a point [u, v] of the photo. */
export function rayThrough(s: Shot, u: number, v: number): THREE.Vector3 {
  const t = halfTans(s)
  const d = new THREE.Vector3((u * 2 - 1) * t.x, (1 - v * 2) * t.y, -1)
  return d.applyQuaternion(aimQuaternion(s)).normalize()
}

/** The compass bearing (degrees, 0..360) and the angle above level of a direction in the scene. */
export function bearingOf(d: THREE.Vector3): { bearing: number; elevation: number } {
  const bearing = ((Math.atan2(d.x, -d.z) / D) % 360 + 360) % 360
  return { bearing, elevation: Math.atan2(d.y, Math.hypot(d.x, d.z)) / D }
}

/** The lens angle across a photo `w` × `h` px from its 35 mm-equivalent focal length (which is by the frame's diagonal). */
export function fovFromFocal35(focal35: number, w: number, h: number): number {
  const tanHalfDiag = Math.hypot(36, 24) / 2 / focal35
  return (2 * Math.atan((tanHalfDiag * w) / Math.hypot(w, h))) / D
}

/** A normal phone lens's angle across a photo `w` × `h` px: PHONE_FOV_LONG across its long side. */
export function phoneFov(w: number, h: number): number {
  const tanLong = Math.tan((PHONE_FOV_LONG * D) / 2)
  return (2 * Math.atan((tanLong * w) / Math.max(w, h))) / D
}
