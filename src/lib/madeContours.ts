// Contours for a survey that has none of its own: spot levels from a CSV or LandXML file (or a DXF
// of points). Without them the plan shows colour bands only, 3D shows dots, the key lists a
// Contour that isn't there and Pick a contour has nothing to pick. So they're drawn from the
// ground the levels make (the terrain grid), every 0.5 m with the whole metres major, the way a
// surveyor would draw them, and marked as made here so nothing claims the file had them.

import { contourLines } from '../plan/finishedContours'
import { pointInPolygon, type Vec2 } from './geom'
import type { Contour, Survey } from './survey'
import type { Heightfield } from './terrain'

/** The layer name made contours carry, where a layer is shown. */
export const MADE_LAYER = 'Contours from the spot levels'

/** The step between made contours, and between the major (labelled) ones: 0.5 m and 1 m, wider on a steep block so they don't crowd. */
export function madeInterval(range: number): { minor: number; major: number } {
  if (range > 40) return { minor: 2, major: 10 }
  if (range > 20) return { minor: 1, major: 5 }
  return { minor: 0.5, major: 1 }
}

const length = (pts: Vec2[]) => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0)

/** Contours of the ground over the block (with a little round it), from the terrain grid. */
export function contoursFromGrid(grid: Heightfield, boundary: Vec2[]): Contour[] {
  let lo = Infinity
  let hi = -Infinity
  for (let j = 0; j < grid.ny; j++)
    for (let i = 0; i < grid.nx; i++) {
      const x = grid.x0 + i * grid.cell
      const y = grid.y0 + j * grid.cell
      if (!pointInPolygon(x, y, boundary)) continue
      const z = grid.z[j * grid.nx + i]
      lo = Math.min(lo, z)
      hi = Math.max(hi, z)
    }
  if (!(hi > lo)) return []
  const { minor, major } = madeInterval(hi - lo)
  const vals = Float64Array.from(grid.z)
  const out: Contour[] = []
  for (let k = Math.ceil(lo / minor); k * minor <= hi; k++) {
    // Rounded so 45.5 is 45.5, not 45.49999.
    const z = Math.round(k * minor * 1000) / 1000
    const isMajor = Math.abs(z / major - Math.round(z / major)) < 1e-6
    for (const line of contourLines(grid, z, vals)) {
      // Scraps of a couple of cells are the grid's noise on nearly level ground.
      if (line.length < 2 || length(line) < 2 * grid.cell) continue
      out.push({ layer: MADE_LAYER, z, major: isMajor, pts: line.map(([x, y]) => [x, y, z]) })
    }
  }
  return out
}

/** The survey with contours made from the ground when it has none of its own (the same survey when it has). */
export function withMadeContours(survey: Survey, grid: Heightfield): Survey {
  if (survey.contours.length) return survey
  const contours = contoursFromGrid(grid, survey.boundary)
  return contours.length ? { ...survey, contours, madeContours: true } : survey
}
