import { describe, expect, it } from 'vitest'
import type { Opening, Wall } from '../model'
import { doorSwingAt, onSwing } from '../openingHit'

// A wall along x from 0 to 6, 300 mm thick: its left (the side a door swings to unless flipped) is +y.
const wall: Wall = { id: 'w', level: 'l', a: [0, 0], b: [6, 0], thickness: 0.3, kind: 'external' }
const door = (patch: Partial<Opening> = {}): Opening => ({ id: 'd', wall: 'w', kind: 'door', offset: 3, width: 0.9, height: 2.04, sill: 0, flipHinge: false, flipSwing: false, ...patch })

describe('a door picked by its leaf and swing', () => {
  it('a hinged door: the leaf, the arc and inside the quarter circle, on the side it opens to', () => {
    const d = door()
    // The leaf stands square off the near jamb (x 2.55), out to +y.
    expect(onSwing(d, wall, [2.56, 0.8], 0.01)).toBe(true)
    // On the arc, 45° round from the leaf.
    expect(onSwing(d, wall, [2.55 + 0.9 * Math.SQRT1_2, 0.155 + 0.9 * Math.SQRT1_2], 0.01)).toBe(true)
    expect(onSwing(d, wall, [2.9, 0.4], 0.01)).toBe(true)
    // Not past the arc, nor on the other side of the wall.
    expect(onSwing(d, wall, [3.4, 0.9], 0.01)).toBe(false)
    expect(onSwing(d, wall, [2.8, -0.5], 0.01)).toBe(false)
  })

  it('follows a flipped swing and a flipped hinge', () => {
    expect(onSwing(door({ flipSwing: true }), wall, [2.8, -0.5], 0.01)).toBe(true)
    expect(onSwing(door({ flipSwing: true }), wall, [2.8, 0.5], 0.01)).toBe(false)
    // Hinged at the far jamb (x 3.45): the leaf stands there.
    expect(onSwing(door({ flipHinge: true }), wall, [3.44, 0.9], 0.01)).toBe(true)
    expect(onSwing(door({ flipHinge: true }), wall, [2.56, 0.9], 0.01)).toBe(false)
  })

  it('a pair of doors, a bifold, and the kinds that stay in the wall', () => {
    const pair = door({ style: 'double', width: 1.8, offset: 3 })
    expect(onSwing(pair, wall, [2.15, 0.9], 0.01)).toBe(true)
    expect(onSwing(pair, wall, [3.85, 0.9], 0.01)).toBe(true)
    expect(onSwing(pair, wall, [3, 1.0], 0.01)).toBe(false)
    const bifold = door({ style: 'bifold', width: 2.4 })
    expect(onSwing(bifold, wall, [2.5, 0.3], 0.01)).toBe(true)
    expect(onSwing(bifold, wall, [2.5, 1.2], 0.01)).toBe(false)
    expect(onSwing(door({ style: 'sliding' }), wall, [2.8, 0.4], 0.01)).toBe(false)
    expect(onSwing(door({ kind: 'window' }), wall, [2.8, 0.4], 0.01)).toBe(false)
  })

  it('finds the door from the plan’s openings', () => {
    expect(doorSwingAt([door()], [wall], [2.9, 0.4], 0.01)?.id).toBe('d')
    expect(doorSwingAt([door()], [wall], [5, 2], 0.01)).toBeNull()
    // Its wall on another level (not in the walls handed in): nothing.
    expect(doorSwingAt([door()], [], [2.9, 0.4], 0.01)).toBeNull()
  })
})
