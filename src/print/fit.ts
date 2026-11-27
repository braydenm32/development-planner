// What the 3D print panel suggests about size: the largest scale at which the terrain fits the
// bed in one piece, and, when the model would take more than a litre of plastic, the scale that
// brings it under. Plastic goes with the cube of the scale (the base and thinnest walls don't
// scale, so it's a little rough); a footprint goes with the scale.

import { pointInPolygon } from '../lib/geom'
import { fromSite } from '../plan/model'
import { planBounds } from '../plan/ops'
import { fitsBed, type PrintInput, type PrintModel, type PrintSettings } from './build'

/** The scales the panel offers, largest model first. */
export const PRINT_SCALES = [50, 75, 100, 150, 200, 250]

/** A litre, in cm³: above it, the panel warns. */
export const LITRE = 1000

/** The largest model (smallest 1:n) at which a footprint now `size` mm at 1:`scale` fits the bed in one piece; null if none does. */
export function scaleThatFits(size: [number, number], scale: number, bed: Pick<PrintSettings, 'bedX' | 'bedY'>): number | null {
  for (const s of PRINT_SCALES) if (fitsBed((size[0] * scale) / s, (size[1] * scale) / s, bed)) return s
  return null
}

/** The largest model, smaller than this one, whose plastic comes under `limit` cm³; null if it's under already or none does. */
export function scaleUnder(volume: number, scale: number, limit = LITRE): number | null {
  if (volume <= limit) return null
  for (const s of PRINT_SCALES) if (s > scale && volume * (scale / s) ** 3 <= limit) return s
  return null
}

/** The plastic in every part, cm³. */
export const plasticOf = (m: Pick<PrintModel, 'parts'>) => m.parts.reduce((t, p) => t + p.volume, 0)

// How build.ts hollows the terrain, near enough for an estimate: pockets cover about this share of
// the ground (20 mm cells with 1.6 mm ribs), each roofed this far (m, on the ground) below it.
const HOLLOW_POCKETS = 0.85
const HOLLOW_SKIN = 0.25

/**
 * About how much plastic the model would take with only the ground around the house (out to the
 * settings' margin), worked out from the model built with the whole block: the house's parts are
 * the same, and the terrain's plastic goes with the ground it covers and how thick it stands above
 * its own lowest point. So the panel's hint says what the smaller terrain really saves, not that
 * it comes under a litre when it doesn't. Null when there's no terrain or nothing drawn to crop to.
 */
export function aroundHouseVolume(model: Pick<PrintModel, 'parts'>, input: Pick<PrintInput, 'plan' | 'survey' | 'ground'>, settings: Pick<PrintSettings, 'scale' | 'base' | 'margin' | 'hollow'>): number | null {
  const terrain = model.parts.filter(p => p.kind === 'terrain').reduce((t, p) => t + p.volume, 0)
  const b = planBounds(input.plan)
  if (!(terrain > 0) || !b) return null
  const m = Math.max(0, settings.margin)
  const f = input.ground
  const o = input.survey.origin
  const all: number[] = []
  const near: number[] = []
  for (let j = 0; j < f.ny; j++) {
    for (let i = 0; i < f.nx; i++) {
      const p: [number, number] = [f.x0 + i * f.cell, f.y0 + j * f.cell]
      if (!pointInPolygon(p[0], p[1], input.survey.boundary)) continue
      const z = f.z[j * f.nx + i]
      all.push(z)
      const h = fromSite(p, input.plan.placement, o)
      if (h[0] >= b.minX - m && h[0] <= b.maxX + m && h[1] >= b.minY - m && h[1] <= b.maxY + m) near.push(z)
    }
  }
  if (!all.length || !near.length) return null
  // Each stands on a solid base under its own lowest point (m, on the ground). Hollowed, the
  // pockets take out most of what lies deeper than the skin under the ground, between the ribs.
  const mm = settings.scale / 1000
  const base = settings.base * mm
  const skin = HOLLOW_SKIN + 2 * mm
  const plastic = (zs: number[]) => {
    let low = Infinity
    for (const z of zs) low = Math.min(low, z)
    let v = 0
    for (const z of zs) {
      const h = z - low + base
      v += settings.hollow && h - skin >= 3 * mm ? h - HOLLOW_POCKETS * (h - skin) : h
    }
    return v
  }
  const share = plastic(near) / plastic(all)
  return plasticOf(model) - terrain + terrain * Math.min(1, share)
}

/** A part and the pieces it was cut into, as the panel lists them. */
export interface PartGroup {
  id: string
  name: string
  kind: PrintModel['parts'][number]['kind']
  ids: string[]
  /** The pieces' names, when it was cut ("A1", "B1"…). */
  pieces: { id: string; name: string; size: [number, number, number] }[]
  /** The whole part's bounding box, and the biggest piece's footprint (mm). */
  size: [number, number, number]
  biggest: [number, number]
  volume: number
}

/** The parts, each with its pieces under it: "Terrain · 4 tiles" rather than four rows. */
export function partGroups(m: Pick<PrintModel, 'parts'>): PartGroup[] {
  const out = new Map<string, PartGroup>()
  const boxes = new Map<string, number[]>()
  for (const p of m.parts) {
    const key = p.of ?? p.id
    const size: [number, number, number] = [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]]
    let g = out.get(key)
    if (!g) {
      // A piece's name is its part's and its label: "Ground floor A1".
      g = { id: key, name: p.of ? p.name.replace(/ [A-Z]\d+$/, '') : p.name, kind: p.kind, ids: [], pieces: [], size, biggest: [0, 0], volume: 0 }
      out.set(key, g)
      boxes.set(key, [...p.min, ...p.max])
    }
    const box = boxes.get(key)!
    for (let i = 0; i < 3; i++) {
      box[i] = Math.min(box[i], p.min[i])
      box[i + 3] = Math.max(box[i + 3], p.max[i])
    }
    g.size = [box[3] - box[0], box[4] - box[1], box[5] - box[2]]
    g.ids.push(p.id)
    g.volume += p.volume
    if (p.of) g.pieces.push({ id: p.id, name: p.name.slice(g.name.length + 1), size })
    if (size[0] * size[1] > g.biggest[0] * g.biggest[1]) g.biggest = [size[0], size[1]]
  }
  return [...out.values()]
}
