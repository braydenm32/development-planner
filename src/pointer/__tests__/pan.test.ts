import { describe, expect, it } from 'vitest'
import { spaceIsPan } from '../spacePan'
import { PAN_STREAK_MS, wheelPan } from '../wheel'

const wheel = (deltaX: number, deltaY: number, o: Partial<{ deltaMode: number; ctrlKey: boolean }> = {}) => ({ deltaX, deltaY, deltaMode: 0, ctrlKey: false, ...o })

describe('two-finger scroll pans, a wheel zooms (CB-13)', () => {
  it('zooms for a mouse wheel: no sideways part', () => {
    expect(wheelPan(wheel(0, 100))).toBeNull()
    expect(wheelPan(wheel(0, -3, { deltaMode: 1 }))).toBeNull()
  })

  it('pans for a scroll with a sideways part, the way a drag would', () => {
    expect(wheelPan(wheel(12, 30))).toEqual([-12, -30])
    expect(wheelPan(wheel(-8, 0))).toEqual([8, -0])
  })

  it('keeps panning when the same gesture runs dead straight for a moment', () => {
    expect(wheelPan(wheel(0, 20), 40)).toEqual([-0, -20])
    expect(wheelPan(wheel(0, 20), PAN_STREAK_MS + 1)).toBeNull()
  })

  it('zooms for a pinch, which arrives with Ctrl', () => {
    expect(wheelPan(wheel(4, 20, { ctrlKey: true }), 10)).toBeNull()
  })

  it('never throws the plan out of sight on one event', () => {
    expect(wheelPan(wheel(5000, -5000))).toEqual([-240, 240])
  })
})

describe('Space as the pan key (CB-13)', () => {
  const key = (target: unknown, o: Partial<{ code: string; ctrlKey: boolean }> = {}) => ({ code: 'Space', key: ' ', ctrlKey: false, metaKey: false, altKey: false, target: target as EventTarget | null, ...o })
  const button = { tagName: 'BUTTON', closest: (s: string) => (s.includes('button') ? {} : null) }
  const body = { tagName: 'BODY', closest: () => null }
  const yes = () => true

  it('is the pan key on the plan itself', () => {
    expect(spaceIsPan(key(body), true, false, yes)).toBe(true)
    expect(spaceIsPan(key(body), false, false, yes)).toBe(true)
  })

  it('is not, wherever a shortcut may not fire (a text box, a dialog)', () => {
    expect(spaceIsPan(key(body), true, false, () => false)).toBe(false)
  })

  it('leaves Space to a button the keyboard is on', () => {
    expect(spaceIsPan(key(button), true, true, yes)).toBe(false)
  })

  it('takes Space from a tool button that was only clicked, once the pointer is back over the plan', () => {
    expect(spaceIsPan(key(button), true, false, yes)).toBe(true)
    expect(spaceIsPan(key(button), false, false, yes)).toBe(false)
  })

  it('is only plain Space', () => {
    expect(spaceIsPan(key(body, { ctrlKey: true }), true, false, yes)).toBe(false)
    expect(spaceIsPan(key(body, { code: 'KeyW' }), true, false, yes)).toBe(false)
  })
})
