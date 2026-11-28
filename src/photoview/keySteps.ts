// The photo view's fine steps, from the keys and the panel's − and + buttons.

import { clampFov, wrap180, wrap360, type PhotoView } from './model'

/** Fine steps: degrees for the aim and the lens, metres for the spot and the height. */
export const STEP_DEG = 0.5
export const STEP_M = 0.1

/** A key's fine step: arrows move the spot (up is forward), Q and E turn, R and F tilt, [ and ] lean, + and − the lens. */
export function keyPatch(key: string, v: PhotoView): Partial<PhotoView> | null {
  const h = (v.heading * Math.PI) / 180
  const move = (fwd: number, side: number): Partial<PhotoView> =>
    v.at ? { at: [v.at[0] + Math.sin(h) * fwd + Math.cos(h) * side, v.at[1] + Math.cos(h) * fwd - Math.sin(h) * side], guessed: false } : {}
  const k = key.length === 1 ? key.toLowerCase() : key
  if (k === 'ArrowUp') return move(STEP_M, 0)
  if (k === 'ArrowDown') return move(-STEP_M, 0)
  if (k === 'ArrowLeft') return move(0, -STEP_M)
  if (k === 'ArrowRight') return move(0, STEP_M)
  if (k === 'q') return { heading: wrap360(v.heading - STEP_DEG) }
  if (k === 'e') return { heading: wrap360(v.heading + STEP_DEG) }
  if (k === 'r') return { tilt: Math.min(85, v.tilt + STEP_DEG) }
  if (k === 'f') return { tilt: Math.max(-85, v.tilt - STEP_DEG) }
  if (k === '[') return { roll: wrap180(v.roll - STEP_DEG) }
  if (k === ']') return { roll: wrap180(v.roll + STEP_DEG) }
  if (k === '+' || k === '=') return { fov: clampFov(v.fov - STEP_DEG), lens: 'set' }
  if (k === '-' || k === '_') return { fov: clampFov(v.fov + STEP_DEG), lens: 'set' }
  return null
}
