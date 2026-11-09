// Setback dimensions: a line from the house to each side of the block, with its length. The plan
// canvas and the PDF site plan both draw them from here, and the distances come from
// boundaryClearances, the same helper the Place panel's typed setbacks use (CALM 8).

import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Placement } from './model'
import { boundaryClearances } from './placement'

/**
 * Under this (m) the house is on the boundary and no line is drawn. One rule for the plan and
 * the PDF, which used to differ (5 mm on the plan, 10 mm on the PDF; numbers audit R12).
 */
export const SETBACK_MIN = 0.01

/** A setback as the Place panel's field shows it: whole millimetres (numbers audit, `Num` mm). */
export const setbackText = (dist: number) => Math.round(dist * 1000).toString()

export interface SetbackDim {
  /** Which side of the block, by its index in the boundary. */
  side: number
  /** Which way the side faces, e.g. "north". */
  name: string
  /** Shortest distance from the house to the side (m). */
  dist: number
  /** The closest points on the house and on the boundary, in the survey's local frame. */
  from: Vec2
  to: Vec2
  /** The length to write on it, in mm. */
  text: string
}

/**
 * A dimension from the house (its outline rings, in the house frame) to each side of the block,
 * leaving out sides the house reaches.
 */
export function setbackDims(rings: Vec2[][], pl: Placement, survey: Survey): SetbackDim[] {
  return boundaryClearances(rings, pl, survey).flatMap((c, side) =>
    c.dist < SETBACK_MIN ? [] : [{ side, name: c.name, dist: c.dist, from: c.from, to: c.to, text: setbackText(c.dist) }],
  )
}
