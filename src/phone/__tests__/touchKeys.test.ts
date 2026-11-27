// On a touch screen, help and names leave out the keyboard (final check, problem 8).

import { describe, expect, it } from 'vitest'
import { touchWords, withKey } from '../words'

describe('touch wording', () => {
  it('drops the arrow-key sentence from Walls & doors', () => {
    const said = touchWords('Picking a row shows it on the plan. With the plan in focus, the arrow keys move what is picked 10 mm (Shift: 100 mm).')
    expect(said).toBe('Picking a row shows it on the plan.')
  })

  it("says Tap and points to the panel's Delete in the plan's Select hint", () => {
    const said = touchWords('Drag a wall to move it, or its end handles to reshape. Delete removes; right-click for more. Drag empty space to pan.')
    expect(said).toBe('Drag a wall to move it, or its end handles to reshape. Its panel has Delete. Drag empty space to pan.')
    expect(touchWords('Click a contour on the plan to put this floor at its level')).toBe('Tap a contour on the plan to put this floor at its level')
  })

  it('names a control without its key on a touch screen', () => {
    expect(withKey('Zoom out', '−', false)).toBe('Zoom out (−)')
    expect(withKey('Zoom out', '−', true)).toBe('Zoom out')
    expect(withKey('Select tool', 'V', true)).toBe('Select tool')
  })
})
