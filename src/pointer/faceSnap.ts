// Wall faces to snap to. Walls are kept by their centrelines, which is what drawing snaps to; a
// tape reads face to face, so the Measure and Sketch tools snap to the faces and their corners too.

import type { Vec2 } from '../lib/geom'
import type { Guides } from '../plan/snap'

/** The corners and sides of the walls' outlines (wallPolygons), as snap points and lines, with any other guides. */
export function faceGuides(outlines: Iterable<Vec2[]>, also?: Guides): Guides {
  const points: Vec2[] = [...(also?.points ?? [])]
  const segs: [Vec2, Vec2][] = [...(also?.segs ?? [])]
  for (const poly of outlines) {
    poly.forEach((p, i) => {
      points.push(p)
      segs.push([p, poly[(i + 1) % poly.length]])
    })
  }
  return { points, segs }
}
