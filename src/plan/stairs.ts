import { pointInPolygon, type Vec2 } from '../lib/geom'
import { MAX_RISER, type Stair } from './model'

/** A tread or landing: a solid block from the bottom of the stair up to `top`. */
export interface StairStep {
  pts: Vec2[]
  /** Height of the step's top above the bottom of the stair. */
  top: number
}

export interface StairLayout {
  risers: number
  /** Height of each riser (m). */
  riser: number
  /** Number of treads, not counting a landing. */
  treads: number
  /** L and U stairs have a landing between the flights. */
  landing: boolean
  steps: StairStep[]
  /** Footprint of the whole stair. */
  outline: Vec2[]
  /** Front edges of the treads, for the plan symbol. */
  treadLines: [Vec2, Vec2][]
  /** Walking line from the bottom step to the top. */
  walk: Vec2[]
}

export function riserCount(rise: number): number {
  return Math.max(2, Math.ceil(rise / MAX_RISER - 1e-9))
}

export function stairLayout(s: Stair): StairLayout {
  const n = riserCount(s.rise)
  const r = s.rise / n
  const g = s.going
  const W = s.width
  const t = (s.angle * Math.PI) / 180
  const u: Vec2 = [Math.cos(t), Math.sin(t)]
  const side = s.turn === 'right' ? -1 : 1
  const v: Vec2 = [-u[1] * side, u[0] * side]
  // Local (along, across) -> plan
  const P = (a: number, b: number): Vec2 => [s.at[0] + u[0] * a + v[0] * b, s.at[1] + u[1] * a + v[1] * b]
  const rect = (a0: number, a1: number, b0: number, b1: number): Vec2[] => [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)]

  const steps: StairStep[] = []
  const treadLines: [Vec2, Vec2][] = []
  let outline: Vec2[]
  let walk: Vec2[]

  if (s.shape === 'straight') {
    for (let k = 1; k < n; k++) steps.push({ pts: rect((k - 1) * g, k * g, -W / 2, W / 2), top: k * r })
    for (let k = 0; k < n; k++) treadLines.push([P(k * g, -W / 2), P(k * g, W / 2)])
    const L = (n - 1) * g
    outline = rect(0, L, -W / 2, W / 2)
    walk = [P(0, 0), P(L, 0)]
  } else {
    const n1 = Math.ceil(n / 2)
    const n2 = n - n1
    const L1 = (n1 - 1) * g
    for (let k = 1; k < n1; k++) steps.push({ pts: rect((k - 1) * g, k * g, -W / 2, W / 2), top: k * r })
    for (let k = 0; k < n1; k++) treadLines.push([P(k * g, -W / 2), P(k * g, W / 2)])
    if (s.shape === 'l') {
      steps.push({ pts: rect(L1, L1 + W, -W / 2, W / 2), top: n1 * r })
      for (let j = 1; j < n2; j++) {
        steps.push({ pts: rect(L1, L1 + W, W / 2 + (j - 1) * g, W / 2 + j * g), top: (n1 + j) * r })
      }
      for (let j = 0; j < n2; j++) treadLines.push([P(L1, W / 2 + j * g), P(L1 + W, W / 2 + j * g)])
      const end = W / 2 + (n2 - 1) * g
      outline = [P(0, -W / 2), P(L1 + W, -W / 2), P(L1 + W, end), P(L1, end), P(L1, W / 2), P(0, W / 2)]
      walk = [P(0, 0), P(L1 + W / 2, 0), P(L1 + W / 2, end)]
    } else {
      steps.push({ pts: rect(L1, L1 + W, -W / 2, (3 * W) / 2), top: n1 * r })
      for (let j = 1; j < n2; j++) {
        steps.push({ pts: rect(L1 - j * g, L1 - (j - 1) * g, W / 2, (3 * W) / 2), top: (n1 + j) * r })
      }
      for (let j = 0; j < n2; j++) treadLines.push([P(L1 - j * g, W / 2), P(L1 - j * g, (3 * W) / 2)])
      const end = L1 - (n2 - 1) * g
      outline = [P(0, -W / 2), P(L1 + W, -W / 2), P(L1 + W, (3 * W) / 2), P(end, (3 * W) / 2), P(end, W / 2), P(0, W / 2)]
      walk = [P(0, 0), P(L1 + W / 2, 0), P(L1 + W / 2, W), P(end, W)]
    }
  }
  // drop repeated corners (e.g. a U stair with equal flights)
  outline = outline.filter((p, i) => {
    const q = outline[(i + 1) % outline.length]
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6
  })
  // Counter-clockwise, whichever way the stair turns.
  if (side < 0) outline.reverse()
  // One step fewer than risers; on an L or U stair one of those steps is the landing.
  const landing = s.shape !== 'straight'
  return { risers: n, riser: r, treads: n - 1 - (landing ? 1 : 0), landing, steps, outline, treadLines, walk }
}

/** Millimetres to 0.1 mm, without a trailing ".0": 187.5, 190. */
const mm1 = (m: number) => String(Math.round(m * 10000) / 10)

/**
 * What the stair panel shows: risers as "16 × 187.5 mm" (to 0.1 mm, so they add up to the rise
 * and to 2R + G), treads as "14 × 250 mm + landing" (the going in whole mm, as its box shows it).
 */
export function stairCounts(s: Stair): { risers: string; treads: string } {
  const L = stairLayout(s)
  return {
    risers: `${L.risers} × ${mm1(L.riser)} mm`,
    treads: `${L.treads} × ${Math.round(s.going * 1000)} mm${L.landing ? ' + landing' : ''}`,
  }
}

export function stairContains(s: Stair, p: Vec2): boolean {
  return pointInPolygon(p[0], p[1], stairLayout(s).outline)
}

/** The 2R + G rule of thumb for a comfortable stair, in metres. */
export function stairComfort(s: Stair): { value: number; ok: boolean } {
  const r = s.rise / riserCount(s.rise)
  const value = 2 * r + s.going
  return { value, ok: value >= 0.55 && value <= 0.7 }
}
