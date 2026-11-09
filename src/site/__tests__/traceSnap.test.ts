// Tracing help: an easement's corners snap onto the boundary line, and a feature traced wholly
// off the block is caught. A made-up 20 × 30 m block.

import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { snapToEdges, touchesBlock } from '../traceSnap'

const block: Vec2[] = [
  [0, 0],
  [20, 0],
  [20, 30],
  [0, 30],
]

describe('snapping onto the boundary', () => {
  it('lands on the nearest side, anywhere along it', () => {
    expect(snapToEdges([7.3, 0.4], block, 0.5)).toEqual([7.3, 0])
    expect(snapToEdges([20.3, 12], block, 0.5)).toEqual([20, 12])
  })

  it('leaves a point too far from any side', () => {
    expect(snapToEdges([10, 15], block, 0.5)).toBeNull()
    expect(snapToEdges([25, 15], block, 0.5)).toBeNull()
  })
})

describe('whether a feature reaches the block', () => {
  it('does for one inside it, on its boundary, or across it', () => {
    expect(touchesBlock([[5, 5]], false, block)).toBe(true)
    expect(touchesBlock([[20, 10]], false, block)).toBe(true)
    // A sewer line from outside to inside.
    expect(touchesBlock([[-5, 10], [5, 10]], false, block)).toBe(true)
    // An easement along the back, its corners on the boundary.
    expect(touchesBlock([[0, 28], [20, 28], [20, 30], [0, 30]], true, block)).toBe(true)
    // An outline round the whole block.
    expect(touchesBlock([[-1, -1], [21, -1], [21, 31], [-1, 31]], true, block)).toBe(true)
  })

  it('does not for one wholly off it', () => {
    expect(touchesBlock([[30, 10]], false, block)).toBe(false)
    expect(touchesBlock([[25, 0], [30, 5]], false, block)).toBe(false)
    expect(touchesBlock([[25, 5], [30, 5], [30, 10], [25, 10]], true, block)).toBe(false)
  })
})
