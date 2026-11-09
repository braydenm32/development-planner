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
  street: StreetSide
  /** No size was given: a roomy sheet to start on. */
  rough?: boolean
}

/** RL of the ground at the street edge: an assumed datum, as surveyors use before levels are known. */
export const SKETCH_DATUM = 100
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

/** Check typed numbers; `null` for a blank width and depth (no size given). Throws a plain message. */
export function readSketchSize(width: string, depth: string, fall: string, street: StreetSide): SketchBlock {
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
  const w = num(width)
  const d = num(depth)
  const f = num(fall) ?? 0
  if (w === null && d === null) return { ...ROUGH_SIZE, fall: f, street, rough: true }
  if (w === null || d === null) throw new Error('Type both the width and the depth, or leave both empty to set them later.')
  for (const [v, name] of [
    [w, 'width'],
    [d, 'depth'],
  ] as const) {
    if (!Number.isFinite(v) || v < LIMITS.min || v > LIMITS.max) throw new Error(`The block’s ${name} needs to be between ${LIMITS.min} and ${LIMITS.max} m.`)
  }
  if (!Number.isFinite(f) || Math.abs(f) > LIMITS.fall) throw new Error(`The fall needs to be within ${LIMITS.fall} m.`)
  return { width: w, depth: d, fall: f, street }
}

const r3 = (n: number) => Math.round(n * 1000) / 1000
const fmtM = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export const SIDE_NAME: Record<StreetSide, string> = { N: 'north', E: 'east', S: 'south', W: 'west' }

/** "15 × 30 m, flat, street to the south". */
export function describeSketch(b: SketchBlock): string {
  const size = b.rough ? 'size not set yet' : `${b.width} × ${b.depth} m`
  const fall = b.fall ? `${Math.abs(b.fall)} m ${b.fall > 0 ? 'up' : 'down'} to the back` : 'flat'
  return `${size}, ${fall}, street to the ${SIDE_NAME[b.street]}`
}

/** "Sketch block 15 × 30 m", or "Sketch block (size not set)". */
export function sketchName(b: SketchBlock): string {
  return b.rough ? 'Sketch block (size not set)' : `Sketch block ${fmtM(b.width)} × ${fmtM(b.depth)} m`
}

/** The block's extent east-west and north-south: the width runs along the street. */
function extent(b: SketchBlock): { x: number; y: number } {
  return b.street === 'N' || b.street === 'S' ? { x: b.width, y: b.depth } : { x: b.depth, y: b.width }
}

/** Ground level at a point (local x east, y north of the south-west corner): the datum at the street, rising `fall` to the back. */
export function sketchGround(b: SketchBlock, x: number, y: number): number {
  const { x: X, y: Y } = extent(b)
  const fromStreet = b.street === 'S' ? y : b.street === 'N' ? Y - y : b.street === 'W' ? x : X - x
  return SKETCH_DATUM + (b.fall * fromStreet) / b.depth
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
  // Contours across the block, parallel to the street.
  const lo = Math.min(SKETCH_DATUM, SKETCH_DATUM + b.fall)
  const hi = Math.max(SKETCH_DATUM, SKETCH_DATUM + b.fall)
  const step = hi - lo >= 2 ? 0.5 : hi - lo >= 0.5 ? 0.25 : 0.1
  for (let c = Math.ceil((lo + 1e-6) / step) * step; c < hi - 1e-6; c += step) {
    const t = ((c - SKETCH_DATUM) / b.fall) * b.depth // distance from the street
    const line: [number, number][] =
      b.street === 'S' ? [at(0, t), at(X, t)] : b.street === 'N' ? [at(0, Y - t), at(X, Y - t)] : b.street === 'W' ? [at(t, 0), at(t, Y)] : [at(X - t, 0), at(X - t, Y)]
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
