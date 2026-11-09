// The 3D views frame the house in the part of the canvas nothing covers: beside a desktop's
// tab panel, and between a phone's camera buttons and its peek sheet. Plain maths, checked by
// projecting what a preset fits back onto the screen.

import { describe, expect, it } from 'vitest'
import { fitDistance } from '../camera'
import { openArea } from '../frame'

// The new layout's desktop insets with a tab panel open in 3D (src/shell/AppShell.tsx): 14 px
// gap + a 332 px panel + 14 px gap on the left, 16 px on the right, the view bars top and bottom.
const PANEL = { l: 14 + 332 + 14, r: 16, t: 56, b: 56 }
const NO_PANEL = { l: 14, r: 16, t: 56, b: 56 }
const W = 1352 // a 1440 px window less the area rail
const H = 770

/** How big a preset's sphere of radius `r` shows (its half-size in pixels), as CameraRig fits it. */
function shownHalfSize(w: number, h: number, insets: typeof PANEL | null, phone: boolean, fovDeg = 45, r = 10) {
  const a = openArea(w, h, insets, phone)
  const fov = (2 * Math.atan(Math.tan((fovDeg * Math.PI) / 360) * a.freeHeight) * 180) / Math.PI
  const d = fitDistance(r, fov, a.aspect)
  // A sphere seen from d spans asin(r / d) either side of the middle; tan of that over tan(fov/2), times half the height, in pixels.
  return { a, half: (Math.tan(Math.asin(r / d)) / Math.tan((fovDeg * Math.PI) / 360)) * (h / 2) }
}

describe('the open part of the 3D canvas', () => {
  it('is the whole canvas with nothing over it', () => {
    expect(openArea(1000, 600, null, false)).toEqual({ aspect: 1000 / 600, freeHeight: 1, dx: 0, dy: 0 })
  })

  it('on a desktop, is what the tab panel leaves, and the picture moves into its middle', () => {
    const a = openArea(W, H, PANEL, false)
    const freeW = W - 360 - 16
    const freeH = H - 56 - 56
    expect(a.aspect).toBeCloseTo(freeW / freeH, 12)
    expect(a.freeHeight).toBeCloseTo(freeH / H, 12)
    // The middle of the picture (W / 2 - dx) lands in the middle of the open part.
    expect(W / 2 - a.dx).toBeCloseTo(360 + freeW / 2, 9)
    expect(a.dx).toBe(-172)
    expect(a.dy).toBe(0)
  })

  it('on a desktop with the panel tucked away, is nearly the whole canvas again', () => {
    const a = openArea(W, H, NO_PANEL, false)
    expect(a.dx).toBe(1)
    expect(a.aspect).toBeCloseTo((W - 30) / (H - 112), 12)
  })

  it('on a phone, is still only what the buttons and sheet leave above and below, as before', () => {
    const phone = { l: 0, r: 60, t: 62, b: 202 }
    const a = openArea(390, 664, phone, true)
    expect(a.dx).toBe(0)
    expect(a.dy).toBe((202 - 62) / 2)
    expect(a.aspect).toBeCloseTo(390 / (664 - 62 - 202), 12)
  })

  it('never shrinks to nothing behind a big panel', () => {
    const a = openArea(500, 300, { l: 480, r: 16, t: 56, b: 56 }, false)
    expect(a.aspect).toBeGreaterThan(0)
    expect(Number.isFinite(a.aspect)).toBe(true)
  })

  it('fits a preset in the open part: the house never reaches under the panel', () => {
    for (const insets of [PANEL, NO_PANEL]) {
      const { a, half } = shownHalfSize(W, H, insets, false)
      const freeW = W - insets.l - insets.r
      const freeH = H - insets.t - insets.b
      // As big as fits, and no bigger, either way.
      expect(half).toBeLessThanOrEqual(Math.min(freeW, freeH) / 2 + 1e-6)
      expect(half).toBeCloseTo(Math.min(freeW, freeH * a.aspect) / 2 > freeH / 2 ? freeH / 2 : freeW / 2, 6)
      // Its middle, moved by dx, sits in the open part's middle: its left edge clears the panel.
      const mid = W / 2 - a.dx
      expect(mid - half).toBeGreaterThanOrEqual(insets.l - 1e-6)
      expect(mid + half).toBeLessThanOrEqual(W - insets.r + 1e-6)
    }
  })
})
