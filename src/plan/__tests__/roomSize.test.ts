import { describe, expect, it } from 'vitest'
import { planarFaces, roomShape } from '../geometry'
import { roomInsideSize, roomSizeText } from '../roomSize'
import { garageFloor } from './fixtures'

describe('a room’s clear size, face to face (DB-35)', () => {
  it('gives a rectangle its two sides, across the page then up it', () => {
    const s = roomInsideSize([
      [0, 0],
      [4.81, 0],
      [4.81, 7.73],
      [0, 7.73],
    ])!
    expect(s.rect).toBe(true)
    expect(roomSizeText(s)).toBe('4810 × 7730 mm')
    // The same room started from another corner, going the other way round.
    const t = roomInsideSize([
      [4.81, 7.73],
      [4.81, 0],
      [0, 0],
      [0, 7.73],
    ])!
    expect(roomSizeText(t)).toBe('4810 × 7730 mm')
  })

  it('ignores points along a straight side (where another wall tees in)', () => {
    const s = roomInsideSize([
      [0, 0],
      [2, 0],
      [5, 0],
      [5, 3],
      [0, 3],
      [0, 1.2],
    ])!
    expect(s).toMatchObject({ rect: true })
    expect(roomSizeText(s)).toBe('5000 × 3000 mm')
  })

  it('gives an L-shaped room the most it spans each way, and says it is not a rectangle', () => {
    const s = roomInsideSize([
      [0, 0],
      [6, 0],
      [6, 2],
      [3, 2],
      [3, 5],
      [0, 5],
    ])!
    expect(s.rect).toBe(false)
    expect(roomSizeText(s)).toBe('6000 × 5000 mm')
  })

  it('measures a room on a skew along its longest wall and across it', () => {
    const c = Math.SQRT1_2
    const s = roomInsideSize([
      [0, 0],
      [4 * c, 4 * c],
      [4 * c - 3 * c, 4 * c + 3 * c],
      [-3 * c, 3 * c],
    ])!
    expect(s.rect).toBe(true)
    expect(roomSizeText(s)).toBe('4000 × 3000 mm')
  })

  it('has none for a space that isn’t enclosed', () => {
    expect(roomInsideSize(null)).toBeNull()
    expect(roomInsideSize([[0, 0], [1, 0]])).toBeNull()
  })

  it('reads the study in the test house between its wall faces', () => {
    const plan = garageFloor()
    const study = plan.rooms.find(r => /study|office/i.test(r.name)) ?? plan.rooms[0]
    const shape = roomShape(study, planarFaces(plan.walls))!
    const s = roomInsideSize(shape.inner)!
    // Its area is the two sides multiplied when it is a rectangle.
    if (s.rect) expect(s.w * s.d).toBeCloseTo(shape.area, 3)
    expect(s.w).toBeGreaterThan(0)
  })
})
