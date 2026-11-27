// Where a toast sits on a computer (final check, problem 11): over the plan, never over the panel.

import { describe, expect, it } from 'vitest'
import { toastSpot } from '../store'

describe('the toast beside the panel', () => {
  it('sits in the middle of the plan’s free part', () => {
    // 1440 wide: the side bar is 88 px, the rail and the panel take 412 px of the main area.
    expect(toastSpot({ left: 88, width: 1352 }, 412, 16)).toEqual({ left: 88 + 412 + 462, maxWidth: 600 })
  })

  it('narrows to the room it has', () => {
    expect(toastSpot({ left: 88, width: 900 }, 412, 16)?.maxWidth).toBe(900 - 412 - 16 - 32)
  })

  it('keeps the middle of the window where the free part is too narrow', () => {
    expect(toastSpot({ left: 0, width: 700 }, 412, 16)).toBeNull()
  })
})
