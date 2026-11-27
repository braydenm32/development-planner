// Where Tab goes inside an open dialog, sheet or menu (src/nav/useModal.ts).

import { describe, expect, it } from 'vitest'
import { trapStep } from '../useModal'

describe('Tab inside an open dialog', () => {
  it('comes round at either end and never leaves', () => {
    expect(trapStep(3, 2, false)).toBe(0)
    expect(trapStep(3, 0, true)).toBe(2)
    expect(trapStep(3, 1, false)).toBe(2)
    expect(trapStep(1, 0, false)).toBe(0)
    expect(trapStep(1, 0, true)).toBe(0)
  })

  it('comes in from outside at the first stop, or the last going backwards', () => {
    expect(trapStep(4, -1, false)).toBe(0)
    expect(trapStep(4, -1, true)).toBe(3)
    expect(trapStep(0, -1, false)).toBe(-1)
  })
})
