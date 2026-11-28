// Walk-through's keys and words: which key walks which way, and the hint reworded for a finger.

import { afterEach, describe, expect, it } from 'vitest'
import { shortcutAllowed } from '../../nav/keys'
import { forTouch } from '../../phone/words'
import { WALK_HINT } from '../WalkPanel'
import { useWalk, walkMove } from '../walkStore'

afterEach(() => useWalk.setState({ active: false }))

describe('walking keys', () => {
  it('walks with the arrows and W A S D, steps sideways, and turns with Q and E', () => {
    expect(['ArrowUp', 'w', 'W', 'ArrowDown', 's', 'ArrowLeft', 'a', 'ArrowRight', 'd', 'q', 'e'].map(walkMove)).toEqual([
      'forward',
      'forward',
      'forward',
      'back',
      'back',
      'left',
      'left',
      'right',
      'right',
      'turnLeft',
      'turnRight',
    ])
    expect(['r', 'Enter', ' ', 'Escape', 'PageUp'].map(walkMove)).toEqual([null, null, null, null, null])
  })

  it('takes the plain keys from the other shortcuts while it is on, and gives them back after', () => {
    const press = { key: 'w', ctrlKey: false, metaKey: false, target: null }
    // The page's own scene: no dialog open, nothing tabbed to.
    expect(shortcutAllowed(press)).toBe(true)
    useWalk.getState().set({ active: true })
    expect(shortcutAllowed(press)).toBe(false)
    expect(shortcutAllowed({ ...press, key: 'Escape' })).toBe(true)
    useWalk.getState().set({ active: false })
    expect(shortcutAllowed(press)).toBe(true)
  })
})

describe('the walk-through hint', () => {
  it('says tap, and leaves out the keys and the wheel, on a touch screen', () => {
    expect(forTouch(WALK_HINT, false)).toBe(WALK_HINT)
    expect(forTouch(WALK_HINT, true)).toBe('Drag to look round. Tap the floor to walk there.')
  })
})
