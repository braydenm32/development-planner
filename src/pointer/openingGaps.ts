// Where a door or window sits in its wall, as two gaps people can read off a tape: from each edge
// of the opening to the inside corner at that end of the wall (the face of the wall that turns off
// there, or the wall's own end where nothing does). Both show on the plan beside the opening and
// both can be typed in its card, so "which end is the start?" never has to be asked.

import type { ReactNode } from 'react'
import type { Vec2 } from '../lib/geom'
import { pointOnWall, type Opening, type Wall } from '../plan/model'
import { wallClear } from '../plan/openingFit'

export interface OpeningGap {
  /** Clear distance from the opening's edge to the corner (m); negative when it cuts into the corner. */
  gap: number
  /** The corner, and the opening's edge, on the wall's centreline. */
  from: Vec2
  to: Vec2
}

export interface OpeningGaps {
  /** Towards the wall's `a` end, and its `b` end. */
  a: OpeningGap
  b: OpeningGap
  /** The widest gap either can be: the wall's clear run less the opening. */
  max: number
}

export function openingGaps(walls: Wall[], w: Wall, o: Pick<Opening, 'offset' | 'width'>): OpeningGaps {
  const run = wallClear(walls, w)
  const near = o.offset - o.width / 2
  const far = o.offset + o.width / 2
  return {
    a: { gap: near - run.from, from: pointOnWall(w, run.from), to: pointOnWall(w, near) },
    b: { gap: run.to - far, from: pointOnWall(w, far), to: pointOnWall(w, run.to) },
    max: run.to - run.from - o.width,
  }
}

/** The opening's offset along its wall for a gap typed at one end. */
export function offsetForGap(walls: Wall[], w: Wall, o: Pick<Opening, 'width'>, end: 'a' | 'b', gap: number): number {
  const run = wallClear(walls, w)
  return end === 'a' ? run.from + gap + o.width / 2 : run.to - gap - o.width / 2
}

/** The two gaps written along the wall beside the opening, with the plan's own way of writing a length (`dim`). */
export function openingGapDims(walls: Wall[], w: Wall, o: Pick<Opening, 'offset' | 'width'>, dim: (a: Vec2, b: Vec2, offset: number, key: string) => ReactNode, key: string): ReactNode[] {
  const g = openingGaps(walls, w, o)
  return [g.a.gap > 0.001 ? dim(g.a.from, g.a.to, 0, `${key}-gap-a`) : null, g.b.gap > 0.001 ? dim(g.b.from, g.b.to, 0, `${key}-gap-b`) : null]
}
