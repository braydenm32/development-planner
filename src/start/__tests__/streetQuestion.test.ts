// The street question after an import: a side of the block is picked on the card or by
// clicking it on the plan, and asking again starts afresh from the low side.

import { describe, expect, it } from 'vitest'
import { askStreetSide, chooseStreetEdge, edgeNear, hoverStreetEdge, streetAsked, useStreetAsk } from '../streetQuestion'

describe('a side of the block under the pointer', () => {
  // A 100 × 50 px block on the screen, its sides numbered from the top-left corner round.
  const box: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 50],
    [0, 50],
  ]

  it('is the nearest side within reach', () => {
    expect(edgeNear(box, 50, 3, 10)).toBe(0)
    expect(edgeNear(box, 104, 25, 10)).toBe(1)
    expect(edgeNear(box, 40, 48, 10)).toBe(2)
    expect(edgeNear(box, -6, 30, 10)).toBe(3)
  })

  it('is none in the middle of the block, or far outside it', () => {
    expect(edgeNear(box, 50, 25, 10)).toBeNull()
    expect(edgeNear(box, 200, 25, 10)).toBeNull()
  })

  it('takes the nearer side at a corner', () => {
    expect(edgeNear(box, 97, 1, 10)).toBe(0)
    expect(edgeNear(box, 99, 4, 10)).toBe(1)
  })
})

describe('the question', () => {
  it('starts with nothing picked or pointed at, and forgets both once answered', () => {
    askStreetSide('p1')
    expect(useStreetAsk.getState()).toMatchObject({ project: 'p1', chosen: null, hover: null })
    chooseStreetEdge(2)
    hoverStreetEdge(1)
    expect(useStreetAsk.getState()).toMatchObject({ chosen: 2, hover: 1 })
    streetAsked()
    expect(useStreetAsk.getState()).toEqual({ project: null, chosen: null, hover: null })
    askStreetSide('p2')
    expect(useStreetAsk.getState().chosen).toBeNull()
    streetAsked()
  })
})
