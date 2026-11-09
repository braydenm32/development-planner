// Where the ground is dug and where it is filled, as outlines for the plan (src/costs/PlanHighlight.tsx).

import type { Heightfield } from '../lib/terrain'

/** Where the finished ground is this far below or above the natural ground, it counts as dug or filled (m). */
const DUG = 0.02

const cache = new WeakMap<Heightfield, { cut: string; fill: string }>()

/**
 * Where the ground is cut and where it is filled, as path data in grid units (a node per unit,
 * each a unit square, joined along rows). Worked out once per earthworks result.
 */
export function cutFillPaths(natural: Heightfield, finished: Heightfield): { cut: string; fill: string } {
  const hit = cache.get(finished)
  if (hit) return hit
  const same = natural.nx === finished.nx && natural.ny === finished.ny && natural.x0 === finished.x0 && natural.y0 === finished.y0 && natural.cell === finished.cell
  const nat = (i: number, j: number) => (same ? natural.at(i, j) : natural.sample(finished.x0 + i * finished.cell, finished.y0 + j * finished.cell))
  const out = { cut: '', fill: '' }
  for (let j = 0; j < finished.ny; j++) {
    let run: 'cut' | 'fill' | null = null
    let start = 0
    const close = (i: number) => {
      if (run) out[run] += `M${start - 0.5} ${j - 0.5}h${i - start}v1h${start - i}z`
    }
    for (let i = 0; i <= finished.nx; i++) {
      let kind: 'cut' | 'fill' | null = null
      if (i < finished.nx) {
        const d = finished.at(i, j) - nat(i, j)
        kind = d < -DUG ? 'cut' : d > DUG ? 'fill' : null
      }
      if (kind !== run) {
        close(i)
        run = kind
        start = i
      }
    }
  }
  cache.set(finished, out)
  return out
}
