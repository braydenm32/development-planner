// Key numbers the panels, the summary strip and the Overview all show. Each is worked out
// here once, so a number reads the same wherever it appears (moved out of PlanSections).

import { balancingShift, type EarthworksResult, type PreparedEarthworks } from '../lib/earthworks'
import { centroidOf, signedArea, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import { bearingName, type Terrain } from '../lib/terrain'
import { buildingOutline, planarFaces, roomShape } from './geometry'
import { floorRL, levelById, sortedLevels, toSite, type Area, type Level, type Plan, type Placement, type Roof, type Room } from './model'
import { boundaryClearances, type BoundaryClearance } from './placement'
import { roofGeometry, type RoofGeometry } from './roof'

export interface LevelSummary {
  level: Level
  rooms: { room: Room; area: number | null }[]
  areas: { area: Area; size: number }[]
  /** The outside of the walls: its rings and floor area. */
  gross: { outlines: Vec2[][]; area: number }
}

/** Rooms, outdoor areas and floor area of each level, lowest first. */
export function levelSummaries(plan: Plan): LevelSummary[] {
  return sortedLevels(plan).map(l => {
    const walls = plan.walls.filter(w => w.level === l.id)
    const faces = planarFaces(walls)
    const rooms = plan.rooms.filter(r => r.level === l.id).map(r => ({ room: r, area: roomShape(r, faces)?.area ?? null }))
    const areas = plan.areas.filter(a => a.level === l.id).map(a => ({ area: a, size: Math.abs(signedArea(a.pts)) }))
    return { level: l, rooms, areas, gross: buildingOutline(faces) }
  })
}

/** A room's floor area, as the Rooms & areas panel works it out; null when its walls don't enclose it. */
export function roomArea(plan: Plan, room: Room): number | null {
  return roomShape(room, planarFaces(plan.walls.filter(w => w.level === room.level)))?.area ?? null
}

/** The most a roof rises above the natural ground directly under it, checked at every corner and ridge point. */
export function roofAboveGround(plan: Plan, r: Roof, g: RoofGeometry, survey: Survey, terrain: Terrain): number {
  const pl = plan.placement
  const level = levelById(plan, r.level)
  const base = floorRL(plan, r.level) + (level?.height ?? 0)
  let aboveGround = 0
  for (let i = 0; i < g.mesh.pos.length; i += 3) {
    const q = toSite([g.mesh.pos[i], g.mesh.pos[i + 1]], pl, survey.origin)
    aboveGround = Math.max(aboveGround, base + g.mesh.pos[i + 2] - terrain.grid.sample(q[0], q[1]))
  }
  return aboveGround
}

/** The roof that rises highest above the ground, with its height; null with no roofs that build. */
export function tallestRoof(plan: Plan, survey: Survey, terrain: Terrain): { roof: Roof; height: number } | null {
  let best: { roof: Roof; height: number } | null = null
  for (const r of plan.roofs) {
    const g = roofGeometry(r)
    if (g.error) continue
    const height = roofAboveGround(plan, r, g, survey, terrain)
    if (!best || height > best.height) best = { roof: r, height }
  }
  return best
}

/** Which sides of the block the batters run into, by the way each side faces ("north"). */
export function boundarySides(r: EarthworksResult, survey: Survey): string[] {
  return [
    ...new Set(
      r.boundaryEdges.map(i => {
        const a = survey.boundary[i]
        const b = survey.boundary[(i + 1) % survey.boundary.length]
        return bearingName(((Math.atan2(b[1] - a[1], -(b[0] - a[0])) * 180) / Math.PI + 360) % 360)
      }),
    ),
  ]
}

/** "east, north and west" */
export const andList = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

const ALL = ['', '', 'both', 'all three', 'all four', 'all five', 'all six']

/**
 * Which boundaries the batters cross, in words: "the south boundary", "the north and east
 * boundaries", "all four boundaries". Null when they cross none.
 */
export function crossedBoundaries(r: EarthworksResult, survey: Survey): string | null {
  const edges = new Set(r.boundaryEdges)
  if (!edges.size) return null
  const n = survey.boundary.length
  if (edges.size === n && n > 1) return ALL[n] ? `${ALL[n]} boundaries` : 'every boundary'
  const sides = boundarySides(r, survey)
  return `the ${andList(sides)} boundar${sides.length > 1 ? 'ies' : 'y'}`
}

export interface PlacementInfo {
  /** Natural ground at the outline's corners. */
  minRL: number
  maxRL: number
  /** Natural ground at the middle of the house. */
  centreRL: number
  /** Distance from the house to each side of the block. */
  sides: BoundaryClearance[]
}

/** The ground under the house and its distance to each side of the block, from the ground floor's outline. */
export function placementInfo(gross: Vec2[][], pl: Placement, survey: Survey, terrain: Terrain): PlacementInfo | null {
  const outline = gross.flat()
  if (!outline.length) return null
  const site = outline.map(p => toSite(p, pl, survey.origin))
  const levels = site.map(p => terrain.grid.sample(p[0], p[1]))
  const centre = toSite(centroidOf(gross[0]), pl, survey.origin)

  // Distance from the house to each side of the block.
  const sides = boundaryClearances(gross, pl, survey)
  return {
    minRL: Math.min(...levels),
    maxRL: Math.max(...levels),
    centreRL: terrain.grid.sample(centre[0], centre[1]),
    sides,
  }
}

/** Label for a side of the block: "North side", or "North side (2)" when two sides face the same way. */
export function sideLabel(sides: BoundaryClearance[], s: BoundaryClearance): string {
  const same = sides.filter(x => x.name === s.name)
  return `${s.name[0].toUpperCase()}${s.name.slice(1)} side${same.length > 1 ? ` (${same.indexOf(s) + 1})` : ''}`
}

/** The floor RL Balance sets: the floor moved by the balancing shift, to the nearest 10 mm; null if there is no shift. */
export const balancedRL = (ffl: number, shift: number | null): number | null => (shift === null ? null : Math.round((ffl + shift) * 100) / 100)

/** The floor RL where cut and fill are about equal, to the 10 mm that Balance sets; null if it can't be found. */
export function balancedFloorRL(plan: Plan, prep: PreparedEarthworks): number | null {
  return balancedRL(floorRL(plan), balancingShift(prep))
}

/** Whether Balance would move the floor from `ffl` to `balanced`: it sets the floor to the nearest 10 mm, so anything less is balanced. */
export const movesFloor = (balanced: number | null, ffl: number): boolean => balanced !== null && Math.abs(balanced - ffl) >= 0.005

/** Whether cut and fill are out of balance: Balance would move the floor. */
export function outOfBalance(plan: Plan, prep: PreparedEarthworks): boolean {
  return movesFloor(balancedFloorRL(plan, prep), floorRL(plan))
}

/** Retaining walls past this height (ground to ground) need an engineer's design: the retaining wall panel's own figure. */
export { ENGINEER_HEIGHT } from './retaining'
