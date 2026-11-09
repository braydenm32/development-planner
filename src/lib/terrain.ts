import { bounds, perimeter, pointInPolygon, signedArea, type Vec2 } from './geom'
import type { Survey } from './survey'
import { Tin } from './tin'

/** Regular grid of heights over the site, in the survey's local frame. */
export class Heightfield {
  readonly x0: number
  readonly y0: number
  readonly cell: number
  readonly nx: number
  readonly ny: number
  readonly z: Float32Array

  constructor(x0: number, y0: number, cell: number, nx: number, ny: number, z: Float32Array) {
    this.x0 = x0
    this.y0 = y0
    this.cell = cell
    this.nx = nx
    this.ny = ny
    this.z = z
  }

  at(i: number, j: number): number {
    return this.z[j * this.nx + i]
  }

  /** Bilinear height at (x, y), clamped to the grid. */
  sample(x: number, y: number): number {
    const fx = Math.min(Math.max((x - this.x0) / this.cell, 0), this.nx - 1)
    const fy = Math.min(Math.max((y - this.y0) / this.cell, 0), this.ny - 1)
    const i = Math.min(Math.floor(fx), this.nx - 2)
    const j = Math.min(Math.floor(fy), this.ny - 2)
    const tx = fx - i
    const ty = fy - j
    const a = this.at(i, j)
    const b = this.at(i + 1, j)
    const c = this.at(i, j + 1)
    const d = this.at(i + 1, j + 1)
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
  }
}

export interface SiteStats {
  area: number
  perimeter: number
  minRL: number
  maxRL: number
  /** Mean slope across the site, as a percentage. */
  meanSlopePct: number
  maxSlopePct: number
  /** Compass bearing (degrees, 0 = north) the site generally falls towards. */
  fallBearing: number
}

export interface Terrain {
  grid: Heightfield
  tin: Tin
  stats: SiteStats
}

export interface TerrainOptions {
  /** Grid spacing in metres; chosen automatically when omitted. */
  cellSize?: number
  /**
   * Light smoothing passes. A TIN built from contour vertices alone has flat
   * "terraces" where a triangle's corners all sit on one contour; a couple of
   * passes of a small blur removes them while moving heights by millimetres.
   */
  smoothPasses?: number
  /**
   * Pull the ground back towards surveyed spot levels that the grid and smoothing miss by
   * more than SPOT_TOLERANCE (see honourSpotLevels). On unless set to false.
   */
  honourSpots?: boolean
}

/** A spot level the modelled ground misses by more than this (m) is pulled halfway back to it. */
export const SPOT_TOLERANCE = 0.05
/** How far (m) round a spot level that correction is blended out, so no step appears in the ground. */
export const SPOT_REACH = 1.5

/**
 * A spot level that sits above or below its contours is honoured exactly by the TIN, but the
 * grid it is sampled onto and the light smoothing pull it back towards them. Where the
 * modelled ground misses a spot level by more than SPOT_TOLERANCE, set the ground there to the
 * average of the surveyed level and the smoothed surface, blending the change out smoothly
 * over SPOT_REACH. Spot levels close together are solved together, a few rounds over.
 */
export function honourSpotLevels(grid: Heightfield, spots: { x: number; y: number; z: number }[]): void {
  const { x0, y0, cell, nx, ny, z } = grid
  const targets: { x: number; y: number; target: number }[] = []
  for (const s of spots) {
    const g = grid.sample(s.x, s.y)
    if (Math.abs(g - s.z) > SPOT_TOLERANCE) targets.push({ x: s.x, y: s.y, target: (g + s.z) / 2 })
  }
  const r = Math.ceil(SPOT_REACH / cell)
  for (let round = 0; round < 6; round++) {
    for (const t of targets) {
      const c = t.target - grid.sample(t.x, t.y)
      if (Math.abs(c) < 1e-4) continue
      const ci = (t.x - x0) / cell
      const cj = (t.y - y0) / cell
      for (let j = Math.max(0, Math.floor(cj) - r); j <= Math.min(ny - 1, Math.ceil(cj) + r); j++) {
        for (let i = Math.max(0, Math.floor(ci) - r); i <= Math.min(nx - 1, Math.ceil(ci) + r); i++) {
          const d = Math.hypot((i - ci) * cell, (j - cj) * cell) / SPOT_REACH
          if (d >= 1) continue
          z[j * nx + i] += c * (1 - d * d) ** 2
        }
      }
    }
  }
}

export function terrainPoints(survey: Survey): { x: number; y: number; z: number }[] {
  const pts: { x: number; y: number; z: number }[] = []
  for (const c of survey.contours) for (const p of c.pts) pts.push({ x: p[0], y: p[1], z: p[2] })
  for (const p of survey.levels) pts.push(p)
  return pts
}

export function autoCellSize(boundary: Vec2[]): number {
  const area = Math.abs(signedArea(boundary))
  // Aim for at most ~200k grid nodes; never finer than 0.25 m.
  const cell = Math.sqrt(area / 200_000)
  return Math.max(0.25, Math.ceil(cell * 20) / 20)
}

function smooth(z: Float32Array, nx: number, ny: number): Float32Array {
  const out = new Float32Array(z.length)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let sum = 0
      let n = 0
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj
        if (jj < 0 || jj >= ny) continue
        for (let di = -1; di <= 1; di++) {
          const ii = i + di
          if (ii < 0 || ii >= nx) continue
          // centre weighted 4, edges 2, corners 1
          const w = (di === 0 ? 2 : 1) * (dj === 0 ? 2 : 1)
          sum += z[jj * nx + ii] * w
          n += w
        }
      }
      out[j * nx + i] = sum / n
    }
  }
  return out
}

export function buildTerrain(survey: Survey, opts: TerrainOptions = {}): Terrain {
  const tin = new Tin(terrainPoints(survey))
  const cell = opts.cellSize ?? autoCellSize(survey.boundary)
  const b = bounds(survey.boundary)
  // One cell of margin so the boundary is always strictly inside the grid.
  const x0 = Math.floor(b.minX / cell) * cell - cell
  const y0 = Math.floor(b.minY / cell) * cell - cell
  const nx = Math.ceil((b.maxX - x0) / cell) + 2
  const ny = Math.ceil((b.maxY - y0) / cell) + 2

  let z: Float32Array = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    // Serpentine order keeps the TIN walk short between samples.
    for (let k = 0; k < nx; k++) {
      const i = j % 2 ? nx - 1 - k : k
      z[j * nx + i] = tin.heightAt(x0 + i * cell, y0 + j * cell)
    }
  }
  for (let p = 0; p < (opts.smoothPasses ?? 2); p++) z = smooth(z, nx, ny)

  const grid = new Heightfield(x0, y0, cell, nx, ny, z)
  if (opts.honourSpots !== false) honourSpotLevels(grid, survey.levels)
  return { grid, tin, stats: siteStats(grid, survey.boundary) }
}

function siteStats(grid: Heightfield, boundary: Vec2[]): SiteStats {
  let minRL = Infinity
  let maxRL = -Infinity
  let slopeSum = 0
  let maxSlope = 0
  let n = 0
  let gx = 0
  let gy = 0
  const { nx, ny, cell } = grid
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const x = grid.x0 + i * cell
      const y = grid.y0 + j * cell
      if (!pointInPolygon(x, y, boundary)) continue
      const h = grid.at(i, j)
      if (h < minRL) minRL = h
      if (h > maxRL) maxRL = h
      const dx = (grid.at(i + 1, j) - grid.at(i - 1, j)) / (2 * cell)
      const dy = (grid.at(i, j + 1) - grid.at(i, j - 1)) / (2 * cell)
      const s = Math.hypot(dx, dy)
      slopeSum += s
      if (s > maxSlope) maxSlope = s
      gx += dx
      gy += dy
      n++
    }
  }
  // Downhill is the negative gradient; bearing measured clockwise from north (+y).
  const bearing = (Math.atan2(-gx, -gy) * 180) / Math.PI
  return {
    area: Math.abs(signedArea(boundary)),
    perimeter: perimeter(boundary),
    minRL,
    maxRL,
    meanSlopePct: n ? (slopeSum / n) * 100 : 0,
    maxSlopePct: maxSlope * 100,
    fallBearing: (bearing + 360) % 360,
  }
}

export function bearingName(deg: number): string {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
  return names[Math.round(deg / 45) % 8]
}
