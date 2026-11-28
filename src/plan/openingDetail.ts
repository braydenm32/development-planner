// What a door or window is made of in 3D, by its kind: the frame round the opening, the leaf or
// leaves (shown closed), glass, a sliding door's track, a window's sill and the ribs of a garage
// door. Each piece is a block standing on a four-cornered footprint, in the opening's own frame:
// `s` along the wall from the opening's near jamb (0 to its width), `t` across the wall from its
// centreline (+ to the wall's left), `z` up from the floor. Pure numbers, so it can be tested and
// the 3D view (src/components/OpeningDetail3D.tsx) only places and merges them.
//
// The plan's symbols (./openingStyles) and the elevations draw the same kinds; the print model
// (src/print/build.ts) leaves openings as holes and never draws these.

import type { Vec2 } from '../lib/geom'
import type { Opening } from './model'
import { openingStyle } from './openingStyles'

/** What a piece is, which decides its material and its mesh's name. */
export type DetailPart = 'frame' | 'leaf' | 'glass' | 'track' | 'sill' | 'rib'

export interface DetailSolid {
  part: DetailPart
  /** Its footprint in (s, t), four corners. */
  pts: Vec2[]
  z0: number
  z1: number
}

/** How wide a frame member is on the face (m). */
export const FRAME = 0.05
/** How deep a frame is across the wall, at most (m). */
const FRAME_DEPTH = 0.1
/** A door leaf's thickness (m). */
const LEAF = 0.04
/** A glazed leaf's or sash's stiles and rails (m). */
const STILE = 0.07

/** The bifold's panel count: pairs, none wider than 800 mm (as the plan symbol draws them). */
export const bifoldPanels = (width: number) => Math.max(2, 2 * Math.ceil(width / 1.6 - 1e-6))

const box = (part: DetailPart, s0: number, s1: number, t0: number, t1: number, z0: number, z1: number): DetailSolid | null =>
  s1 - s0 > 1e-4 && t1 - t0 > 1e-4 && z1 - z0 > 1e-4
    ? {
        part,
        pts: [
          [s0, t0],
          [s1, t0],
          [s1, t1],
          [s0, t1],
        ],
        z0,
        z1,
      }
    : null

/** A glazed panel: stiles and rails round a pane, `t` across the wall at its middle. */
function glazed(out: DetailSolid[], rail: DetailPart, s0: number, s1: number, t: number, depth: number, z0: number, z1: number) {
  const st = Math.min(STILE, (s1 - s0) / 4, (z1 - z0) / 4)
  const h = depth / 2
  out.push(
    ...[
      box(rail, s0, s0 + st, t - h, t + h, z0, z1),
      box(rail, s1 - st, s1, t - h, t + h, z0, z1),
      box(rail, s0 + st, s1 - st, t - h, t + h, z0, z0 + st * 1.4),
      box(rail, s0 + st, s1 - st, t - h, t + h, z1 - st, z1),
      box('glass', s0 + st, s1 - st, t - 0.005, t + 0.005, z0 + st * 1.4, z1 - st),
    ].filter((x): x is DetailSolid => !!x),
  )
}

/**
 * The pieces of a door, window or garage door, from its kind (./openingStyles), for a wall
 * `thickness` thick. `top` is how high it reaches above the floor, cut to the ceiling as the
 * hole in the wall is. A plain opening has none.
 */
export function openingDetail(o: Pick<Opening, 'kind' | 'style' | 'width' | 'sill' | 'height'>, thickness: number, top = o.sill + o.height): DetailSolid[] {
  const w = o.width
  const z0 = o.sill
  const z1 = Math.min(top, o.sill + o.height)
  if (o.kind === 'opening' || w < 4 * FRAME || z1 - z0 < 4 * FRAME) return []
  const fd = Math.min(thickness, FRAME_DEPTH) / 2
  const out: DetailSolid[] = []
  const add = (...xs: (DetailSolid | null)[]) => out.push(...xs.filter((x): x is DetailSolid => !!x))
  // The frame: a jamb each side and a head; a window's also has a bottom rail and a sill.
  add(box('frame', 0, FRAME, -fd, fd, z0, z1), box('frame', w - FRAME, w, -fd, fd, z0, z1), box('frame', FRAME, w - FRAME, -fd, fd, z1 - FRAME, z1))
  const s0 = FRAME
  const s1 = w - FRAME
  const head = z1 - FRAME
  const style = openingStyle(o)

  if (o.kind === 'garage') {
    // Ribs across both faces of the panel (GARAGE_PANEL thick, on the centreline), 500 mm apart as the elevations draw them.
    for (let z = z0 + 0.5; z < head - 0.1; z += 0.5) add(box('rib', s0, s1, -0.035, 0.035, z - 0.015, z + 0.015))
    return out
  }

  if (o.kind === 'window') {
    const bottom = z0 + FRAME
    add(box('frame', s0, s1, -fd, fd, z0, bottom))
    // The sill reaches past the jambs and out past both faces of the wall.
    add(box('sill', -0.04, w + 0.04, -thickness / 2 - 0.04, thickness / 2 + 0.04, z0 - 0.03, z0))
    const bar = (a: number, b: number, t: number, zz0: number, zz1: number) => add(box('frame', a, b, t - 0.02, t + 0.02, zz0, zz1))
    const mid = w / 2
    const zm = (bottom + head) / 2
    if (style === 'sliding') {
      // Two sashes passing at the middle: their meeting stiles, one in front of the other.
      bar(mid - 0.04, mid + 0.01, 0.02, bottom, head)
      bar(mid - 0.01, mid + 0.04, -0.02, bottom, head)
    } else if (style === 'double-hung') {
      // The meeting rails of the upper and lower sashes.
      bar(s0, s1, 0.02, zm - 0.01, zm + 0.04)
      bar(s0, s1, -0.02, zm - 0.04, zm + 0.01)
    } else if (style === 'awning') {
      // The sash inside the frame, hinged at its top.
      const st = 0.035
      bar(s0, s0 + st, 0.02, bottom, head)
      bar(s1 - st, s1, 0.02, bottom, head)
      bar(s0 + st, s1 - st, 0.02, bottom, bottom + st)
      bar(s0 + st, s1 - st, 0.02, head - st, head)
    } else if (style === undefined && w > 1.3) {
      // A window of no kind keeps the mullion the elevations have always drawn on a wide one.
      bar(mid - 0.025, mid + 0.025, 0, bottom, head)
    }
    // Fixed: the frame alone.
    return out
  }

  // Doors.
  const zb = z0 + 0.01
  if (style === 'hinged') {
    add(box('leaf', s0, s1, -LEAF / 2, LEAF / 2, zb, head))
  } else if (style === 'double') {
    // French doors: two glazed leaves meeting in the middle.
    const mid = w / 2
    glazed(out, 'leaf', s0, mid, 0, LEAF, zb, head)
    glazed(out, 'leaf', mid, s1, 0, LEAF, zb, head)
  } else if (style === 'sliding') {
    // A fixed panel and one that slides past it on its own track, overlapping in the middle.
    const lap = Math.min(0.08, (s1 - s0) / 8)
    const mid = w / 2
    glazed(out, 'frame', s0, mid + lap / 2, 0.025, 0.035, zb + 0.01, head)
    glazed(out, 'frame', mid - lap / 2, s1, -0.025, 0.035, zb + 0.01, head)
    add(box('track', 0, w, -fd, fd, z0, zb + 0.01))
  } else {
    // Bifold: narrow glazed panels, folded a little so they read as a fold-up door.
    const n = bifoldPanels(w)
    const p = (s1 - s0) / n
    const a = p * 0.18
    const h = 0.02
    const zig = (i: number) => (i % 2 ? a / 2 : -a / 2)
    for (let i = 0; i < n; i++) {
      const sa = s0 + i * p
      const sb = sa + p
      const ta = zig(i)
      const tb = zig(i + 1)
      const quad = (part: DetailPart, dt: number, zz0: number, zz1: number): DetailSolid => ({
        part,
        pts: [
          [sa, ta - dt],
          [sb, tb - dt],
          [sb, tb + dt],
          [sa, ta + dt],
        ],
        z0: zz0,
        z1: zz1,
      })
      const st = Math.min(STILE, (head - zb) / 6)
      out.push(quad('leaf', h, zb, zb + st * 1.4), quad('leaf', h, head - st, head), quad('glass', 0.005, zb + st * 1.4, head - st))
      // A stile at each fold.
      const fold = Math.min(0.03, p / 6)
      add(box('leaf', sa, sa + fold, ta - h, ta + h, zb, head), box('leaf', sb - fold, sb, tb - h, tb + h, zb, head))
    }
    add(box('track', 0, w, -fd, fd, z0, zb))
  }
  return out
}
