// Retaining walls all the way round a slab or the house, so its levelled ground stops dead at its
// edge: the walls are barriers the batters can't cross (src/lib/earthworks.ts), and a closed ring
// leaves them no way round. The walls are ordinary retaining walls, so the checks, costs, 3D view
// and print count them like any other, and each can be moved or deleted on its own.

import { pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import { levelBuildsAs } from './floorTypes'
import { buildingOutline, offsetPolygon, planarFaces } from './geometry'
import { areaKind, isRetaining, newId, sortedLevels, type Plan, type Wall } from './model'

/** How thick the walls it adds are (m). */
export const EDGE_WALL_THICKNESS = 0.2

/** Two points closer than this are the same corner (m). */
const SAME = 0.02

/** The walls that would retain a ring's edges: centred half their thickness outside it, so their inner face is its edge. */
export function edgeWalls(ring: Vec2[], level: string, thickness = EDGE_WALL_THICKNESS): Pick<Wall, 'level' | 'a' | 'b' | 'thickness' | 'kind'>[] {
  if (ring.length < 3) return []
  // offsetPolygon moves each edge to its left; outward is the left of a clockwise ring.
  const out = signedArea(ring) < 0 ? thickness / 2 : -thickness / 2
  const line = offsetPolygon(ring, ring.map(() => out))
  const walls: Pick<Wall, 'level' | 'a' | 'b' | 'thickness' | 'kind'>[] = []
  for (let i = 0; i < line.length; i++) {
    const a = line[i]
    const b = line[(i + 1) % line.length]
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01) continue
    walls.push({ level, a: [a[0], a[1]], b: [b[0], b[1]], thickness, kind: 'retaining' })
  }
  return walls
}

const near = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= SAME

/** Is there already a retaining wall along this one, on its level? */
function hasWall(plan: Plan, w: Pick<Wall, 'level' | 'a' | 'b'>): boolean {
  return plan.walls.some(x => isRetaining(x) && x.level === w.level && ((near(x.a, w.a) && near(x.b, w.b)) || (near(x.a, w.b) && near(x.b, w.a))))
}

/**
 * The house's outline on each level built on the ground (not framed over another), with the
 * walls its edges need. An edge shared with another such level's outline is left out: it's the
 * step between two parts of the house, inside the house.
 */
export function houseEdgeWalls(plan: Plan): Pick<Wall, 'level' | 'a' | 'b' | 'thickness' | 'kind'>[] {
  const levels = sortedLevels(plan).filter(l => levelBuildsAs(plan, l.id) !== 'framed')
  const outlines = new Map(levels.map(l => [l.id, buildingOutline(planarFaces(plan.walls.filter(w => w.level === l.id))).outlines]))
  const out: Pick<Wall, 'level' | 'a' | 'b' | 'thickness' | 'kind'>[] = []
  for (const l of levels) {
    const others = levels.filter(o => o.id !== l.id).flatMap(o => outlines.get(o.id) ?? [])
    for (const ring of outlines.get(l.id) ?? []) {
      for (const w of edgeWalls(ring, l.id)) {
        const mid: Vec2 = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]
        if (others.some(r => pointInPolygon(mid[0], mid[1], r))) continue
        out.push(w)
      }
    }
  }
  return out
}

/** The walls a slab area's edges need. */
export function slabEdgeWalls(plan: Plan, areaId: string): Pick<Wall, 'level' | 'a' | 'b' | 'thickness' | 'kind'>[] {
  const a = plan.areas.find(x => x.id === areaId)
  if (!a || areaKind(a) !== 'slab') return []
  return edgeWalls(a.pts, a.level)
}

/** How many of `walls` the plan already has, and how many it lacks. */
export function edgeState(plan: Plan, walls: Pick<Wall, 'level' | 'a' | 'b'>[]): { have: number; missing: number } {
  const have = walls.filter(w => hasWall(plan, w)).length
  return { have, missing: walls.length - have }
}

/** Add whichever of `walls` the plan doesn't have yet. */
export function addEdgeWalls(plan: Plan, walls: Pick<Wall, 'level' | 'a' | 'b' | 'thickness' | 'kind'>[]): Plan {
  const add: Wall[] = walls.filter(w => !hasWall(plan, w)).map(w => ({ ...w, id: newId('wall') }))
  return add.length ? { ...plan, walls: [...plan.walls, ...add] } : plan
}

/** Take away the retaining walls along `walls` (the ones addEdgeWalls would add). */
export function removeEdgeWalls(plan: Plan, walls: Pick<Wall, 'level' | 'a' | 'b'>[]): Plan {
  const gone = (x: Wall) => isRetaining(x) && walls.some(w => x.level === w.level && ((near(x.a, w.a) && near(x.b, w.b)) || (near(x.a, w.b) && near(x.b, w.a))))
  return plan.walls.some(gone) ? { ...plan, walls: plan.walls.filter(x => !gone(x)) } : plan
}
