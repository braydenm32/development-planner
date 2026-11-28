// Is every bit of a print part thick enough to print? A printer lays plastic in lines of one
// width (the nozzle's, near enough), and anything narrower than two lines side by side prints as
// a single wobbly thread or not at all. So a part is checked level by level: each level's outline
// is shrunk by half the least width and grown back, and whatever doesn't come back was narrower
// than that. Tips that taper away (a roof's ridge, the crest of a slope) aren't counted: only
// strips long enough to be a real piece of the model.

import type { CrossSection, Manifold } from 'manifold-3d'

export interface ThinSpot {
  /** Height of the level it was found at (mm, in the part's own frame). */
  z: number
  /** The strip's box on that level (mm). */
  min: [number, number]
  max: [number, number]
  /** Its area (mm²). */
  area: number
}

/** A strip shorter than this is a chipped corner or a tapering tip, not a thin piece (mm). */
const MIN_RUN = 1.5
/** …and so is one with less plastic in it than this (mm²). */
const MIN_AREA = 0.05

/**
 * The strips of one level's outline that are narrower than `least` (mm), as shapes. The caller
 * frees them.
 */
export function thinStrips(level: CrossSection, least: number): CrossSection[] {
  const r = least / 2 - 0.01
  const shrunk = level.offset(-r, 'Miter', 4)
  // Grown back a hair more, so what's taken away is only what was truly narrower.
  const back = shrunk.offset(r + 0.005, 'Miter', 4)
  const gone = level.subtract(back)
  const out: CrossSection[] = []
  for (const piece of gone.decompose()) {
    const b = piece.bounds()
    const run = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1])
    if (run >= MIN_RUN && piece.area() >= MIN_AREA) out.push(piece)
    else piece.delete()
  }
  shrunk.delete()
  back.delete()
  gone.delete()
  return out
}

/**
 * Where a part (in mm) is narrower than `least` across, looking at levels `step` apart (at most
 * `most` of them). A strip counts only if the level above or below has one over the same spot,
 * so a tip that tapers through one level doesn't.
 */
export function thinSpots(part: Manifold, least: number, opts: { step?: number; most?: number } = {}): ThinSpot[] {
  const box = part.boundingBox()
  const height = box.max[2] - box.min[2]
  if (!(height > 0)) return []
  const step = Math.max(opts.step ?? 0.4, height / (opts.most ?? 120))
  const levels: ThinSpot[][] = []
  for (let z = box.min[2] + step / 2; z < box.max[2]; z += step) {
    const level = part.slice(z)
    const strips = thinStrips(level, least)
    levels.push(
      strips.map(s => {
        const b = s.bounds()
        const spot: ThinSpot = { z, min: [b.min[0], b.min[1]], max: [b.max[0], b.max[1]], area: s.area() }
        s.delete()
        return spot
      }),
    )
    level.delete()
  }
  const over = (a: ThinSpot, b: ThinSpot) => a.min[0] <= b.max[0] && b.min[0] <= a.max[0] && a.min[1] <= b.max[1] && b.min[1] <= a.max[1]
  const out: ThinSpot[] = []
  levels.forEach((spots, i) => {
    for (const s of spots) {
      const near = [...(levels[i - 1] ?? []), ...(levels[i + 1] ?? [])]
      if (near.some(n => over(s, n))) out.push(s)
    }
  })
  return out
}
