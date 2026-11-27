// Where focus goes when a plan list changes under it (final check, problem 1): never to the page.

import { describe, expect, it } from 'vitest'
import { rowFocusAfter } from '../rowFocus'

const ROWS = ['a', 'b', 'c']

describe('focus after a plan list changes', () => {
  it('goes to the next row when the picked one is deleted', () => {
    expect(rowFocusAfter(ROWS, 'b', ['a', 'c'], null)).toEqual({ row: 'c' })
  })

  it('goes to the row before when the last one is deleted', () => {
    expect(rowFocusAfter(ROWS, 'c', ['a', 'b'], null)).toEqual({ row: 'b' })
  })

  it("goes to the list's add button or heading when the list empties", () => {
    expect(rowFocusAfter(['a'], 'a', [], null)).toEqual({ fallback: true })
  })

  it('goes to the new row after an add', () => {
    expect(rowFocusAfter(ROWS, null, [...ROWS, 'd'], 'd')).toEqual({ row: 'd' })
    // A door added into the picked wall: the doors list takes focus, the walls list leaves it.
    expect(rowFocusAfter(['d1'], null, ['d1', 'd2'], 'd2')).toEqual({ row: 'd2' })
    expect(rowFocusAfter(['w1', 'w2'], 'w1', ['w1', 'w2'], 'd2')).toBeNull()
  })

  it('goes back to the row when its selection is put down', () => {
    expect(rowFocusAfter(ROWS, 'a', ROWS, null)).toEqual({ row: 'a' })
  })

  it("leaves another list's changes alone", () => {
    expect(rowFocusAfter(ROWS, 'x', ROWS, null)).toBeNull()
    expect(rowFocusAfter(ROWS, null, ROWS, null)).toBeNull()
  })
})
