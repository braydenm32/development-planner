// Where a door or window can be picked on the plan: the gap it makes in its wall, and for a door
// that swings, the leaf and the arc it sweeps as the plan draws them (PlanEditor's openingSymbol
// and src/plan/openingStyles.ts styleSymbol). A door that swings outward has its leaf and arc out
// past the wall, over bare ground, so a press or right-click there is on the door, not the ground.

import type { Vec2 } from '../lib/geom'
import { pointOnWall, wallDir, type Opening, type Wall } from './model'
import { openingStyle } from './openingStyles'

/** The opening's own frame: `along` from its near jamb, `out` to the wall's left (as the symbol is drawn). */
function local(o: Opening, w: Wall, p: Vec2) {
  const d = wallDir(w)
  const n: Vec2 = [-d[1], d[0]]
  const c = pointOnWall(w, o.offset)
  const p0: Vec2 = [c[0] - d[0] * (o.width / 2), c[1] - d[1] * (o.width / 2)]
  const v: Vec2 = [p[0] - p0[0], p[1] - p0[1]]
  return { along: v[0] * d[0] + v[1] * d[1], out: v[0] * n[0] + v[1] * n[1] }
}

/**
 * Whether `p` is on the swing of a door: the quarter circle its leaf sweeps (two of them for a
 * pair), or the panels of a bifold folded back, on the side it opens to. `tol` is the slack in
 * metres. Sliding doors, garage doors, windows and plain openings stay in their wall.
 */
export function onSwing(o: Opening, w: Wall, p: Vec2, tol: number): boolean {
  if (o.kind !== 'door') return false
  const style = openingStyle(o)
  if (style === 'sliding') return false
  const { along, out } = local(o, w, p)
  const ht = w.thickness / 2 + 0.005
  const side = o.flipSwing ? -1 : 1
  // On the side it opens to, past the wall's face.
  const past = side * out
  if (past < ht - tol || along < -tol || along > o.width + tol) return false
  const within = (hinge: number, r: number) => Math.hypot(along - hinge, past - ht) <= r + tol
  if (style === 'double') return within(0, o.width / 2) || within(o.width, o.width / 2)
  if (style === 'bifold') {
    const panels = Math.max(2, 2 * Math.ceil(o.width / 1.6 - 1e-6))
    return past <= ht + (o.width / panels) * 0.866 + tol
  }
  return within(o.flipHinge ? o.width : 0, o.width)
}

/** The door under a point on its swing (the first listed, where two swings overlap), or null. */
export function doorSwingAt(openings: Opening[], walls: Wall[], p: Vec2, tol: number): Opening | null {
  for (const o of openings) {
    const w = walls.find(x => x.id === o.wall)
    if (w && onSwing(o, w, p, tol)) return o
  }
  return null
}
