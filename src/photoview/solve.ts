// Lining the model up from known points: the person clicks a point in the photo, then the same
// point on the model (a boundary corner, a survey mark, a wall corner). From one pair the camera's
// direction and tilt follow; from two, the lens angle or the lean as well; from three or more, all
// four, by least squares. The spot and the height stay as they were set: they are what the person
// knows best, and the photo alone can't tell a nearer, wider shot from a further, narrower one.

import * as THREE from 'three'
import { bearingOf, clampFov, FOV_MAX, FOV_MIN, project, rayThrough, wrap180, wrap360, type Aim, type Shot } from './camera'

export interface PointPair {
  /** Where in the photo: [u, v] from its top-left, 0..1. */
  photo: [number, number]
  /** The same point on the model, scene metres. */
  model: THREE.Vector3
}

export type AimPart = keyof Aim

export interface Solved {
  aim: Aim
  /** How far the points land from where they were clicked, at worst, in photo pixels (its width `px`). */
  worstPx: number
  /** Why it couldn't be used, in plain words; null when it's good. */
  problem: string | null
}

/** What can be worked out from this many pairs, with `extra` the one asked for when there are two. */
export function partsFor(pairs: number, extra: 'fov' | 'roll'): AimPart[] {
  if (pairs <= 0) return []
  if (pairs === 1) return ['heading', 'tilt']
  if (pairs === 2) return ['heading', 'tilt', extra]
  return ['heading', 'tilt', 'fov', 'roll']
}

/** Photo-pixel misses of each pair for a shot, [du, dv] each; a point behind the camera counts as far off. */
function misses(s: Shot, pairs: PointPair[], w: number, h: number): number[] {
  const out: number[] = []
  for (const p of pairs) {
    const at = project(s, p.model)
    if (!at) out.push(w, h)
    else out.push((at[0] - p.photo[0]) * w, (at[1] - p.photo[1]) * h)
  }
  return out
}

const sumSq = (r: number[]) => r.reduce((a, x) => a + x * x, 0)

/** Solve the small square system A x = b (Gaussian elimination with pivoting); null when it is singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

function withParts(base: Shot, parts: AimPart[], x: number[]): Shot {
  const s = { ...base }
  parts.forEach((k, i) => (s[k] = x[i]))
  s.fov = clampFov(s.fov)
  s.tilt = Math.max(-85, Math.min(85, s.tilt))
  return s
}

/** Levenberg–Marquardt on the chosen parts of the aim, from a start; returns the best shot found. */
function refine(start: Shot, parts: AimPart[], pairs: PointPair[], w: number, h: number): Shot {
  let x = parts.map(k => start[k])
  let shot = withParts(start, parts, x)
  let r = misses(shot, pairs, w, h)
  let cost = sumSq(r)
  let lambda = 1e-3
  for (let it = 0; it < 100 && cost > 1e-10; it++) {
    // Numerical Jacobian: a small step in each part.
    const J: number[][] = r.map(() => [])
    parts.forEach((_, j) => {
      const step = 1e-4
      const xs = [...x]
      xs[j] += step
      const rj = misses(withParts(start, parts, xs), pairs, w, h)
      rj.forEach((v, i) => (J[i][j] = (v - r[i]) / step))
    })
    const n = parts.length
    const JtJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0)))
    const Jtr = Array.from({ length: n }, (_, a) => J.reduce((s, row, i) => s + row[a] * r[i], 0))
    let improved = false
    for (let tries = 0; tries < 10 && !improved; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-9 : v)))
      const dx = solveLinear(A, Jtr.map(v => -v))
      if (!dx) {
        lambda *= 10
        continue
      }
      const nx = x.map((v, i) => v + dx[i])
      const ns = withParts(start, parts, nx)
      const nr = misses(ns, pairs, w, h)
      const nc = sumSq(nr)
      if (nc < cost) {
        x = parts.map(k => ns[k])
        shot = ns
        r = nr
        const gain = cost - nc
        cost = nc
        lambda = Math.max(lambda / 10, 1e-9)
        improved = true
        if (gain < 1e-12) return shot
      } else lambda *= 10
    }
    if (!improved) break
  }
  return shot
}

/**
 * The aim that puts each model point on its photo point, changing only `parts`, starting from the
 * shot as it is. `w` and `h` are the photo's size in pixels, for the misses.
 */
export function solveAim(shot: Shot, pairs: PointPair[], parts: AimPart[], w: number, h: number): Solved {
  const keep: Aim = { heading: shot.heading, tilt: shot.tilt, roll: shot.roll, fov: shot.fov }
  if (!pairs.length || !parts.length) return { aim: keep, worstPx: 0, problem: 'Pick a point in the photo, then the same point on the model.' }
  for (const p of pairs) {
    if (p.model.distanceTo(shot.eye) < 0.3) return { aim: keep, worstPx: 0, problem: 'That point on the model is where the photo was taken from. Pick one further away.' }
  }
  if (pairs.length >= 2) {
    const [a, b] = pairs
    if (Math.hypot((a.photo[0] - b.photo[0]) * w, (a.photo[1] - b.photo[1]) * h) < Math.min(w, h) * 0.05)
      return { aim: keep, worstPx: 0, problem: 'Those two points are too close together in the photo. Pick two further apart.' }
  }

  // A good start, so the solver doesn't settle on a wrong turn: aim the first pair's photo point at
  // its model point, with the lens and lean as they are, then try a few turns either side.
  const p0 = pairs[0]
  const want = bearingOf(p0.model.clone().sub(shot.eye))
  const level = { ...shot, heading: 0, tilt: 0 }
  const off = bearingOf(rayThrough(level, p0.photo[0], p0.photo[1]))
  const first: Shot = {
    ...shot,
    heading: parts.includes('heading') ? wrap360(want.bearing - off.bearing) : shot.heading,
    tilt: parts.includes('tilt') ? Math.max(-85, Math.min(85, want.elevation - off.elevation)) : shot.tilt,
  }
  const starts = [first, shot, ...[-20, 20].map(d => ({ ...first, heading: wrap360(first.heading + d) }))]
  let best: Shot | null = null
  let bestCost = Infinity
  for (const s of starts) {
    const got = refine(s, parts, pairs, w, h)
    const c = sumSq(misses(got, pairs, w, h))
    if (c < bestCost) {
      best = got
      bestCost = c
    }
  }
  const got = best ?? shot
  const r = misses(got, pairs, w, h)
  let worstPx = 0
  for (let i = 0; i < r.length; i += 2) worstPx = Math.max(worstPx, Math.hypot(r[i], r[i + 1]))
  const aim: Aim = { heading: wrap360(got.heading), tilt: got.tilt, roll: wrap180(got.roll), fov: got.fov }
  if (parts.includes('fov') && (aim.fov <= FOV_MIN + 0.01 || aim.fov >= FOV_MAX - 0.01))
    return { aim: keep, worstPx, problem: 'The points don’t agree on a lens angle. Check that each pair is the same point, and that the spot and height are right.' }
  // More than a twentieth of the photo off: the pairs can't all be right from this spot.
  if (worstPx > Math.max(w, h) * 0.05)
    return { aim, worstPx, problem: 'The points can’t all be lined up from this spot. Check each pair, and where the photo was taken from and how high.' }
  return { aim, worstPx, problem: null }
}
