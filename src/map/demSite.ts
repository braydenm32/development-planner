// A block with no survey yet, from the state's maps: the lot's outline from the cadastre and the
// ground from the state's elevation model, for a first look before buying.
//
// It's written as a small DXF (levels on a grid, contours traced through them, and the lot as the
// boundary), like a sketch block or a CSV of spot levels, so everything that reads a survey works on
// it unchanged and a real survey replaces it later through Replace survey. The record says where the
// levels came from (survey.dem), so the app labels them as rough wherever they're used.
//
// The DXF is in a local frame (the lot's south-west corner near 1000, 1000), not MGA, so the survey
// itself never says where the block is: share links carry the survey, and the block's place stays in
// the map record (src/map/model.ts), which they never carry.

import { bounds, pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import type { DemSource, SavedProject } from '../lib/storage'
import type { LayerRole } from '../lib/survey'
import { Heightfield } from '../lib/terrain'
import { contourLines } from '../plan/finishedContours'
import { DEM, ElevationError, groundAt, type DemInfo, type GroundOptions } from './elevation'
import type { GridFit } from './fit'
import { toMga, zoneOf, type EN } from './geo'
import type { MapPlace } from './model'
import type { Lot } from './services'

export const DEM_LAYERS: Record<string, LayerRole> = {
  STATE_DEM_BOUNDARY: 'boundary',
  STATE_DEM_LEVELS: 'levels',
  STATE_DEM_CONTOURS: 'contour',
}

/** Sample about this far apart (m) where the model is fine enough; never closer. */
export const FINEST = 1
/** Ground sampled this far (m) past the lot's lines, so the edges have ground beyond them. */
export const MARGIN = 5
/** At most this many levels for one block (three requests): a big lot is sampled further apart. */
export const MAX_POINTS = 3000
/** Where the lot's south-west corner sits in the local frame. */
const CORNER = 1000

export interface SampleGrid {
  /** MGA of the grid's first point (south-west), and the step between points (m). */
  at: EN
  spacing: number
  nx: number
  ny: number
  /** Row by row from the south, west to east. */
  points: EN[]
}

/**
 * The points to sample over a lot (MGA) and a margin round it: about half the model's pixel apart
 * (bilinear between its posts), no closer than FINEST, and spread further on a big lot so there are
 * never more than `cap`.
 */
export function gridOverLot(lot: EN[], opts: { resolution?: number; margin?: number; cap?: number } = {}): SampleGrid {
  const margin = opts.margin ?? MARGIN
  const cap = opts.cap ?? MAX_POINTS
  const b = bounds(lot)
  const w = b.maxX - b.minX + 2 * margin
  const h = b.maxY - b.minY + 2 * margin
  let spacing = Math.max(FINEST, (opts.resolution ?? DEM.resolution) / 2)
  const count = (s: number) => (Math.floor(w / s) + 1) * (Math.floor(h / s) + 1)
  // Half-metre steps out until it fits.
  if (count(spacing) > cap) spacing = Math.max(spacing, Math.ceil(Math.sqrt((w * h) / cap) * 2) / 2)
  while (count(spacing) > cap) spacing += 0.5
  const nx = Math.floor(w / spacing) + 1
  const ny = Math.floor(h / spacing) + 1
  // Centred on the lot, so the margin is the same each side.
  const at: EN = [(b.minX + b.maxX) / 2 - ((nx - 1) * spacing) / 2, (b.minY + b.maxY) / 2 - ((ny - 1) * spacing) / 2]
  const points: EN[] = []
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) points.push([at[0] + i * spacing, at[1] + j * spacing])
  return { at, spacing, nx, ny, points }
}

const r3 = (n: number) => String(Math.round(n * 1000) / 1000)
const pairs = (...items: (string | number)[]) => items.map(String).join('\n')

/** The contour step for the relief: half metres, or metres on steep ground. Finer would claim more than the model knows. */
export function demInterval(lo: number, hi: number): number {
  return hi - lo > 15 ? 1 : 0.5
}

/** Fill the model's gaps from the nearest level, so contours can be traced across them (the levels themselves leave them out). */
function filled(z: (number | null)[], nx: number): Float32Array {
  const out = new Float32Array(z.length)
  const known: number[] = []
  z.forEach((v, k) => v !== null && known.push(k))
  for (let k = 0; k < z.length; k++) {
    const v = z[k]
    if (v !== null) {
      out[k] = v
      continue
    }
    const i = k % nx
    const j = Math.floor(k / nx)
    let best = Infinity
    for (const q of known) {
      const d = (q % nx - i) ** 2 + (Math.floor(q / nx) - j) ** 2
      if (d < best) {
        best = d
        out[k] = z[q] as number
      }
    }
  }
  return out
}

export interface DemBlock {
  survey: SavedProject
  /** Where the local frame sits in MGA: the map record's fit. */
  fit: GridFit
  zone: number
}

/**
 * The survey record for a lot, from levels sampled on `grid` (null where the model has none).
 * Throws an ElevationError when there's too little ground in the lot to build on.
 */
export function demSurvey(lotMga: EN[], zone: number, grid: SampleGrid, levels: (number | null)[], info: DemInfo = DEM, at = new Date()): DemBlock {
  const b = bounds(lotMga)
  const shift: EN = [Math.floor(b.minX) - CORNER, Math.floor(b.minY) - CORNER]
  const local = ([e, n]: EN): Vec2 => [e - shift[0], n - shift[1]]
  const ring = lotMga.map(local)
  const origin: Vec2 = [Math.floor(Math.min(...ring.map(p => Number(r3(p[0]))))), Math.floor(Math.min(...ring.map(p => Number(r3(p[1])))))]

  const inLot = grid.points.map(p => pointInPolygon(p[0], p[1], lotMga))
  const insideAll = inLot.filter(Boolean).length
  const insideKnown = levels.filter((v, k) => v !== null && inLot[k]).length
  const known = levels.filter(v => v !== null).length
  if (known < 3 || (insideAll > 0 && insideKnown === 0))
    throw new ElevationError('The state’s elevation model has no ground levels for this lot. It may be over water or outside the model.')
  if (insideAll > 0 && insideKnown < insideAll / 2) throw new ElevationError('The state’s elevation model has ground levels for less than half of this lot, too little to build the block on.')

  const ents: string[] = []
  ents.push(pairs(0, 'LWPOLYLINE', 8, 'STATE_DEM_BOUNDARY', 90, ring.length, 70, 1, 38, 0, ...ring.flatMap(([x, y]) => [10, r3(x), 20, r3(y)])))
  let lo = Infinity
  let hi = -Infinity
  grid.points.forEach((p, k) => {
    const z = levels[k]
    if (z === null) return
    lo = Math.min(lo, z)
    hi = Math.max(hi, z)
    const [x, y] = local(p)
    ents.push(pairs(0, 'POINT', 8, 'STATE_DEM_LEVELS', 10, r3(x), 20, r3(y), 30, r3(z)))
  })

  // Contours through the levels, as a surveyor's plan would show them.
  const [x0, y0] = local(grid.at)
  const field = new Heightfield(x0, y0, grid.spacing, grid.nx, grid.ny, filled(levels, grid.nx))
  const step = demInterval(lo, hi)
  for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + 1e-9; i++) {
    const z = Math.round(i * step * 1000) / 1000
    for (const line of contourLines(field, z)) {
      if (line.length < 2) continue
      ents.push(
        [
          pairs(0, 'POLYLINE', 8, 'STATE_DEM_CONTOURS', 66, 1, 10, 0, 20, 0, 30, 0, 70, 8),
          ...line.map(([x, y]) => pairs(0, 'VERTEX', 8, 'STATE_DEM_CONTOURS', 10, r3(x), 20, r3(y), 30, r3(z), 70, 32)),
          pairs(0, 'SEQEND', 8, 'STATE_DEM_CONTOURS'),
        ].join('\n'),
      )
    }
  }
  const dxfText = [pairs(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC'), pairs(0, 'SECTION', 2, 'ENTITIES'), ...ents, pairs(0, 'ENDSEC', 0, 'EOF')].join('\n') + '\n'
  const dem: DemSource = { service: info.id, name: info.name, from: info.from, at: at.toISOString(), spacing: grid.spacing, resolution: info.resolution, accuracy: info.accuracy, credit: info.credit }
  return {
    survey: { fileName: DEM_FILE_NAME, dxfText, roles: { ...DEM_LAYERS }, dem },
    // Pinned at the survey's origin, worked out as src/lib/survey.ts does from the boundary written.
    fit: { from: origin, at: [origin[0] + shift[0], origin[1] + shift[1]], rotation: 0 },
    zone,
  }
}

export const DEM_FILE_NAME = 'Ground levels from NSW elevation data'

export const isDem = (p: Pick<SavedProject, 'dem'> | null | undefined): boolean => !!p?.dem

/** The map record for a block made from the model: on its lot exactly, since the lot is its boundary. */
export function demPlace(block: DemBlock, lot: Lot, before?: MapPlace | null): MapPlace {
  return {
    version: 1,
    zone: block.zone,
    fit: block.fit,
    rms: 0,
    worst: 0,
    areaRatio: 1,
    onGrid: false,
    adjusted: false,
    lot,
    aerial: before?.aerial ?? true,
    opacity: before?.opacity ?? 0.8,
    include: before?.include ?? false,
    planning: before?.lot.id === lot.id ? before.planning : null,
    placedAt: new Date().toISOString(),
  }
}

/** Read the ground for a lot from the model and make its block. Throws an ElevationError with a plain message. */
export async function blockFromLot(lot: Lot, opts: GroundOptions = {}): Promise<DemBlock> {
  const zone = zoneOf(lot.ring[0][0])
  const lotMga = lot.ring.map(p => toMga(p, zone))
  if (Math.abs(signedArea(lotMga)) < 1) throw new ElevationError('That lot has no area on the map, so there’s nothing to build.')
  const grid = gridOverLot(lotMga)
  const levels = await groundAt(grid.points, zone, opts)
  return demSurvey(lotMga, zone, grid, levels)
}
