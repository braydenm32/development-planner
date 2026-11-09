// Where the print preview puts each part, assembled or apart, and how far back the camera stands
// to see them all. Apart lifts the floors and roof off one another, so the camera re-fits to the
// lifted stack whenever the view switches (page forensics G2).

import type { PrintModel, PrintPart } from './build'

export type Vec3 = [number, number, number]

/** How far each floor and roof is lifted above the one below, apart (mm, as printed). */
export const APART_LIFT = 25
/** How far tiles of the terrain, and pieces of a floor or roof cut to fit the bed, spread from each other, apart (mm). */
export const APART_SPREAD = 6

/**
 * How far each part moves, in the preview's scene (x east, y up, z south), by part id.
 * Assembled, nothing moves.
 */
export function partOffsets(model: Pick<PrintModel, 'parts'>, apart: boolean): Map<string, Vec3> {
  const out = new Map<string, Vec3>()
  // A part, or the part its pieces were cut from: the pieces of one floor lift off together.
  const whole = (p: PrintPart) => p.of ?? p.id
  const groups = new Map<string, PrintPart[]>()
  for (const p of model.parts) groups.set(whole(p), [...(groups.get(whole(p)) ?? []), p])
  const lowest = (g: PrintPart[]) => Math.min(...g.map(p => p.min[2]))
  // Floors and roofs in order from the bottom up, each lifted further than the last.
  const stack = [...groups.entries()]
    .filter(([, g]) => g[0].kind !== 'terrain')
    .sort((a, b) => lowest(a[1]) - lowest(b[1]))
    .map(([id]) => id)
  const tiles = model.parts.filter(p => p.kind === 'terrain')
  // Pieces of one thing spread out from the middle of that thing (the terrain's tiles stay as one group).
  const centre = (g: PrintPart[]) => g.reduce((c, t) => [c[0] + (t.min[0] + t.max[0]) / 2 / g.length, c[1] + (t.min[1] + t.max[1]) / 2 / g.length], [0, 0])
  const spread = (p: PrintPart, g: PrintPart[]): [number, number] => {
    if (g.length < 2) return [0, 0]
    const c = centre(g)
    return [Math.sign((p.min[0] + p.max[0]) / 2 - c[0]) * APART_SPREAD, -Math.sign((p.min[1] + p.max[1]) / 2 - c[1]) * APART_SPREAD]
  }
  for (const p of model.parts) {
    let offset: Vec3 = [0, 0, 0]
    if (apart) {
      const rank = stack.indexOf(whole(p))
      const [sx, sz] = spread(p, p.kind === 'terrain' ? tiles : groups.get(whole(p))!)
      offset = [sx, rank >= 0 ? (rank + 1) * APART_LIFT : 0, sz]
    }
    out.set(p.id, offset)
  }
  return out
}

/** The box round every part where the preview shows it, in scene coordinates. */
export function sceneBox(model: Pick<PrintModel, 'parts'>, apart: boolean): { min: Vec3; max: Vec3 } {
  const offsets = partOffsets(model, apart)
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const p of model.parts) {
    const o = offsets.get(p.id) ?? [0, 0, 0]
    // Print (x, y, z up) to scene (x, z up as y, −y as z).
    const lo: Vec3 = [p.min[0] + o[0], p.min[2] + o[1], -p.max[1] + o[2]]
    const hi: Vec3 = [p.max[0] + o[0], p.max[2] + o[1], -p.min[1] + o[2]]
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], lo[i])
      max[i] = Math.max(max[i], hi[i])
    }
  }
  return { min, max }
}

/**
 * How far from the box's centre the camera stands so the whole box shows, for a vertical field
 * of view `fov` (degrees) on a canvas `aspect` wide per unit high, with a little room round it.
 */
export function fitDistance(box: { min: Vec3; max: Vec3 }, fov: number, aspect: number, margin = 1.08): number {
  const r = 0.5 * Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2])
  const v = (fov * Math.PI) / 180
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect)
  return (Math.max(r, 1) / Math.sin(Math.min(v, h) / 2)) * margin
}

/** Pixels of the canvas covered at each edge (the new layout's floating panels). */
export interface Covered {
  l: number
  r: number
  t: number
  b: number
}

/**
 * The part of a `width` × `height` canvas the panels leave free: how far the view's middle moves
 * to sit in it (`dx`, `dy`, pixels, for the camera's view offset), its shape, and the share of the
 * camera's vertical field of view `fov` (degrees) it sees. At least 120 px stays free each way.
 */
export function freeFrame(width: number, height: number, covered: Covered, fov: number): { dx: number; dy: number; aspect: number; fov: number } {
  const w = Math.max(width, 1)
  const h = Math.max(height, 1)
  const freeW = Math.max(w - covered.l - covered.r, Math.min(w, 120))
  const freeH = Math.max(h - covered.t - covered.b, Math.min(h, 120))
  const half = Math.atan(Math.tan((fov * Math.PI) / 360) * (freeH / h))
  return { dx: (covered.r - covered.l) / 2, dy: (covered.b - covered.t) / 2, aspect: freeW / freeH, fov: (2 * half * 180) / Math.PI }
}
