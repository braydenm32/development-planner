// Working on several things at once: nudging, deleting, copying and picking by box. Pure
// functions on a plan and a list of selections (src/plan/store.ts has the list), so they can be tested.

import type { Vec2 } from '../lib/geom'
import { furnitureName } from './furniture'
import { newId, OPENING_NAMES, wallDir, type Area, type Furniture, type Opening, type Plan, type Roof, type Room, type Stair, type Wall } from './model'
import { deleteSelection } from './ops'
import type { Selection } from './store'

const r4 = (x: number) => Math.round(x * 1e4) / 1e4
const TOL = 1e-3
const same = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) <= TOL && Math.abs(a[1] - b[1]) <= TOL

/** What is selected, as a list: the first pick and the rest. */
export const selectedList = (st: { selection: Selection | null; extra: Selection[] }): Selection[] => (st.selection ? [st.selection, ...st.extra] : [])

const idsOf = (sels: Selection[], type: Selection['type']) => new Set(sels.filter(s => s.type === type).map(s => s.id))

/**
 * Move the selected things by `delta` (metres, in the plan's frame). Walls move with the walls
 * joined at their ends (as dragging a wall does), and carry their doors and windows; a door or
 * window picked on its own slides along its wall by the part of the move that lies along it.
 */
export function translateSelection(plan: Plan, sels: Selection[], delta: Vec2): Plan {
  const [dx, dy] = delta
  const shift = (p: Vec2): Vec2 => [r4(p[0] + dx), r4(p[1] + dy)]
  const wallIds = idsOf(sels, 'wall')
  const moved: { level: string; p: Vec2 }[] = plan.walls.filter(w => wallIds.has(w.id)).flatMap(w => [w.a, w.b].map(p => ({ level: w.level, p })))
  const hits = (level: string, p: Vec2) => moved.some(m => m.level === level && same(m.p, p))
  const openingIds = idsOf(sels, 'opening')
  const rooms = idsOf(sels, 'room')
  const areas = idsOf(sels, 'area')
  const roofs = idsOf(sels, 'roof')
  const stairs = idsOf(sels, 'stair')
  const furniture = idsOf(sels, 'furniture')
  const wallById = new Map(plan.walls.map(w => [w.id, w]))
  return {
    ...plan,
    walls: moved.length ? plan.walls.map(w => (hits(w.level, w.a) || hits(w.level, w.b) ? { ...w, a: hits(w.level, w.a) ? shift(w.a) : w.a, b: hits(w.level, w.b) ? shift(w.b) : w.b } : w)) : plan.walls,
    openings: openingIds.size
      ? plan.openings.map(o => {
          const w = wallById.get(o.wall)
          // Its wall moving carries it already.
          if (!openingIds.has(o.id) || !w || wallIds.has(w.id)) return o
          const d = wallDir(w)
          return { ...o, offset: r4(o.offset + dx * d[0] + dy * d[1]) }
        })
      : plan.openings,
    rooms: rooms.size ? plan.rooms.map(r => (rooms.has(r.id) ? { ...r, at: shift(r.at) } : r)) : plan.rooms,
    areas: areas.size ? plan.areas.map(a => (areas.has(a.id) ? { ...a, pts: a.pts.map(shift) } : a)) : plan.areas,
    roofs: roofs.size ? plan.roofs.map(r => (roofs.has(r.id) ? { ...r, pts: r.pts.map(shift) } : r)) : plan.roofs,
    stairs: stairs.size ? plan.stairs.map(s => (stairs.has(s.id) ? { ...s, at: shift(s.at) } : s)) : plan.stairs,
    furniture: furniture.size ? plan.furniture.map(f => (furniture.has(f.id) ? { ...f, at: shift(f.at) } : f)) : plan.furniture,
  }
}

/** Remove every selected thing (a wall takes its doors and windows with it). */
export function deleteSelections(plan: Plan, sels: Selection[]): Plan {
  return sels.reduce(deleteSelection, plan)
}

/** What to call the selection in a message: "Wall", "Bed", "3 items". */
export function selectionName(plan: Plan, sels: Selection[]): string {
  if (sels.length !== 1) return `${sels.length} items`
  const s = sels[0]
  switch (s.type) {
    case 'wall': {
      const w = plan.walls.find(x => x.id === s.id)
      return w?.kind === 'retaining' ? 'Retaining wall' : 'Wall'
    }
    case 'opening': {
      const o = plan.openings.find(x => x.id === s.id)
      return o ? OPENING_NAMES[o.kind] : 'Opening'
    }
    case 'room':
      return plan.rooms.find(x => x.id === s.id)?.name.trim() || 'Room'
    case 'area':
      return plan.areas.find(x => x.id === s.id)?.name.trim() || 'Area'
    case 'roof':
      return 'Roof'
    case 'stair':
      return 'Stair'
    case 'furniture': {
      const f = plan.furniture.find(x => x.id === s.id)
      return f ? furnitureName(f) : 'Furniture'
    }
  }
}

/** "2 walls, 1 room, 3 pieces of furniture". */
export function selectionCounts(sels: Selection[]): string {
  const names: Record<Selection['type'], [string, string]> = {
    wall: ['wall', 'walls'],
    opening: ['door or window', 'doors and windows'],
    room: ['room', 'rooms'],
    area: ['area', 'areas'],
    roof: ['roof', 'roofs'],
    stair: ['stair', 'stairs'],
    furniture: ['piece of furniture', 'pieces of furniture'],
  }
  return (Object.keys(names) as Selection['type'][])
    .map(t => ({ t, n: sels.filter(s => s.type === t).length }))
    .filter(x => x.n)
    .map(x => `${x.n} ${names[x.t][x.n === 1 ? 0 : 1]}`)
    .join(', ')
}

/** Everything drawn on a level that can be picked. */
export function allOnLevel(plan: Plan, level: string): Selection[] {
  const walls = plan.walls.filter(w => w.level === level)
  const ids = new Set(walls.map(w => w.id))
  return [
    ...walls.map(w => ({ type: 'wall' as const, id: w.id })),
    ...plan.openings.filter(o => ids.has(o.wall)).map(o => ({ type: 'opening' as const, id: o.id })),
    ...plan.rooms.filter(r => r.level === level).map(r => ({ type: 'room' as const, id: r.id })),
    ...plan.areas.filter(a => a.level === level).map(a => ({ type: 'area' as const, id: a.id })),
    ...plan.roofs.filter(r => r.level === level).map(r => ({ type: 'roof' as const, id: r.id })),
    ...plan.stairs.filter(s => s.level === level).map(s => ({ type: 'stair' as const, id: s.id })),
    ...plan.furniture.filter(f => f.level === level).map(f => ({ type: 'furniture' as const, id: f.id })),
  ]
}

/** Where a door or window's centre is on the plan. */
function openingAt(o: Opening, w: Wall): Vec2 {
  const d = wallDir(w)
  return [w.a[0] + d[0] * o.offset, w.a[1] + d[1] * o.offset]
}

/** Everything on a level that lies wholly inside the box (two corners, in any order). */
export function itemsInBox(plan: Plan, level: string, p: Vec2, q: Vec2): Selection[] {
  const [x0, x1] = [Math.min(p[0], q[0]), Math.max(p[0], q[0])]
  const [y0, y1] = [Math.min(p[1], q[1]), Math.max(p[1], q[1])]
  return itemsWhere(plan, level, v => v[0] >= x0 && v[0] <= x1 && v[1] >= y0 && v[1] <= y1)
}

/**
 * Everything on a level whose points all satisfy `inside`: a wall's two ends, a door or window's
 * centre, a room's label, an area's or roof's corners, a stair or piece of furniture's middle.
 */
export function itemsWhere(plan: Plan, level: string, inside: (v: Vec2) => boolean): Selection[] {
  const walls = new Map(plan.walls.filter(w => w.level === level).map(w => [w.id, w]))
  return allOnLevel(plan, level).filter(s => {
    switch (s.type) {
      case 'wall': {
        const w = walls.get(s.id)!
        return inside(w.a) && inside(w.b)
      }
      case 'opening': {
        const o = plan.openings.find(x => x.id === s.id)!
        return inside(openingAt(o, walls.get(o.wall)!))
      }
      case 'room':
        return inside(plan.rooms.find(x => x.id === s.id)!.at)
      case 'area':
        return plan.areas.find(x => x.id === s.id)!.pts.every(inside)
      case 'roof':
        return plan.roofs.find(x => x.id === s.id)!.pts.every(inside)
      case 'stair':
        return inside(plan.stairs.find(x => x.id === s.id)!.at)
      case 'furniture':
        return inside(plan.furniture.find(x => x.id === s.id)!.at)
    }
  })
}

/** Things copied from a level, ready to paste onto the same or another. */
export interface Clip {
  walls: Wall[]
  openings: Opening[]
  rooms: Room[]
  areas: Area[]
  roofs: Roof[]
  stairs: Stair[]
  furniture: Furniture[]
}

/** How many things a clip holds (doors and windows count with their walls). */
export const clipCount = (c: Clip) => c.walls.length + c.rooms.length + c.areas.length + c.roofs.length + c.stairs.length + c.furniture.length

/** What the selection holds that can be copied: walls with their doors and windows, rooms, areas, roofs, stairs and furniture. Null when none. */
export function copySelection(plan: Plan, sels: Selection[]): Clip | null {
  const pick = <T extends { id: string }>(items: T[], type: Selection['type']) => {
    const ids = idsOf(sels, type)
    return items.filter(x => ids.has(x.id))
  }
  const walls = pick(plan.walls, 'wall')
  const wallIds = new Set(walls.map(w => w.id))
  const clip: Clip = {
    walls,
    openings: plan.openings.filter(o => wallIds.has(o.wall)),
    rooms: pick(plan.rooms, 'room'),
    areas: pick(plan.areas, 'area'),
    roofs: pick(plan.roofs, 'roof'),
    stairs: pick(plan.stairs, 'stair'),
    furniture: pick(plan.furniture, 'furniture'),
  }
  return clipCount(clip) ? structuredClone(clip) : null
}

/** Put a clip on `level`, moved by `offset`, with new ids. Returns the new plan and what was added, to select. */
export function pasteClip(plan: Plan, clip: Clip, level: string, offset: Vec2): { plan: Plan; added: Selection[] } {
  const shift = (p: Vec2): Vec2 => [r4(p[0] + offset[0]), r4(p[1] + offset[1])]
  const wallIds = new Map(clip.walls.map(w => [w.id, newId('wall')]))
  const walls = clip.walls.map(w => ({ ...w, id: wallIds.get(w.id)!, level, a: shift(w.a), b: shift(w.b) }))
  const openings = clip.openings.map(o => ({ ...o, id: newId('opening'), wall: wallIds.get(o.wall)! }))
  const rooms = clip.rooms.map(r => ({ ...r, id: newId('room'), level, at: shift(r.at) }))
  const areas = clip.areas.map(a => ({ ...a, id: newId('area'), level, pts: a.pts.map(shift) }))
  const roofs = clip.roofs.map(r => ({ ...r, id: newId('roof'), level, pts: r.pts.map(shift) }))
  const stairs = clip.stairs.map(s => ({ ...s, id: newId('stair'), level, at: shift(s.at) }))
  const furniture = clip.furniture.map(f => ({ ...f, id: newId('furniture'), level, at: shift(f.at) }))
  return {
    plan: {
      ...plan,
      walls: [...plan.walls, ...walls],
      openings: [...plan.openings, ...openings],
      rooms: [...plan.rooms, ...rooms],
      areas: [...plan.areas, ...areas],
      roofs: [...plan.roofs, ...roofs],
      stairs: [...plan.stairs, ...stairs],
      furniture: [...plan.furniture, ...furniture],
    },
    added: [
      ...walls.map(x => ({ type: 'wall' as const, id: x.id })),
      ...rooms.map(x => ({ type: 'room' as const, id: x.id })),
      ...areas.map(x => ({ type: 'area' as const, id: x.id })),
      ...roofs.map(x => ({ type: 'roof' as const, id: x.id })),
      ...stairs.map(x => ({ type: 'stair' as const, id: x.id })),
      ...furniture.map(x => ({ type: 'furniture' as const, id: x.id })),
    ],
  }
}
