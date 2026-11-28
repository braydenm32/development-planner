// A sketch block: a site to start drawing on before the survey arrives. It is written as a
// tiny DXF (a rectangular boundary and levels on a plane), so everything that reads a survey
// (the plan, the 3D view, cut and fill, the PDF, the print) works on it unchanged, and the real
// survey replaces it later through Replace survey, with the plan kept.

import type { SavedProject } from '../lib/storage'
import type { LayerRole } from '../lib/survey'

/** Which side of the block meets the street. */
export type StreetSide = 'N' | 'E' | 'S' | 'W'

export interface SketchBlock {
  /** Along the street (m). */
  width: number
  /** From the street to the back (m). */
  depth: number
  /** How far the ground rises from the street to the back (m); negative falls away from the street. */
  fall: number
  /**
   * How far the ground rises from the left side to the right (m), as seen standing on the street
   * looking in; negative falls to the right. Missing (flat across) on blocks sketched before this.
   */
  cross?: number
  street: StreetSide
  /** No size was given: a roomy sheet to start on. */
  rough?: boolean
}

/** RL of the ground at the street edge: an assumed datum, as surveyors use before levels are known. */
export const SKETCH_DATUM = 100
/**
 * A level on a sketch block in everyday words: "2.00 m above the street". The RL 100 at the street
 * is made up, so an RL means nothing to the person yet; it stays in the tooltip for when the
 * survey comes.
 */
export function aboveStreet(rl: number): string {
  const d = Math.round((rl - SKETCH_DATUM) * 100) / 100
  return d === 0 ? 'level with the street' : `${Math.abs(d).toFixed(2)} m ${d > 0 ? 'above' : 'below'} the street`
}

/** The sheet used when no size is given. */
export const ROUGH_SIZE = { width: 20, depth: 40 }
/** The sketch block's south-west corner, in made-up site coordinates. */
const CORNER = { e: 1000, n: 1000 }
const LIMITS = { min: 5, max: 500, fall: 30 }

export const SKETCH_LAYERS: Record<string, LayerRole> = {
  SKETCH_BOUNDARY: 'boundary',
  SKETCH_LEVELS: 'levels',
  SKETCH_CONTOURS: 'contour',
}

const typed = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

/** The start screen's number boxes, in the order they are read: `cross` is the side-to-side fall. */
export const SKETCH_FIELDS = ['width', 'depth', 'fall', 'cross'] as const
export type SketchField = (typeof SKETCH_FIELDS)[number]

/**
 * What is wrong with each typed number, box by box, so every bad box is marked at once and not
 * only the first; empty when the block can be made. A blank width and depth is no size given.
 */
export function sketchProblems(width: string, depth: string, fall: string, cross = ''): Partial<Record<SketchField, string>> {
  const out: Partial<Record<SketchField, string>> = {}
  const size = { width: typed(width), depth: typed(depth) }
  for (const name of ['width', 'depth'] as const) {
    const v = size[name]
    const other = size[name === 'width' ? 'depth' : 'width']
    if (v === null) {
      if (other !== null) out[name] = 'Type both the width and the depth, or leave both empty to set them later.'
    } else if (!Number.isFinite(v) || v < LIMITS.min || v > LIMITS.max) out[name] = `The block’s ${name} needs to be between ${LIMITS.min} and ${LIMITS.max} m.`
  }
  const f = typed(fall) ?? 0
  if (!Number.isFinite(f) || Math.abs(f) > LIMITS.fall) out.fall = `The fall needs to be within ${LIMITS.fall} m.`
  const c = typed(cross) ?? 0
  if (!Number.isFinite(c) || Math.abs(c) > LIMITS.fall) out.cross = `The fall from side to side needs to be within ${LIMITS.fall} m.`
  return out
}

/** Check typed numbers; `null` for a blank width and depth (no size given). Throws a plain message: the first box's. */
export function readSketchSize(width: string, depth: string, fall: string, street: StreetSide, cross = ''): SketchBlock {
  const problems = sketchProblems(width, depth, fall, cross)
  for (const name of SKETCH_FIELDS) if (problems[name]) throw new Error(problems[name])
  const w = typed(width)
  const d = typed(depth)
  const f = typed(fall) ?? 0
  // Kept only when the block falls sideways, so a block that doesn't reads as it always has.
  const c = typed(cross) ?? 0
  const side = c ? { cross: c } : {}
  if (w === null || d === null) return { ...ROUGH_SIZE, fall: f, ...side, street, rough: true }
  return { width: w, depth: d, fall: f, ...side, street }
}

/** Which way a sketch block falls, as the start screen asks it: one way, or two (front to back and side to side). */
export type FallWay = 'flat' | 'front' | 'back' | 'left' | 'right' | 'both'

/** What is picked and typed for the fall: `amount` for one way; for two, `front` and `side` with which way each goes. */
export interface FallChoice {
  way: FallWay
  amount: string
  /** Two ways: how much it falls front to back, and to which end. */
  front: string
  frontTo: 'front' | 'back'
  /** Two ways: how much it falls side to side, and to which side. */
  side: string
  sideTo: 'left' | 'right'
}

export const FLAT: FallChoice = { way: 'flat', amount: '', front: '', frontTo: 'front', side: '', sideTo: 'left' }

/** A typed amount with the sign the way gives it ("2" to the back is "-2"); a minus typed as well is the same way. */
function signed(amount: string, down: boolean): string {
  const t = amount.trim().replace(/^[-−]/, '')
  return t === '' ? '' : down ? `-${t}` : t
}

/**
 * The fall picked, as the two numbers a sketch block keeps: `fall` rises from the street to the back,
 * `cross` from the left to the right (standing on the street). Falling to the street (the front)
 * is the back rising; falling to the left is the right rising.
 */
export function fallNumbers(c: FallChoice): { fall: string; cross: string } {
  switch (c.way) {
    case 'flat':
      return { fall: '', cross: '' }
    case 'front':
      return { fall: signed(c.amount, false), cross: '' }
    case 'back':
      return { fall: signed(c.amount, true), cross: '' }
    case 'left':
      return { fall: '', cross: signed(c.amount, false) }
    case 'right':
      return { fall: '', cross: signed(c.amount, true) }
    case 'both':
      return { fall: signed(c.front, c.frontTo === 'back'), cross: signed(c.side, c.sideTo === 'right') }
  }
}

/** The choice that gives a sketch block's fall back, for changing it: one way when it falls one way. */
export function fallChoiceOf(b: Pick<SketchBlock, 'fall' | 'cross'>): FallChoice {
  const f = b.fall || 0
  const c = b.cross || 0
  const abs = (n: number) => String(Math.abs(n))
  const both: FallChoice = { ...FLAT, front: f ? abs(f) : '', frontTo: f < 0 ? 'back' : 'front', side: c ? abs(c) : '', sideTo: c < 0 ? 'right' : 'left' }
  if (f && c) return { ...both, way: 'both' }
  if (f) return { ...both, way: f > 0 ? 'front' : 'back', amount: abs(f) }
  if (c) return { ...both, way: c > 0 ? 'left' : 'right', amount: abs(c) }
  return FLAT
}

const r3 = (n: number) => Math.round(n * 1000) / 1000
const fmtM = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export const SIDE_NAME: Record<StreetSide, string> = { N: 'north', E: 'east', S: 'south', W: 'west' }

/** "15 × 30 m, flat, street to the south". */
export function describeSketch(b: SketchBlock): string {
  // With no size given the block is still drawn, at the default: say the size it has, and that it wasn't chosen.
  const size = b.rough ? `${b.width} × ${b.depth} m (default size, not set yet)` : `${b.width} × ${b.depth} m`
  const fall = b.fall ? `${Math.abs(b.fall)} m ${b.fall > 0 ? 'up' : 'down'} to the back` : b.cross ? '' : 'flat'
  // Across: the low side, as it's picked ("falls 1 m to the left", standing on the street).
  const cross = b.cross ? `${fall ? ' and ' : ''}${Math.abs(b.cross)} m down to the ${b.cross > 0 ? 'left' : 'right'}` : ''
  return `${size}, ${fall}${cross}, street to the ${SIDE_NAME[b.street]}`
}

/** "Sketch block 15 × 30 m", or "Sketch block (size not set)". */
export function sketchName(b: SketchBlock): string {
  return b.rough ? 'Sketch block (size not set)' : `Sketch block ${fmtM(b.width)} × ${fmtM(b.depth)} m`
}

/** The block's extent east-west and north-south: the width runs along the street. */
function extent(b: SketchBlock): { x: number; y: number } {
  return b.street === 'N' || b.street === 'S' ? { x: b.width, y: b.depth } : { x: b.depth, y: b.width }
}

/**
 * Ground level at a point (local x east, y north of the south-west corner): the datum in the middle
 * of the street side, rising `fall` to the back and `cross` from the left side to the right.
 */
export function sketchGround(b: SketchBlock, x: number, y: number): number {
  const { x: X, y: Y } = extent(b)
  const fromStreet = b.street === 'S' ? y : b.street === 'N' ? Y - y : b.street === 'W' ? x : X - x
  const ground = SKETCH_DATUM + (b.fall * fromStreet) / b.depth
  if (!b.cross) return ground
  // Left as seen from the street, looking in: from the south that's west, from the north east.
  const fromLeft = b.street === 'S' ? x : b.street === 'N' ? X - x : b.street === 'W' ? Y - y : y
  return ground + b.cross * (fromLeft / b.width - 0.5)
}

/** Where a level `z` crosses the block (a plane), as a line from one side to another, or null. */
function contourAcross(b: SketchBlock, z: number): [number, number][] | null {
  const { x: X, y: Y } = extent(b)
  const corners: [number, number][] = [
    [0, 0],
    [X, 0],
    [X, Y],
    [0, Y],
  ]
  const pts: [number, number][] = []
  for (let i = 0; i < 4; i++) {
    const p = corners[i]
    const q = corners[(i + 1) % 4]
    const zp = sketchGround(b, p[0], p[1])
    const zq = sketchGround(b, q[0], q[1])
    if ((zp - z) * (zq - z) > 0 || zp === zq) continue
    const t = (z - zp) / (zq - zp)
    const at: [number, number] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
    if (!pts.some(s => Math.hypot(s[0] - at[0], s[1] - at[1]) < 1e-6)) pts.push(at)
  }
  return pts.length >= 2 ? [pts[0], pts[1]] : null
}

function pairs(...items: (string | number)[]): string {
  return items.map(String).join('\n')
}

/** The sketch as DXF text: a closed boundary, levels at its corners (and a little past them), and contours if it slopes. */
export function sketchDxf(b: SketchBlock): string {
  const { x: X, y: Y } = extent(b)
  const ents: string[] = []
  const at = (x: number, y: number): [number, number] => [r3(CORNER.e + x), r3(CORNER.n + y)]
  const ring: [number, number][] = [at(0, 0), at(X, 0), at(X, Y), at(0, Y)]
  ents.push(pairs(0, 'LWPOLYLINE', 8, 'SKETCH_BOUNDARY', 90, 4, 70, 1, ...ring.flatMap(([e, n]) => [10, e, 20, n])))
  // Levels a little past the corners too, so the ground is the same plane right to the edge.
  const pad = 3
  for (const [xs, ys] of [
    [
      [0, X],
      [0, Y],
    ],
    [
      [-pad, X + pad],
      [-pad, Y + pad],
    ],
  ])
    for (const x of xs)
      for (const y of ys) {
        const [e, n] = at(x, y)
        ents.push(pairs(0, 'POINT', 8, 'SKETCH_LEVELS', 10, e, 20, n, 30, r3(sketchGround(b, x, y))))
      }
  // Contours across the block: parallel to the street, or slanting when it falls sideways too.
  const levels = b.cross ? ring.map((_, i) => sketchGround(b, [0, X, X, 0][i], [0, 0, Y, Y][i])) : [SKETCH_DATUM, SKETCH_DATUM + b.fall]
  const lo = Math.min(...levels)
  const hi = Math.max(...levels)
  const step = hi - lo >= 2 ? 0.5 : hi - lo >= 0.5 ? 0.25 : 0.1
  for (let c = Math.ceil((lo + 1e-6) / step) * step; c < hi - 1e-6; c += step) {
    const t = ((c - SKETCH_DATUM) / b.fall) * b.depth // distance from the street
    const across = b.cross ? contourAcross(b, c) : null
    if (b.cross && !across) continue
    const line: [number, number][] = across
      ? across.map(([x, y]) => at(x, y))
      : b.street === 'S'
        ? [at(0, t), at(X, t)]
        : b.street === 'N'
          ? [at(0, Y - t), at(X, Y - t)]
          : b.street === 'W'
            ? [at(t, 0), at(t, Y)]
            : [at(X - t, 0), at(X - t, Y)]
    const z = r3(c)
    ents.push(
      [
        pairs(0, 'POLYLINE', 8, 'SKETCH_CONTOURS', 66, 1, 10, 0, 20, 0, 30, 0, 70, 8),
        ...line.map(([e, n]) => pairs(0, 'VERTEX', 8, 'SKETCH_CONTOURS', 10, e, 20, n, 30, z, 70, 32)),
        pairs(0, 'SEQEND', 8, 'SKETCH_CONTOURS'),
      ].join('\n'),
    )
  }
  return [pairs(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC'), pairs(0, 'SECTION', 2, 'ENTITIES'), ...ents, pairs(0, 'ENDSEC', 0, 'EOF')].join('\n')
}

/** The survey record for a sketch block. */
export function sketchSurvey(b: SketchBlock): SavedProject {
  return { fileName: sketchName(b), dxfText: sketchDxf(b), roles: { ...SKETCH_LAYERS }, sketch: { ...b } }
}

export const isSketch = (p: Pick<SavedProject, 'sketch'> | null | undefined): boolean => !!p?.sketch

/** A sketch block roomy enough for a plan `w` × `d` metres across, with space round it. */
export function sketchAround(w: number, d: number): SketchBlock {
  const fit = (v: number) => Math.min(LIMITS.max, Math.max(12, Math.ceil(v + 12)))
  return { width: fit(w), depth: fit(d), fall: 0, street: 'S' }
}

/**
 * Where the chip goes on a computer's plan, from the room in the top row between the floor's chip
 * and the compass (px) and its own width with and without the block's size: in the row whole, or
 * as "Sketch block" and its button alone; with no room there, a line under the compass, except
 * while the selection's card is open, when it would sit on the house and take the clicks meant
 * for it, so it waits (it's in Site › Block too) until the card closes.
 */
export function chipFit(room: number, full: number, short: number, inspector: boolean): 'row' | 'short' | 'drop' | 'off' {
  if (full <= room) return 'row'
  if (short <= room) return 'short'
  return inspector ? 'off' : 'drop'
}
