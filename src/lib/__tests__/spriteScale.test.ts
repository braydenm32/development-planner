// A 3D label keeps its size on screen: its sprite's scale from the label's height in pixels.

import { describe, expect, it } from 'vitest'
import { spriteScale } from '../spriteScale'

describe('a label sprite at a steady size on screen', () => {
  it('fills the whole view at the height of the view', () => {
    // A 90° lens sees ±1 at a depth of 1: a sprite of scale 2 (×depth) spans it.
    expect(spriteScale(800, 90, 800)).toBeCloseTo(2, 9)
  })

  it('scales with the pixels asked for, against the view', () => {
    const k = spriteScale(1, 40, 900)
    expect(spriteScale(16, 40, 900)).toBeCloseTo(16 * k, 12)
    expect(spriteScale(16, 40, 450)).toBeCloseTo(2 * spriteScale(16, 40, 900), 12)
    expect(spriteScale(16, 40, 0)).toBeGreaterThan(0)
  })
})
