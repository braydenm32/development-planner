// Arrow keys in the groups that say they have them (AX-20): where each key takes the focus, and
// which groups are covered.

import { describe, expect, it } from 'vitest'
import { ARROW_GROUPS, arrowStep } from '../arrowKeys'

describe('arrow keys in a radio group, toolbar, list box, menu or tab list', () => {
  it('moves to the next item with Right or Down and the one before with Left or Up, round the ends', () => {
    expect(arrowStep('ArrowRight', 0, 3)).toBe(1)
    expect(arrowStep('ArrowDown', 1, 3)).toBe(2)
    expect(arrowStep('ArrowDown', 2, 3)).toBe(0)
    expect(arrowStep('ArrowLeft', 2, 3)).toBe(1)
    expect(arrowStep('ArrowUp', 0, 3)).toBe(2)
  })

  it('goes to the ends with Home and End', () => {
    expect(arrowStep('Home', 2, 4)).toBe(0)
    expect(arrowStep('End', 0, 4)).toBe(3)
  })

  it('leaves every other key alone, and an empty group', () => {
    for (const k of ['Tab', 'Enter', ' ', 'Escape', 'a', 'PageDown']) expect(arrowStep(k, 0, 3)).toBeNull()
    expect(arrowStep('ArrowRight', 0, 0)).toBeNull()
  })

  it('starts from the first item when the focus is on none of them', () => {
    expect(arrowStep('ArrowRight', -1, 3)).toBe(0)
  })

  it('covers each role that promises arrow keys; only a radio or a tab is chosen as the focus lands', () => {
    expect(ARROW_GROUPS.map(g => g.group)).toEqual(['[role="radiogroup"]', '[role="tablist"]', '[role="toolbar"]', '[role="listbox"]', '[role="menu"]'])
    expect(ARROW_GROUPS.filter(g => g.choose).map(g => g.item)).toEqual(['[role="radio"]', '[role="tab"]'])
  })
})
