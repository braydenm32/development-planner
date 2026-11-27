// Putting a starter house into a plan, as one change: in place of what's drawn (or onto an empty
// block), in the middle of the block and facing the street; or beside a house already there.
// What comes in is ordinary plan data with fresh ids, so everything else treats it like a house
// drawn by hand.

import { centroidOf, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { meanGroundUnder } from '../plan/levelGround'
import { fflForGroundRL, fromSite, houseWalls, isRetaining, newId, sortedLevels, toSite, type Level, type Placement, type Plan } from '../plan/model'
import { houseBounds } from '../plan/ops'
import type { Selection } from '../plan/store'
import { edgeBearings, frontEdgeOf } from '../plan/streetSide'

export interface StarterSite {
  survey: Survey
  terrain: Terrain
}

/** Replace what's drawn (the house; the block, retaining walls and outdoor areas stay), or add it beside the house. */
export type StarterMode = 'replace' | 'beside'

/** The gap left between a house already drawn and a starter put beside it (m). */
export const BESIDE_GAP = 3

/** Whether the plan has a house drawn: then the person is asked before a starter goes in. */
export const hasHouse = (plan: Plan) => houseWalls(plan.walls).length > 0

export interface Placed {
  plan: Plan
  /** The level the house's lowest floor is on, to draw on next. */
  level: string
  /** What came in on that level, to select. */
  added: Selection[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** The starter with fresh ids throughout (two copies of one never clash), its levels given `levelIds`. */
function freshCopy(house: Plan, levelIds: Map<string, string>): Plan {
  const ids = new Map<string, string>()
  const fresh = (prefix: string, id: string) => {
    const n = newId(prefix)
    ids.set(id, n)
    return n
  }
  const lv = (id: string) => levelIds.get(id)!
  const walls = house.walls.map(w => ({ ...w, id: fresh('wall', w.id), level: lv(w.level) }))
  return {
    ...house,
    walls,
    openings: house.openings.map(o => ({ ...o, id: newId('opening'), wall: ids.get(o.wall)! })),
    rooms: house.rooms.map(r => ({ ...r, id: newId('room'), level: lv(r.level) })),
    roofs: house.roofs.map(r => ({ ...r, id: newId('roof'), level: lv(r.level) })),
    stairs: house.stairs.map(s => ({ ...s, id: newId('stair'), level: lv(s.level), ...(typeof s.toLevel === 'string' ? { toLevel: lv(s.toLevel) } : {}) })),
    furniture: house.furniture.map(f => ({ ...f, id: newId('furniture'), level: lv(f.level) })),
  }
}

/** The middle of the box round a plan's house walls (house frame). */
function middleOf(plan: Plan): Vec2 {
  const b = houseBounds(plan)
  return b ? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] : [0, 0]
}

/**
 * Where a starter goes on the block: its front to the street side when the plan knows it (else
 * at the house's present turn), its middle on the middle of the block, its lowest floor at the
 * mean ground under its walls, as a house's first walls set it (src/plan/levelGround.ts).
 */
export function starterPlacement(house: Plan, now: Plan, site: StarterSite | null): Placement {
  const boundary = site?.survey.boundary ?? []
  const front = site ? frontEdgeOf(now, boundary) : undefined
  const bearing = front === undefined ? null : edgeBearings(boundary)[front]
  // The house's front faces −y: turned 180° less the street's bearing, it faces the street.
  let rotation = bearing === null || bearing === undefined ? now.placement.rotation : 180 - bearing
  rotation = Math.round((((rotation % 360) + 540) % 360) * 10) / 10 - 180
  const mid = middleOf(house)
  // The middle lands on the block's middle (or, with no block, where the plan's origin was).
  const target: Vec2 = site ? centroidOf(boundary) : toSite([0, 0], now.placement, [0, 0])
  const origin: Vec2 = site ? site.survey.origin : [0, 0]
  const turned = toSite(mid, { e: 0, n: 0, rotation, ffl: 0 }, [0, 0])
  const at: Placement = { e: r2(target[0] + origin[0] - turned[0]), n: r2(target[1] + origin[1] - turned[1]), rotation, ffl: now.placement.ffl }
  if (!site) return at
  const lowest = sortedLevels(house)[0]?.id
  const mean = meanGroundUnder(
    house.walls.filter(w => w.level === lowest),
    { ...house, placement: at },
    site.survey,
    site.terrain.grid,
  )
  return mean === null ? at : { ...at, ffl: fflForGroundRL(house, Math.round(mean * 20) / 20) }
}

/** Put a starter house (a plan from ./houses, at the origin) into `plan`. */
export function placeStarter(plan: Plan, house: Plan, site: StarterSite | null, mode: StarterMode): Placed {
  return mode === 'beside' && hasHouse(plan) ? beside(plan, house) : replace(plan, house, site)
}

function replace(plan: Plan, house: Plan, site: StarterSite | null): Placed {
  // The starter's lowest level takes the id of the plan's, so what's kept on it stays on it.
  const lowest = sortedLevels(plan)[0]?.id ?? 'level_ground'
  const ordered = sortedLevels(house)
  const levelIds = new Map(ordered.map((l, i) => [l.id, i === 0 ? lowest : newId('level')]))
  const copy = freshCopy(house, levelIds)
  const levels: Level[] = house.levels.map(l => ({ ...l, id: levelIds.get(l.id)! }))
  const placement = starterPlacement(house, plan, site)
  // What stays (the retaining walls, outdoor areas, notes, sketch and sections) stays where it is on the block.
  const O: Vec2 = [0, 0]
  const keep = (p: Vec2): Vec2 => {
    const q = fromSite(toSite(p, plan.placement, O), placement, O)
    return [Math.round(q[0] * 1e4) / 1e4, Math.round(q[1] * 1e4) / 1e4]
  }
  const retaining = plan.walls.filter(isRetaining)
  const kept = new Set(retaining.map(w => w.id))
  const next: Plan = {
    ...plan,
    levels,
    walls: [...retaining.map(w => ({ ...w, a: keep(w.a), b: keep(w.b) })), ...copy.walls],
    openings: [...plan.openings.filter(o => kept.has(o.wall)), ...copy.openings],
    rooms: copy.rooms,
    roofs: copy.roofs,
    stairs: copy.stairs,
    furniture: copy.furniture,
    areas: plan.areas.map(a => ({ ...a, pts: a.pts.map(keep) })),
    ...(plan.notes ? { notes: plan.notes.map(n => ({ ...n, at: keep(n.at) })) } : {}),
    ...(plan.sketch ? { sketch: plan.sketch.map(s => ({ ...s, pts: s.pts.map(keep) })) } : {}),
    ...(plan.sections ? { sections: plan.sections.map(s => ({ ...s, a: keep(s.a), b: keep(s.b) })) } : {}),
    placement,
    floorsByLevel: true,
  }
  return { plan: next, level: lowest, added: [] }
}

function beside(plan: Plan, house: Plan): Placed {
  const b = houseBounds(plan)!
  const hb = houseBounds(house)!
  const dx = b.maxX + BESIDE_GAP - hb.minX
  const dy = b.minY - hb.minY
  const move = (p: Vec2): Vec2 => [Math.round((p[0] + dx) * 1e4) / 1e4, Math.round((p[1] + dy) * 1e4) / 1e4]
  // Each of its levels goes on the plan's level at the same height above the lowest floor, or a new one.
  const base = sortedLevels(plan)[0]?.elevation ?? 0
  const levels = [...plan.levels]
  const levelIds = new Map<string, string>()
  for (const l of sortedLevels(house)) {
    const same = plan.levels.find(x => Math.abs(x.elevation - (base + l.elevation)) < 0.005)
    if (same) {
      levelIds.set(l.id, same.id)
      continue
    }
    let name = l.name
    for (let n = 2; levels.some(x => x.name === name); n++) name = `${l.name} ${n}`
    const id = newId('level')
    levels.push({ ...l, id, name, elevation: base + l.elevation })
    levelIds.set(l.id, id)
  }
  const c = freshCopy(house, levelIds)
  const copy = {
    walls: c.walls.map(w => ({ ...w, a: move(w.a), b: move(w.b) })),
    rooms: c.rooms.map(r => ({ ...r, at: move(r.at) })),
    roofs: c.roofs.map(r => ({ ...r, pts: r.pts.map(move) })),
    stairs: c.stairs.map(s => ({ ...s, at: move(s.at) })),
    furniture: c.furniture.map(f => ({ ...f, at: move(f.at) })),
  }
  const level = levelIds.get(sortedLevels(house)[0].id)!
  const on = <T extends { id: string; level: string }>(xs: T[], type: Selection['type']) => xs.filter(x => x.level === level).map(x => ({ type, id: x.id }) as Selection)
  return {
    plan: {
      ...plan,
      levels,
      walls: [...plan.walls, ...copy.walls],
      openings: [...plan.openings, ...c.openings],
      rooms: [...plan.rooms, ...copy.rooms],
      roofs: [...plan.roofs, ...copy.roofs],
      stairs: [...plan.stairs, ...copy.stairs],
      furniture: [...plan.furniture, ...copy.furniture],
    },
    level,
    added: [...on(copy.walls, 'wall'), ...on(copy.rooms, 'room'), ...on(copy.roofs, 'roof'), ...on(copy.stairs, 'stair'), ...on(copy.furniture, 'furniture')],
  }
}
