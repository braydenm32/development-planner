// Flipping (mirroring), turning and lining up what is selected, and flipping the whole plan. Pure
// functions on a plan, so each is one change for the store to commit (one undo step) and can be
// tested. Walls take their doors and windows with them; the store then keeps every opening fitted
// to its wall (src/plan/openingFit.ts).

import type { Vec2 } from '../lib/geom'
import { translateSelection } from './editing'
import { furnitureCorners, normDeg } from './furniture'
import type { Plan, Roof } from './model'
import { houseBounds } from './ops'
import { stairLayout } from './stairs'
import type { Selection } from './store'

const r4 = (x: number) => Math.round(x * 1e4) / 1e4
const r3 = (x: number) => Math.round(x * 1e3) / 1e3
const TOL = 1e-3
const same = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) <= TOL && Math.abs(a[1] - b[1]) <= TOL

/** Which way to flip, in the plan's own frame: 'x' swaps left and right (x becomes −x), 'y' swaps top and bottom. */
export type FlipAxis = 'x' | 'y'

/** A move that keeps every shape: where each point goes, and what it does to a direction. */
interface Rigid {
  map: (p: Vec2) => Vec2
  /** Where a direction (degrees anticlockwise from the plan's x axis) points afterwards. */
  dir: (deg: number) => number
  /** A flip: left and right hands swap (a door's swing, the side a wall holds back, a stair's turn). */
  mirror: boolean
}

function flipAbout(c: Vec2, axis: FlipAxis): Rigid {
  return axis === 'x'
    ? { map: p => [r4(2 * c[0] - p[0]), r4(p[1])], dir: d => normDeg(180 - d), mirror: true }
    : { map: p => [r4(p[0]), r4(2 * c[1] - p[1])], dir: d => normDeg(-d), mirror: true }
}

function turnAbout(c: Vec2, clockwise: number): Rigid {
  const t = (-clockwise * Math.PI) / 180
  // Quarter turns are exact, so a square plan stays square to the millimetre.
  const q = ((Math.round(clockwise / 90) % 4) + 4) % 4
  const exact = Math.abs(clockwise - Math.round(clockwise / 90) * 90) < 1e-9
  const [cos, sin] = exact ? [[1, 0], [0, -1], [-1, 0], [0, 1]][q] : [Math.cos(t), Math.sin(t)]
  return {
    map: p => {
      const x = p[0] - c[0]
      const y = p[1] - c[1]
      return [r4(c[0] + x * cos - y * sin), r4(c[1] + x * sin + y * cos)]
    },
    dir: d => normDeg(d - clockwise),
    mirror: false,
  }
}

/** What a change takes with it, by id. */
interface Picked {
  walls: Set<string>
  rooms: Set<string>
  areas: Set<string>
  roofs: Set<string>
  stairs: Set<string>
  furniture: Set<string>
  sketch: Set<string>
  /** Notes and section lines, which only the whole plan's flip takes. */
  notes: boolean
  sections: boolean
}

const idsOf = (sels: Selection[], type: Selection['type']) => new Set(sels.filter(s => s.type === type).map(s => s.id))

const pickedBy = (sels: Selection[]): Picked => ({
  walls: idsOf(sels, 'wall'),
  rooms: idsOf(sels, 'room'),
  areas: idsOf(sels, 'area'),
  roofs: idsOf(sels, 'roof'),
  stairs: idsOf(sels, 'stair'),
  furniture: idsOf(sels, 'furniture'),
  sketch: idsOf(sels, 'sketch'),
  notes: false,
  sections: false,
})

/** Whether a flip or a turn has anything to work on: a door or window on its own goes with its wall. */
export const canTransform = (sels: Selection[]): boolean => sels.some(s => s.type !== 'opening')

/** A roof flipped: its outline is listed the other way round to stay anticlockwise, and its edges' settings follow their edges. */
function mirrorRoof(r: Roof, map: (p: Vec2) => Vec2): Roof {
  const n = r.pts.length
  const from = (j: number) => (((n - 2 - j) % n) + n) % n
  return {
    ...r,
    pts: r.pts.map((_, j) => map(r.pts[n - 1 - j])),
    gables: r.pts.map((_, j) => !!r.gables[from(j)]),
    lowEdge: from(r.lowEdge),
  }
}

function apply(plan: Plan, pick: Picked, t: Rigid): Plan {
  const { map, dir, mirror } = t
  const other = (side: 'left' | 'right') => (side === 'left' ? 'right' : 'left')
  return {
    ...plan,
    walls: pick.walls.size
      ? plan.walls.map(w => (pick.walls.has(w.id) ? { ...w, a: map(w.a), b: map(w.b), ...(mirror && w.retain ? { retain: { ...w.retain, high: other(w.retain.high) } } : {}) } : w))
      : plan.walls,
    // A door stays the same distance along its wall; flipped, it swings to the wall's other side.
    openings: mirror && pick.walls.size ? plan.openings.map(o => (pick.walls.has(o.wall) ? { ...o, flipSwing: !o.flipSwing } : o)) : plan.openings,
    rooms: pick.rooms.size ? plan.rooms.map(r => (pick.rooms.has(r.id) ? { ...r, at: map(r.at) } : r)) : plan.rooms,
    areas: pick.areas.size ? plan.areas.map(a => (pick.areas.has(a.id) ? { ...a, pts: mirror ? [...a.pts].reverse().map(map) : a.pts.map(map) } : a)) : plan.areas,
    roofs: pick.roofs.size ? plan.roofs.map(r => (pick.roofs.has(r.id) ? (mirror ? mirrorRoof(r, map) : { ...r, pts: r.pts.map(map) }) : r)) : plan.roofs,
    stairs: pick.stairs.size
      ? plan.stairs.map(s => (pick.stairs.has(s.id) ? { ...s, at: map(s.at), angle: dir(s.angle), ...(mirror ? { turn: other(s.turn) } : {}) } : s))
      : plan.stairs,
    // A piece's back faces 90° on from its turn.
    furniture: pick.furniture.size ? plan.furniture.map(f => (pick.furniture.has(f.id) ? { ...f, at: map(f.at), rotation: normDeg(dir(f.rotation + 90) - 90) } : f)) : plan.furniture,
    ...(pick.sketch.size && plan.sketch ? { sketch: plan.sketch.map(s => (pick.sketch.has(s.id) ? { ...s, pts: s.pts.map(map) } : s)) } : {}),
    ...(pick.notes && plan.notes?.length ? { notes: plan.notes.map(n => ({ ...n, at: map(n.at) })) } : {}),
    ...(pick.sections && plan.sections?.length ? { sections: plan.sections.map(s => ({ ...s, a: map(s.a), b: map(s.b) })) } : {}),
  }
}

/** Every point of what is picked, to find its extent. */
function pointsOf(plan: Plan, sels: Selection[]): Vec2[] {
  const pick = pickedBy(sels)
  return [
    ...plan.walls.filter(w => pick.walls.has(w.id)).flatMap(w => [w.a, w.b]),
    ...plan.rooms.filter(r => pick.rooms.has(r.id)).map(r => r.at),
    ...plan.areas.filter(a => pick.areas.has(a.id)).flatMap(a => a.pts),
    ...plan.roofs.filter(r => pick.roofs.has(r.id)).flatMap(r => r.pts),
    ...plan.stairs.filter(s => pick.stairs.has(s.id)).flatMap(s => stairLayout(s).outline),
    ...plan.furniture.filter(f => pick.furniture.has(f.id)).flatMap(furnitureCorners),
    ...(plan.sketch ?? []).filter(s => pick.sketch.has(s.id)).flatMap(s => s.pts),
  ]
}

/** The middle of what is picked (of the box round it), to the millimetre; null with nothing to measure. */
export function selectionMiddle(plan: Plan, sels: Selection[]): Vec2 | null {
  const pts = pointsOf(plan, sels)
  if (!pts.length) return null
  const xs = pts.map(p => p[0])
  const ys = pts.map(p => p[1])
  return [r3((Math.min(...xs) + Math.max(...xs)) / 2), r3((Math.min(...ys) + Math.max(...ys)) / 2)]
}

/** Flip (mirror) what is selected about its own middle. Walls keep their doors and windows, which then swing the other way. */
export function flipSelection(plan: Plan, sels: Selection[], axis: FlipAxis): Plan {
  const c = selectionMiddle(plan, sels)
  return c ? apply(plan, pickedBy(sels), flipAbout(c, axis)) : plan
}

/** Turn what is selected about its own middle, clockwise by `degrees` (negative turns it anticlockwise). */
export function rotateSelection(plan: Plan, sels: Selection[], degrees: number): Plan {
  const c = selectionMiddle(plan, sels)
  if (!c || !Number.isFinite(degrees) || Math.abs(degrees % 360) < 1e-9) return plan
  return apply(plan, pickedBy(sels), turnAbout(c, degrees))
}

/**
 * Flip the whole plan about the middle of the house, so the house stays where it is on the block:
 * every level's walls, rooms, areas, roofs, stairs and furniture, the notes and the section lines.
 * The sketch layer stays put: it's drawn to things on the site, which haven't moved.
 */
export function flipPlan(plan: Plan, axis: FlipAxis): Plan {
  const b = houseBounds(plan)
  if (!b) return plan
  const c: Vec2 = [r3((b.minX + b.maxX) / 2), r3((b.minY + b.maxY) / 2)]
  const all = <T extends { id: string }>(xs: T[]) => new Set(xs.map(x => x.id))
  const pick: Picked = {
    walls: all(plan.walls),
    rooms: all(plan.rooms),
    areas: all(plan.areas),
    roofs: all(plan.roofs),
    stairs: all(plan.stairs),
    furniture: all(plan.furniture),
    sketch: new Set(),
    notes: true,
    sections: true,
  }
  return apply(plan, pick, flipAbout(c, axis))
}

/** Which edge or middle things line up on, along a direction: the least, the middle or the most. */
export type AlignTo = 'min' | 'mid' | 'max'

/**
 * Line the selected things up along `dir` (a unit vector in the plan's frame: the way "right" or
 * "up" points): each moves so its edge, or its middle, sits on the selection's. Walls joined to
 * one another move as one, and the walls joined to them follow as they do when a wall is dragged.
 * A door or window on its own stays in its wall.
 */
export function alignSelection(plan: Plan, sels: Selection[], dir: Vec2, to: AlignTo): Plan {
  const along = (p: Vec2) => p[0] * dir[0] + p[1] * dir[1]
  const span = (pts: Vec2[]) => ({ min: Math.min(...pts.map(along)), max: Math.max(...pts.map(along)) })
  const groups = alignGroups(plan, sels).filter(g => pointsOf(plan, g).length)
  if (groups.length < 2) return plan
  const all = span(groups.flatMap(g => pointsOf(plan, g)))
  const at = (s: { min: number; max: number }) => (to === 'min' ? s.min : to === 'max' ? s.max : (s.min + s.max) / 2)
  const target = at(all)
  let next = plan
  for (const g of groups) {
    // Measured on the plan as it is now: an earlier move can have carried a wall joined to this one.
    const pts = pointsOf(next, g)
    if (!pts.length) continue
    const by = r4(target - at(span(pts)))
    if (Math.abs(by) < 1e-6) continue
    next = translateSelection(next, g, [by * dir[0], by * dir[1]])
  }
  return next
}

/** The selection as the things that move on their own: each item, with selected walls that share an end taken together. */
function alignGroups(plan: Plan, sels: Selection[]): Selection[][] {
  const wallIds = idsOf(sels, 'wall')
  const walls = plan.walls.filter(w => wallIds.has(w.id))
  const group = new Map<string, number>()
  walls.forEach((w, i) => group.set(w.id, i))
  const joined = (a: (typeof walls)[number], b: (typeof walls)[number]) => a.level === b.level && [a.a, a.b].some(p => same(p, b.a) || same(p, b.b))
  // Few walls at a time: merge groups until none share an end.
  for (let changed = true; changed; ) {
    changed = false
    for (const a of walls)
      for (const b of walls) {
        const [ga, gb] = [group.get(a.id)!, group.get(b.id)!]
        if (ga !== gb && joined(a, b)) {
          for (const [id, g] of group) if (g === gb) group.set(id, ga)
          changed = true
        }
      }
  }
  const byGroup = new Map<number, Selection[]>()
  for (const w of walls) byGroup.set(group.get(w.id)!, [...(byGroup.get(group.get(w.id)!) ?? []), { type: 'wall', id: w.id }])
  return [...byGroup.values(), ...sels.filter(s => s.type !== 'wall' && s.type !== 'opening').map(s => [s])]
}

/**
 * The plan's own axes as the screen shows them, for a view turned `rho` radians anticlockwise
 * (src/lib/orientation.ts): which way "right" and "up" point in the plan's frame, to the nearest
 * quarter turn, so a flip or a typed move stays square to the house however the page is turned.
 */
export function screenAxes(rho: number): { right: Vec2; up: Vec2 } {
  const q = ((Math.round(rho / (Math.PI / 2)) % 4) + 4) % 4
  const right: Vec2[] = [[1, 0], [0, -1], [-1, 0], [0, 1]]
  const up: Vec2[] = [[0, 1], [1, 0], [0, -1], [-1, 0]]
  return { right: right[q], up: up[q] }
}
