// What a starter's card says about it, read from the plan itself rather than written beside it,
// so the card can't claim a bedroom the plan doesn't have.

import { grossFloorArea } from '../plan/keyNumbers'
import { houseWalls, sortedLevels, type Plan } from '../plan/model'
import { roomWet } from '../plan/roomTypes'

export interface StarterFacts {
  bedrooms: number
  /** Bathrooms and ensuites. */
  bathrooms: number
  /** Cars the garage doors take: a door 4 m or wider takes two. */
  cars: number
  /** Storeys one over another; a split level's two levels side by side are one. */
  storeys: number
  /** Levels side by side: a split level. */
  split: boolean
  /** Overall, to the outside of the walls (m). */
  width: number
  depth: number
  /** The app's Floor area: every level to the outside of its walls (m²). */
  area: number
}

export function starterFacts(plan: Plan): StarterFacts {
  const walls = houseWalls(plan.walls)
  const xs = walls.flatMap(w => [w.a[0] - w.thickness / 2, w.b[0] - w.thickness / 2, w.a[0] + w.thickness / 2, w.b[0] + w.thickness / 2])
  const ys = walls.flatMap(w => [w.a[1] - w.thickness / 2, w.b[1] - w.thickness / 2, w.a[1] + w.thickness / 2, w.b[1] + w.thickness / 2])
  // A level starts a new storey when it's at least a storey's height above the last one's floor.
  let storeys = 0
  let base = -Infinity
  let baseHeight = 0
  for (const l of sortedLevels(plan)) {
    if (l.elevation - base >= baseHeight) {
      storeys++
      base = l.elevation
      baseHeight = l.height
    }
  }
  return {
    bedrooms: plan.rooms.filter(r => r.type === 'bedroom').length,
    bathrooms: plan.rooms.filter(r => roomWet(r) === 'bathroom').length,
    cars: plan.openings.filter(o => o.kind === 'garage').reduce((n, o) => n + (o.width >= 4 ? 2 : 1), 0),
    storeys,
    split: plan.levels.length > storeys,
    width: walls.length ? Math.max(...xs) - Math.min(...xs) : 0,
    depth: walls.length ? Math.max(...ys) - Math.min(...ys) : 0,
    area: grossFloorArea(plan).outside,
  }
}

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`

/** "3 bed · 2 bath · 1 car · single storey", for the card's first line. */
export function factsLine(f: StarterFacts): string {
  const storey = f.split ? 'split level' : f.storeys === 1 ? 'single storey' : `${f.storeys} storeys`
  return [`${f.bedrooms} bed`, `${f.bathrooms} bath`, f.cars ? n(f.cars, 'car') : 'no garage', storey].join(' · ')
}

/** "9.3 × 18.3 m · 169 m²": overall width (across the front) by depth, and floor area. */
export function sizeLine(f: StarterFacts): string {
  return `${f.width.toFixed(1)} × ${f.depth.toFixed(1)} m · ${Math.round(f.area)} m²`
}
