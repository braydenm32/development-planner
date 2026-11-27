import { describe, expect, it } from 'vitest'
import { revealShift, selectionPoints } from '../reveal'
import { garageFloor } from './fixtures'

describe('keeping the selection in sight (DB-21)', () => {
  const covered = { l: 60, r: 330 }

  it('leaves the plan alone when the selection is already clear of the card', () => {
    expect(revealShift([200, 500], 1200, covered)).toBe(0)
    expect(revealShift([], 1200, covered)).toBe(0)
  })

  it('slides just far enough to bring a hidden selection out, with a little to spare', () => {
    // The card covers from 870; with 32 px to spare the selection's right end should sit at 838.
    expect(revealShift([700, 1000], 1200, covered)).toBe(162)
  })

  it('never pushes the other end of the selection under the tool rail', () => {
    // Only 28 px of room on the left before the rail's 60 px and the 32 px to spare.
    expect(revealShift([120, 1000], 1200, covered)).toBe(28)
    expect(revealShift([70, 1000], 1200, covered)).toBe(0)
  })

  it('knows where each kind of selection is', () => {
    const plan = garageFloor()
    expect(selectionPoints(plan, { type: 'wall', id: 'south' })).toEqual([
      [5.45, 0.15],
      [9.95, 0.15],
    ])
    // A door part-way along its wall: 0.9 m back from the hall wall's east end.
    const [door] = selectionPoints(plan, { type: 'opening', id: 'entry' })
    expect(door[0]).toBeCloseTo(9.05)
    expect(door[1]).toBeCloseTo(13.85)
    expect(selectionPoints(plan, { type: 'room', id: plan.rooms[0].id })).toEqual([plan.rooms[0].at])
    expect(selectionPoints(plan, { type: 'wall', id: 'gone' })).toEqual([])
  })
})
