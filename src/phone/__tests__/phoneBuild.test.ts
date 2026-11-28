// The phone's one-line peek for what was tapped, View's two-tap Measure (PH-29), and the press and
// hold that drags a piece from the furniture list by touch.

import { describe, expect, it } from 'vitest'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { HOLD_MS, HOLD_SLOP, holdState } from '../holdDrag'
import { selectionPeek } from '../selectionPeek'
import { nextPoints, tapMeasureHint } from '../tapMeasure'
import { touchWords } from '../words'

describe('the one-line peek for what was tapped', () => {
  const plan = garageFloor()
  plan.furniture = [{ id: 'f1', level: plan.levels[0].id, kind: 'bed-queen', at: [7, 8], rotation: 0, width: 1.53, depth: 2.03, height: 0.5 }]

  it('names it and gives its key size', () => {
    expect(selectionPeek(plan, { type: 'wall', id: 'south' })).toEqual({ name: 'External wall', size: '4500 mm long' })
    expect(selectionPeek(plan, { type: 'wall', id: 'hall_w' })?.name).toBe('Internal wall')
    expect(selectionPeek(plan, { type: 'opening', id: 'entry' })).toEqual({ name: 'Door', size: '920 mm wide' })
    expect(selectionPeek(plan, { type: 'opening', id: 'office_window' })?.size).toBe('1800 mm wide')
    expect(selectionPeek(plan, { type: 'room', id: 'r1' })).toMatchObject({ name: 'Garage', size: expect.stringMatching(/^\d+\.\d\d m²$/) })
    expect(selectionPeek(plan, { type: 'area', id: 'a1' })).toEqual({ name: 'Patio', size: expect.stringMatching(/^\d+\.\d\d m²$/) })
    expect(selectionPeek(plan, { type: 'furniture', id: 'f1' })).toEqual({ name: expect.any(String), size: '1530 × 2030 mm' })
  })

  it('counts a group, and has nothing to say once the thing has gone', () => {
    expect(selectionPeek(plan, { type: 'wall', id: 'south' }, [{ type: 'wall', id: 'east' }])?.name).toBe('2 items selected')
    expect(selectionPeek(plan, { type: 'wall', id: 'gone' })).toBeNull()
  })
})

describe('Measure in View on a phone (PH-29)', () => {
  it('takes a first point, then a second, then starts again', () => {
    const a: [number, number] = [0, 0]
    const b: [number, number] = [3, 4]
    const c: [number, number] = [1, 1]
    expect(nextPoints([], a)).toEqual([a])
    expect(nextPoints([a], b)).toEqual([a, b])
    expect(nextPoints([a, b], c)).toEqual([c])
  })

  it('says where to tap, in a finger’s words', () => {
    expect(tapMeasureHint(0, true)).toBe('Tap a point on the plan, then a second point, to read the distance between them.')
    expect(tapMeasureHint(1, true)).toBe('Tap the second point.')
    expect(tapMeasureHint(1, false)).toBe('Click the second point.')
  })

  it('leaves Esc out of Edit’s Measure card on a touch screen', () => {
    expect(touchWords('Click the next point. Esc finishes.')).toBe('Tap the next point.')
  })
})

describe('dragging from the furniture list by touch', () => {
  it('starts only after a still press, so a flick still scrolls the list and a tap still picks', () => {
    expect(holdState(0, 0)).toBe('waiting')
    expect(holdState(HOLD_SLOP - 1, HOLD_MS - 1)).toBe('waiting')
    expect(holdState(HOLD_SLOP - 1, HOLD_MS)).toBe('held')
    expect(holdState(HOLD_SLOP + 1, 50)).toBe('scroll')
  })
})
