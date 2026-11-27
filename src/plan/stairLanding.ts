// Where a stair lands. The NCC limits (./stairs.ts) check its risers and going; these check that it
// gets you somewhere: the top step arrives on the floor it joins, inside that floor's walls, with
// no wall across the flight or across the step off the top, and no flight longer than the NCC allows.
// The stair's card lists what's wrong, in the same amber line as "Its top meets no floor".

import { pointInPolygon, type Vec2 } from '../lib/geom'
import { areaKind, houseWalls, levelById, type Plan, type Stair, type Wall } from './model'
import { riserCount, stairLayout, stairMeetsNoFloor, stairTopLevel } from './stairs'
import { levelRings } from './storeys'

/** The most risers the NCC allows in one flight (Housing Provisions 11.2.2). */
export const MAX_FLIGHT_RISERS = 18

/** How far past the top riser the first step onto the floor lands (m), and how far the way off the top is checked for a wall. */
const STEP_OFF = 0.3
const WAY_OFF = 0.6
/** A step this close to the floor's edge is on it (m). */
const EDGE_REACH = 0.15

export interface StairIssue {
  id: 'outside' | 'wall' | 'wall-top' | 'flight'
  text: string
}

/** The risers in each flight: one for a straight stair, two either side of an L or U stair's landing. */
export function flightRisers(s: Pick<Stair, 'rise' | 'shape'>): number[] {
  const n = riserCount(s.rise)
  if (s.shape === 'straight') return [n]
  const first = Math.ceil(n / 2)
  return [first, n - first]
}

/** Where segment p–q crosses wall w's centreline, as the distance along the wall from its start; null when it doesn't. */
function crossing(p: Vec2, q: Vec2, w: Pick<Wall, 'a' | 'b'>): number | null {
  const rx = q[0] - p[0]
  const ry = q[1] - p[1]
  const sx = w.b[0] - w.a[0]
  const sy = w.b[1] - w.a[1]
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-12) return null
  const t = ((w.a[0] - p[0]) * sy - (w.a[1] - p[1]) * sx) / den
  const u = ((w.a[0] - p[0]) * ry - (w.a[1] - p[1]) * rx) / den
  return t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1 ? u * Math.hypot(sx, sy) : null
}

/** The first of `walls` that the path crosses where it has no door, opening or garage door to walk through. */
function wallAcross(plan: Plan, path: Vec2[], walls: Wall[]): Wall | undefined {
  return walls.find(w => {
    for (let i = 0; i + 1 < path.length; i++) {
      const at = crossing(path[i], path[i + 1], w)
      if (at === null) continue
      const through = plan.openings.some(o => o.wall === w.id && o.kind !== 'window' && Math.abs(o.offset - at) <= o.width / 2)
      if (!through) return true
    }
    return false
  })
}

function distToRings(p: Vec2, rings: Vec2[][]): number {
  let d = Infinity
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const l2 = dx * dx + dy * dy
      const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
      d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy))
    }
  return d
}

/**
 * What's wrong with where a stair lands, in words; empty when it lands well (or can't be told
 * yet: a top that meets no floor is flagged by stairMeetsNoFloor, and a floor with no walls
 * drawn has no edge to be outside of).
 */
export function stairLandingIssues(plan: Plan, s: Stair): StairIssue[] {
  const out: StairIssue[] = []
  const L = stairLayout(s)
  const own = levelById(plan, s.level)
  const to = stairMeetsNoFloor(plan, s) ? undefined : stairTopLevel(plan, s)
  const walk = L.walk
  const end = walk[walk.length - 1]
  const prev = walk[walk.length - 2] ?? end
  const len = Math.hypot(end[0] - prev[0], end[1] - prev[1]) || 1
  const dir: Vec2 = [(end[0] - prev[0]) / len, (end[1] - prev[1]) / len]

  // The flight itself, through its own level's walls.
  const through = wallAcross(plan, walk, houseWalls(plan.walls.filter(w => w.level === s.level)))
  if (through) out.push({ id: 'wall', text: `It runs through a wall on ${own?.name ?? 'its level'} where there’s no door or opening. Move the stair, or put an opening in the wall.` })

  if (to && to.id !== s.level) {
    // The first step onto the floor it joins: on that floor (inside its walls, or on a slab or deck drawn on it).
    const foot: Vec2 = [end[0] + dir[0] * STEP_OFF, end[1] + dir[1] * STEP_OFF]
    const rings = levelRings(plan, to.id)
    const decks = plan.areas.filter(a => a.level === to.id && a.pts.length >= 3 && (areaKind(a) === 'slab' || areaKind(a) === 'deck')).map(a => a.pts)
    const d = distToRings(foot, [...rings, ...decks])
    // On it, or within a wall's thickness of its edge (the floor carries on under the wall between two levels).
    const on = rings.some(r => pointInPolygon(foot[0], foot[1], r)) || decks.some(r => pointInPolygon(foot[0], foot[1], r)) || d <= EDGE_REACH
    if ((rings.length || decks.length) && !on) {
      out.push({ id: 'outside', text: `It arrives outside ${to.name}’s walls: the top step is ${d.toFixed(2)} m from that floor. Move the stair under ${to.name}, or draw ${to.name} over where it arrives.` })
    }
    // The way off the top step: no wall across it, on the level it leaves or the one it joins.
    if (!through) {
      const off: Vec2[] = [end, [end[0] + dir[0] * WAY_OFF, end[1] + dir[1] * WAY_OFF]]
      const blocked = wallAcross(plan, off, houseWalls(plan.walls.filter(w => w.level === s.level || w.level === to.id)))
      if (blocked) out.push({ id: 'wall-top', text: `A wall on ${levelById(plan, blocked.level)?.name ?? 'the level'} stands across the top step with no door or opening, so there’s no way off the stair. Move the stair, or put an opening in the wall.` })
    }
  }

  const flights = flightRisers(s)
  const longest = Math.max(...flights)
  if (longest > MAX_FLIGHT_RISERS)
    out.push({
      id: 'flight',
      text: `${longest} risers in one flight: the building code (NCC) allows ${MAX_FLIGHT_RISERS} before a landing. ${s.shape === 'straight' ? 'Make it an L or U stair, which has a landing half way.' : 'Split the climb between two stairs with a floor or landing between.'}`,
    })
  return out
}
