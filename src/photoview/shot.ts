// A saved view as a camera in the 3D scene: the spot on the survey grid to scene metres, and the
// eye's height above the ground there, or above a level's floor (a deck or a window). Pure.

import * as THREE from 'three'
import type { Vec2 } from '../lib/geom'
import { floorRL, levelById, type Plan } from '../plan/model'
import type { Shot } from './camera'
import type { PhotoView } from './model'
import type { PhotoRect } from './store'

export interface SceneFrame {
  plan: Plan | null
  /** The survey's origin: local = grid − origin. */
  origin: Vec2
  /** The natural ground's RL at a local point (a photo is taken on the ground as it is now). */
  groundRL: (p: Vec2) => number
  refZ: number
  exag: number
}

/** The spot in the survey's local frame. */
export const localSpot = (v: Pick<PhotoView, 'at'>, origin: Vec2): Vec2 | null => (v.at ? [v.at[0] - origin[0], v.at[1] - origin[1]] : null)

/** What the eye's height is measured from: the ground at the spot, or the floor of a level the plan still has. */
export function baseRL(v: Pick<PhotoView, 'at' | 'level'>, f: SceneFrame): number | null {
  const p = localSpot(v, f.origin)
  if (!p) return null
  if (v.level && f.plan && levelById(f.plan, v.level)) return floorRL(f.plan, v.level)
  return f.groundRL(p)
}

/** The camera for a view; null until its spot is set. */
export function shotOf(v: PhotoView, f: SceneFrame): Shot | null {
  const p = localSpot(v, f.origin)
  const base = baseRL(v, f)
  if (!p || base === null || !Number.isFinite(base)) return null
  const eye = new THREE.Vector3(p[0], (base + v.eyeHeight - f.refZ) * f.exag, -p[1])
  return { eye, heading: v.heading, tilt: v.tilt, roll: v.roll, fov: v.fov, aspect: v.width / v.height }
}

/** The layer only the photo view's camera sees. */
export const PHOTO_LAYER = 1

/** The gap kept round the photo on the canvas (px). */
const MARGIN = 12

/** The photo's place on a canvas `w` × `h`, inside what the panels leave free, as large as it fits. */
export function photoRect(w: number, h: number, aspect: number, free: { l: number; r: number; t: number; b: number }): PhotoRect {
  const fw = Math.max(80, w - free.l - free.r - 2 * MARGIN)
  const fh = Math.max(60, h - free.t - free.b - 2 * MARGIN)
  const width = Math.min(fw, fh * aspect)
  const height = width / aspect
  return { left: free.l + MARGIN + (fw - width) / 2, top: free.t + MARGIN + (fh - height) / 2, width, height }
}
