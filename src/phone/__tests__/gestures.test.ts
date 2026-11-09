// The plan's finger gestures as maths: a pinch zooms about the point between the fingers,
// a pan follows the finger on a turned page, a double tap zooms about the tap, and the
// view can't be flung off the block.

import { describe, expect, it } from 'vitest'
import {
  anchorView,
  boundsOf,
  clampK,
  clampToBounds,
  DOUBLE_TAP_MS,
  DOUBLE_TAP_PX,
  ease,
  isDoubleTap,
  K_MAX,
  K_MIN,
  panBy,
  PINCH_DEAD_ZONE,
  pinchScale,
  pinchView,
  screenToWorld,
  worldToScreen,
  zoomAbout,
  zoomStep,
  type PlanView,
  type Pt,
} from '../gestures'

const size = { w: 390, h: 700 }
const view: PlanView = { cx: 12, cy: -3, k: 20, token: 7 }
const turns = [0, 0.4, -1.1, Math.PI / 2, 2.6]

const near = (a: Pt, b: Pt, digits = 6) => {
  expect(a[0]).toBeCloseTo(b[0], digits)
  expect(a[1]).toBeCloseTo(b[1], digits)
}

describe('screen and plan', () => {
  it('turn a plan point onto the screen and back again, on a turned page', () => {
    for (const rho of turns) {
      const p: Pt = [7.3, 4.1]
      near(screenToWorld(view, rho, size, worldToScreen(view, rho, size, p)), p)
    }
  })

  it('put the view centre in the middle of the screen', () => {
    for (const rho of turns) near(worldToScreen(view, rho, size, [view.cx, view.cy]), [size.w / 2, size.h / 2])
  })

  it('anchor a plan point under a screen point at any scale', () => {
    for (const rho of turns) {
      const v = anchorView(view, rho, size, [3, 9], [100, 520], 55)
      expect(v.k).toBe(55)
      expect(v.token).toBe(7)
      near(worldToScreen(v, rho, size, [3, 9]), [100, 520])
    }
  })
})

describe('a pinch', () => {
  it('keeps the plan point between the fingers between them, as they spread', () => {
    for (const rho of turns) {
      const from: [Pt, Pt] = [
        [120, 300],
        [260, 420],
      ]
      const under = screenToWorld(view, rho, size, [190, 360])
      // Spread about the same middle: twice as far apart.
      const to: [Pt, Pt] = [
        [50, 240],
        [330, 480],
      ]
      const v = pinchView(view, rho, size, from, to)
      near(worldToScreen(v, rho, size, under), [190, 360])
      expect(v.k).toBeCloseTo(view.k * pinchScale(2), 9)
      expect(v.k).toBeGreaterThan(view.k * 1.8)
    }
  })

  it('pans with the fingers when they move together', () => {
    const from: [Pt, Pt] = [
      [100, 300],
      [200, 300],
    ]
    const to: [Pt, Pt] = [
      [160, 380],
      [260, 380],
    ]
    const under = screenToWorld(view, 0.4, size, [150, 300])
    const v = pinchView(view, 0.4, size, from, to)
    expect(v.k).toBe(view.k)
    near(worldToScreen(v, 0.4, size, under), [210, 380])
  })

  it('ignores a small wobble in the spread, so a two-finger pan does not zoom', () => {
    expect(pinchScale(1)).toBe(1)
    expect(pinchScale(Math.exp(PINCH_DEAD_ZONE * 0.9))).toBe(1)
    expect(pinchScale(Math.exp(-PINCH_DEAD_ZONE * 0.9))).toBe(1)
  })

  it('follows the fingers smoothly past the wobble, with no jump where it starts', () => {
    expect(pinchScale(Math.exp(PINCH_DEAD_ZONE + 1e-6))).toBeCloseTo(1, 5)
    expect(pinchScale(Math.exp(PINCH_DEAD_ZONE + 0.5))).toBeCloseTo(Math.exp(0.5), 9)
    expect(pinchScale(Math.exp(-PINCH_DEAD_ZONE - 0.5))).toBeCloseTo(Math.exp(-0.5), 9)
  })

  it('treats a nonsense spread as no zoom', () => {
    expect(pinchScale(0)).toBe(1)
    expect(pinchScale(NaN)).toBe(1)
    expect(pinchScale(Infinity)).toBe(1)
  })

  it('stops at the zoom limits', () => {
    const big = pinchView(view, 0, size, [[190, 340], [200, 360]], [[0, 0], [390, 700]])
    expect(big.k).toBeLessThanOrEqual(K_MAX)
    const small = pinchView({ ...view, k: K_MIN + 1 }, 0, size, [[0, 0], [390, 700]], [[190, 340], [192, 344]])
    expect(small.k).toBe(K_MIN)
    expect(clampK(1e9)).toBe(K_MAX)
    expect(clampK(0)).toBe(K_MIN)
  })

  it('does nothing odd when the fingers start on top of each other', () => {
    const v = pinchView(view, 0, size, [[200, 300], [200, 300]], [[100, 300], [300, 300]])
    expect(v.k).toBe(view.k)
  })
})

describe('a pan', () => {
  it('moves the plan with the finger, on a turned page too', () => {
    for (const rho of turns) {
      const under = screenToWorld(view, rho, size, [80, 90])
      const v = panBy(view, rho, [35, -60])
      near(worldToScreen(v, rho, size, under), [115, 30])
      expect(v.k).toBe(view.k)
    }
  })

  it('keeps the middle of the screen over the block', () => {
    const b = boundsOf([
      [0, 0],
      [20, 0],
      [20, 30],
      [0, 30],
    ])!
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 30 })
    expect(clampToBounds({ cx: -50, cy: 70, k: 10 }, b)).toEqual({ cx: 0, cy: 30, k: 10 })
    expect(clampToBounds({ cx: 25, cy: -1, k: 10 }, b)).toEqual({ cx: 20, cy: 0, k: 10 })
    const inside = { cx: 5, cy: 6, k: 10 }
    expect(clampToBounds(inside, b)).toBe(inside)
    expect(clampToBounds(inside, null)).toBe(inside)
    expect(boundsOf([])).toBeNull()
  })
})

describe('a double tap', () => {
  it('needs two taps close in time and place', () => {
    const a = { t: 1000, x: 100, y: 200 }
    expect(isDoubleTap(null, a)).toBe(false)
    expect(isDoubleTap(a, { t: 1000 + DOUBLE_TAP_MS - 1, x: 110, y: 205 })).toBe(true)
    expect(isDoubleTap(a, { t: 1000 + DOUBLE_TAP_MS + 1, x: 100, y: 200 })).toBe(false)
    expect(isDoubleTap(a, { t: 1100, x: 100 + DOUBLE_TAP_PX + 1, y: 200 })).toBe(false)
  })

  it('zooms in about the tapped point, which stays still the whole way', () => {
    for (const rho of turns) {
      const s: Pt = [300, 150]
      const under = screenToWorld(view, rho, size, s)
      for (const t of [0, 0.25, 0.5, 0.9, 1]) near(worldToScreen(zoomStep(view, rho, size, s, 2, t), rho, size, under), s)
      expect(zoomStep(view, rho, size, s, 2, 0).k).toBeCloseTo(view.k, 9)
      expect(zoomStep(view, rho, size, s, 2, 1).k).toBeCloseTo(view.k * 2, 9)
      expect(zoomAbout(view, rho, size, s, 2).k).toBeCloseTo(view.k * 2, 9)
    }
  })

  it('eases in and out', () => {
    expect(ease(-1)).toBe(0)
    expect(ease(0)).toBe(0)
    expect(ease(0.5)).toBeCloseTo(0.5, 9)
    expect(ease(1)).toBe(1)
    expect(ease(0.1)).toBeLessThan(0.1)
    expect(ease(0.9)).toBeGreaterThan(0.9)
  })
})
