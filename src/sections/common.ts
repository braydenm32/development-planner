// What sections and elevations share: points on a drawing, which way things face on the site,
// where a line runs inside outlines, and the RLs a drawing labels.

import type { Vec2 } from '../lib/geom'
import { pointInPolygon } from '../lib/geom'
import type { Survey } from '../lib/survey'
import { bearingName, type Heightfield, type Terrain } from '../lib/terrain'
import type { Plan } from '../plan/model'

/** What every drawing is drawn from. */
export interface DrawingInput {
  plan: Plan
  survey: Survey
  /** The natural ground (terrain.grid) as surveyed. */
  terrain: Terrain
  /** The finished ground after cut and fill; the natural ground when there is none. */
  finished?: Heightfield
}

/** A point on a drawing: distance across it (m, left to right) and an RL (m). */
export type Pt = [number, number]

/** A box on a drawing: from s0 to s1 across, z0 to z1 up (RLs). */
export interface Box {
  s0: number
  s1: number
  z0: number
  z1: number
}

/** An RL the drawing labels on its left: a floor, the top of the roof. */
export interface LevelMark {
  rl: number
  /** "FFL", "Top of roof". */
  text: string
  /** The floor's name, for floors. */
  name?: string
  /** Where across the drawing it starts (m), for the dashed line out to it. */
  at?: number
}

/** Pier spacing under framed floors and decks (m), as the 3D view draws them. */
export const PIER_SPACING = 1.8

/** A direction in the house frame turned onto the site (x east, y north). */
export function onSite(v: Vec2, rotation: number): Vec2 {
  const t = (rotation * Math.PI) / 180
  return [v[0] * Math.cos(t) - v[1] * Math.sin(t), v[0] * Math.sin(t) + v[1] * Math.cos(t)]
}

/** Compass bearing (degrees clockwise from north) of a direction in the house frame. */
export function bearingOf(v: Vec2, rotation: number): number {
  const s = onSite(v, rotation)
  return ((Math.atan2(s[0], s[1]) * 180) / Math.PI + 360) % 360
}

/** "north-east": the way a direction in the house frame points, in words. */
export const compassWord = (v: Vec2, rotation: number) => bearingName(bearingOf(v, rotation))

/** Where segment a→b crosses the edges of the rings, as parameters from 0 to 1. */
function crossings(a: Vec2, b: Vec2, rings: Vec2[][]): number[] {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const ts: number[] = []
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const p = r[i]
      const q = r[(i + 1) % r.length]
      const ex = q[0] - p[0]
      const ey = q[1] - p[1]
      const den = dx * ey - dy * ex
      if (Math.abs(den) < 1e-12) continue
      const t = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den
      const u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den
      if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t)
    }
  }
  return ts
}

/**
 * Where segment a→b runs inside any of the rings (their union), as spans of distance from a (m).
 * Spans that meet are joined.
 */
export function spansInside(a: Vec2, b: Vec2, rings: Vec2[][]): [number, number][] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (len < 1e-9 || !rings.length) return []
  const ts = [0, 1, ...crossings(a, b, rings)].sort((p, q) => p - q)
  const out: [number, number][] = []
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i]
    const t1 = ts[i + 1]
    if (t1 - t0 < 1e-9) continue
    const m = (t0 + t1) / 2
    const x = a[0] + (b[0] - a[0]) * m
    const y = a[1] + (b[1] - a[1]) * m
    if (!rings.some(r => r.length >= 3 && pointInPolygon(x, y, r))) continue
    const last = out[out.length - 1]
    if (last && Math.abs(last[1] - t0 * len) < 1e-6) last[1] = t1 * len
    else out.push([t0 * len, t1 * len])
  }
  return out
}

/** The parts of spans `a` that are also in spans `b`. */
export function intersectSpans(a: [number, number][], b: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (const [a0, a1] of a)
    for (const [b0, b1] of b) {
      const s0 = Math.max(a0, b0)
      const s1 = Math.min(a1, b1)
      if (s1 - s0 > 1e-6) out.push([s0, s1])
    }
  return out.sort((p, q) => p[0] - q[0])
}

/** The parts of spans `a` outside spans `b`. */
export function subtractSpans(a: [number, number][], b: [number, number][]): [number, number][] {
  let out = a.map(s => [...s] as [number, number])
  for (const [b0, b1] of b) {
    out = out.flatMap(([s0, s1]): [number, number][] => {
      if (b1 <= s0 || b0 >= s1) return [[s0, s1]]
      const keep: [number, number][] = []
      if (b0 - s0 > 1e-6) keep.push([s0, b0])
      if (s1 - b1 > 1e-6) keep.push([b1, s1])
      return keep
    })
  }
  return out
}

/** Points along a span about `step` apart, both ends included, for posts and ground samples. */
export function stations(s0: number, s1: number, step: number): number[] {
  const n = Math.max(1, Math.ceil((s1 - s0) / step - 1e-9))
  return Array.from({ length: n + 1 }, (_, i) => s0 + ((s1 - s0) * i) / n)
}

/** Posts under a span: in from each end, and no further apart than PIER_SPACING. */
export function postStations(s0: number, s1: number): number[] {
  const inset = Math.min(0.2, (s1 - s0) / 2)
  return stations(s0 + inset, s1 - inset, PIER_SPACING)
}

/** RL as drawings write it: two decimals. */
export const rlText = (z: number) => z.toFixed(2)
