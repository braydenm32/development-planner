// The plan's touch gestures as plain maths, so they can be checked without a screen: one
// finger pans, two fingers pinch about the point between them, a double tap zooms in, and
// the view can't wander off the block.
//
// A view is the plan's centre (in the house frame, metres) and its scale in pixels per
// metre. The page is turned by `rho` (anticlockwise) from the house frame, as the plan
// draws it.

export type Pt = [number, number]

export interface PlanView {
  cx: number
  cy: number
  /** Pixels per metre. */
  k: number
  /** The fit request this view belongs to (carried through untouched). */
  token?: number
}

export interface Size {
  w: number
  h: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** The plan's zoom limits, the same as the mouse wheel's. */
export const K_MIN = 4
export const K_MAX = 1500

/** How far a pinch can drift before it starts to zoom: a two-finger pan stays a pan. */
export const PINCH_DEAD_ZONE = 0.04

/** A tap moves less than this, in pixels; fingers wobble more than a mouse. */
export const TAP_SLOP = 8

/** Two taps this close in time (ms) and space (px) are a double tap. */
export const DOUBLE_TAP_MS = 300
export const DOUBLE_TAP_PX = 30

/** A double tap zooms in this much. */
export const DOUBLE_TAP_ZOOM = 2

export const clampK = (k: number) => Math.min(Math.max(k, K_MIN), K_MAX)

/** The point of the plan (house frame) under a point on the screen. */
export function screenToWorld(v: PlanView, rho: number, size: Size, s: Pt): Pt {
  const rc = Math.cos(rho)
  const rs = Math.sin(rho)
  const qx = (s[0] - size.w / 2) / v.k
  const qy = -(s[1] - size.h / 2) / v.k
  return [qx * rc + qy * rs + v.cx, -qx * rs + qy * rc + v.cy]
}

/** Where a point of the plan shows on the screen. */
export function worldToScreen(v: PlanView, rho: number, size: Size, p: Pt): Pt {
  const rc = Math.cos(rho)
  const rs = Math.sin(rho)
  const x = p[0] - v.cx
  const y = p[1] - v.cy
  return [(x * rc - y * rs) * v.k + size.w / 2, -(x * rs + y * rc) * v.k + size.h / 2]
}

/** The view at scale `k` that puts plan point `p` under screen point `s`. */
export function anchorView(v: PlanView, rho: number, size: Size, p: Pt, s: Pt, k: number): PlanView {
  const rc = Math.cos(rho)
  const rs = Math.sin(rho)
  const qx = (s[0] - size.w / 2) / k
  const qy = -(s[1] - size.h / 2) / k
  return { ...v, k, cx: p[0] - (qx * rc + qy * rs), cy: p[1] - (-qx * rs + qy * rc) }
}

/** Zoom by `factor` about a point on the screen, which stays where it is. */
export function zoomAbout(v: PlanView, rho: number, size: Size, s: Pt, factor: number): PlanView {
  return anchorView(v, rho, size, screenToWorld(v, rho, size, s), s, clampK(v.k * factor))
}

/** Move the view with a finger that has moved by `d` pixels since `start`. */
export function panBy(start: PlanView, rho: number, d: Pt): PlanView {
  const rc = Math.cos(rho)
  const rs = Math.sin(rho)
  return { ...start, cx: start.cx - (d[0] * rc - d[1] * rs) / start.k, cy: start.cy + (d[0] * rs + d[1] * rc) / start.k }
}

/**
 * How much a pinch zooms, from how far the fingers have spread (1 = not at all). Small
 * changes are ignored, so two fingers moving together pan without the zoom wobbling, and
 * past that the plan follows the fingers less the dead zone, with no jump where it starts.
 */
export function pinchScale(spread: number, deadZone = PINCH_DEAD_ZONE): number {
  if (!(spread > 0) || !Number.isFinite(spread)) return 1
  const l = Math.log(spread)
  const past = Math.max(0, Math.abs(l) - deadZone)
  return Math.exp(Math.sign(l) * past)
}

const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

/**
 * The view during a pinch: the plan point that was between the fingers when they went
 * down stays between them, zoomed by how far they've spread and panned with them.
 */
export function pinchView(start: PlanView, rho: number, size: Size, from: [Pt, Pt], to: [Pt, Pt], deadZone = PINCH_DEAD_ZONE): PlanView {
  const d0 = dist(from[0], from[1])
  const spread = d0 < 1 ? 1 : dist(to[0], to[1]) / d0
  const p = screenToWorld(start, rho, size, mid(from[0], from[1]))
  return anchorView(start, rho, size, p, mid(to[0], to[1]), clampK(start.k * pinchScale(spread, deadZone)))
}

/** Keep the middle of the screen over the block, so a fling can't lose it. */
export function clampToBounds(v: PlanView, b: Bounds | null): PlanView {
  if (!b) return v
  const cx = Math.min(Math.max(v.cx, b.minX), b.maxX)
  const cy = Math.min(Math.max(v.cy, b.minY), b.maxY)
  return cx === v.cx && cy === v.cy ? v : { ...v, cx, cy }
}

/** The bounding box of some points (the block's boundary, in the house frame). */
export function boundsOf(pts: Pt[]): Bounds | null {
  if (!pts.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return { minX, minY, maxX, maxY }
}

export interface Tap {
  t: number
  x: number
  y: number
}

/** Whether a tap follows the last one closely enough to be a double tap. */
export function isDoubleTap(prev: Tap | null, now: Tap): boolean {
  return !!prev && now.t - prev.t <= DOUBLE_TAP_MS && Math.hypot(now.x - prev.x, now.y - prev.y) <= DOUBLE_TAP_PX
}

/** Ease in and out, from 0 to 1. */
export function ease(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/**
 * A step of the double tap's zoom: part of the way to `factor`, in equal ratios, with the
 * tapped point held still the whole way.
 */
export function zoomStep(start: PlanView, rho: number, size: Size, s: Pt, factor: number, t: number): PlanView {
  const target = clampK(start.k * factor)
  return anchorView(start, rho, size, screenToWorld(start, rho, size, s), s, start.k * (target / start.k) ** ease(t))
}
