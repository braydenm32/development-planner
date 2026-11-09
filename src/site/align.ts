import { centroidOf, type Vec2 } from '../lib/geom'
import type { Overlay } from './store'

/** A 2D affine map, as SVG's matrix(a b c d e f): X = a·x + c·y + e, Y = b·x + d·y + f. */
export type Affine = [number, number, number, number, number, number]

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0]

export function applyAffine(m: Affine, p: Vec2): Vec2 {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]
}

/** `outer` after `inner`: p ↦ outer(inner(p)). */
export function compose(outer: Affine, inner: Affine): Affine {
  const [a, b, c, d, e, f] = outer
  const [A, B, C, D, E, F] = inner
  return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f]
}

export function invert(m: Affine): Affine | null {
  const [a, b, c, d, e, f] = m
  const det = a * d - b * c
  if (Math.abs(det) < 1e-18) return null
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

/** How many output units one input unit becomes (for a map with no shear). */
export function scaleOf(m: Affine): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))
}

/** Turn of the map in degrees, anticlockwise. */
export function rotationOf(m: Affine): number {
  return (Math.atan2(m[1], m[0]) * 180) / Math.PI
}

/**
 * The turn, scale and shift (no stretch or mirror) that takes two points on a drawing to
 * two points on the survey: drawing a → survey A and b → B exactly.
 */
export function similarityFromPairs(a: Vec2, b: Vec2, A: Vec2, B: Vec2): Affine | null {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const den = dx * dx + dy * dy
  if (den < 1e-12) return null
  const DX = B[0] - A[0]
  const DY = B[1] - A[1]
  // As complex numbers: α = (B − A) / (b − a), and the shift puts a on A.
  const re = (DX * dx + DY * dy) / den
  const im = (DY * dx - DX * dy) / den
  return [re, im, -im, re, A[0] - (re * a[0] - im * a[1]), A[1] - (im * a[0] + re * a[1])]
}

/** Keep a map's turn and scale but shift it so drawing point `a` lands on survey point `A`. */
export function moveToPair(m: Affine, a: Vec2, A: Vec2): Affine {
  const p = applyAffine(m, a)
  return [m[0], m[1], m[2], m[3], m[4] + A[0] - p[0], m[5] + A[1] - p[1]]
}

/** A turn by `deg` and a uniform scale, then a shift. */
export function similarity(scale: number, deg: number, shift: Vec2): Affine {
  const t = (deg * Math.PI) / 180
  const c = Math.cos(t) * scale
  const s = Math.sin(t) * scale
  return [c, s, -s, c, shift[0], shift[1]]
}

/** Metres on the ground per PDF point on a drawing at 1:scale. */
export const metresPerPoint = (scale: number) => (scale * 0.0254) / 72

/** The drawing scale (1:n) a page-to-ground map implies, for a drawing measured in PDF points. */
export function impliedScale(m: Affine): number {
  return scaleOf(m) / metresPerPoint(1)
}

/** A rough first place for a new drawing: its middle on the block's, north up, at its stated scale or about the block's size. */
export function firstPlacement(o: Pick<Overlay, 'width' | 'height' | 'kind' | 'scale'>, boundaryWorld: Vec2[]): Affine {
  const xs = boundaryWorld.map(p => p[0])
  const ys = boundaryWorld.map(p => p[1])
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 10)
  const s = o.kind === 'pdf' && o.scale ? metresPerPoint(o.scale) : (span * 2.2) / Math.max(o.width, o.height)
  const mid = centroidOf(boundaryWorld)
  return similarity(s, 0, [mid[0] - (o.width / 2) * s, mid[1] - (o.height / 2) * s])
}

/** The line-up that takes the picked drawing points to the picked survey points. */
export function alignFromPairs(pairs: { from: Vec2; to?: Vec2 }[], base: Affine, keepScale: number | null): Affine {
  const done = pairs.filter((p): p is { from: Vec2; to: Vec2 } => !!p.to)
  if (done.length === 0) return base
  if (done.length === 1) return moveToPair(base, done[0].from, done[0].to)
  const [a, b] = done
  const full = similarityFromPairs(a.from, b.from, a.to, b.to)
  if (!full) return moveToPair(base, a.from, a.to)
  if (!keepScale) return full
  // Keep the stated scale: take the turn from the two pairs and centre the drawing between them.
  const s = metresPerPoint(keepScale)
  const turned = similarity(s, rotationOf(full), [0, 0])
  const midFrom: Vec2 = [(a.from[0] + b.from[0]) / 2, (a.from[1] + b.from[1]) / 2]
  const midTo: Vec2 = [(a.to[0] + b.to[0]) / 2, (a.to[1] + b.to[1]) / 2]
  return moveToPair(turned, midFrom, midTo)
}
