// The numbers the summary strip and the Overview show. Every one comes from the same helper
// as the panel that is its home (CALM 8), so a number reads the same wherever it appears.

import { useMemo } from 'react'
import { usePlacementInfo, useRetainingWalls } from '../components/planNumbers'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { balancingShift } from '../lib/earthworks'
import { needsEngineer } from '../checks/engineer'
import { balancedRL as balanceTo, boundarySides, crossedBoundaries, levelSummaries, movesFloor, roofAboveGround, type PlacementInfo } from '../plan/keyNumbers'
import { housePadRL } from '../plan/platforms'
import { floorRL, levelById, sortedLevels, type Plan, type Roof } from '../plan/model'
import { roofGeometry } from '../plan/roof'
import type { Earth } from '../plan/useEarthworks'
import type { SunFacts } from '../sun/facts'
import { useSunFacts } from '../sun/useSun'

export interface KeyNumbers {
  /** Each level's floor area (outside of walls), lowest first. */
  levels: { id: string; name: string; area: number; roomsTotal: number; rooms: number }[]
  /** All levels' floor areas together; null before any walls enclose a floor. */
  floorArea: number | null
  /** The ground floor's RL. */
  ffl: number
  /** Every level's floor RL, lowest first: a split-level house has more than one floor level. */
  floors: { id: string; name: string; rl: number }[]
  earth: {
    cut: number
    fill: number
    /** Cut less fill: more than zero is soil to take away. */
    net: number
    pad: number
    deepestCut: number
    deepestFill: number
    /** Where Balance would put the floor, to the 10 mm it sets; null when it can't. */
    balancedRL: number | null
    outOfBalance: boolean
  } | null
  retaining: { count: number; length: number; maxHeight: number; face: number; engineer: boolean } | null
  /** The roof that rises highest above the ground (the building's height). */
  roof: RoofNumbers | null
  /** Every roof that builds, highest first. */
  roofs: RoofNumbers[]
  /** All the roofs' areas together (their sloping surface); 0 with none. */
  roofArea: number
  /** Sides of the block the batters run into. */
  batterSides: string[]
  /** The same, in words: "the north and east boundaries", "all four boundaries"; null when none. */
  batters: string | null
  placement: PlacementInfo | null
  /** Winter sun to the living areas and the shadow over the boundary, on 21 June. */
  sun?: SunFacts | null
}

export interface RoofNumbers {
  roof: Roof
  /** The most it rises above the natural ground under it. */
  height: number
  /** RL of its highest point. */
  top: number
  area: number
}

export function useKeyNumbers(plan: Plan, survey: Survey, terrain: Terrain, earth: Earth | null): KeyNumbers {
  const summary = useMemo(() => levelSummaries(plan), [plan])
  const walls = useRetainingWalls(plan, survey, terrain, earth)
  const placement = usePlacementInfo(plan, survey, terrain)
  const sun = useSunFacts(plan, survey, terrain, earth)
  const ffl = floorRL(plan)
  // Balance searches for the level where cut and fill are equal; only redo it when the earthworks change.
  const shift = useMemo(() => (earth && earth.platforms.length > 0 ? balancingShift(earth.prep) : null), [earth])
  const balancedRL = balanceTo(ffl, shift)
  const roofs = useMemo(() => {
    const out: RoofNumbers[] = []
    for (const r of plan.roofs) {
      const g = roofGeometry(r)
      if (g.error) continue
      const base = floorRL(plan, r.level) + (levelById(plan, r.level)?.height ?? 0)
      out.push({ roof: r, height: roofAboveGround(plan, r, g, survey, terrain), top: base + g.height, area: g.area })
    }
    return out.sort((a, b) => b.height - a.height)
  }, [plan, survey, terrain])
  const floors = useMemo(() => sortedLevels(plan).map(l => ({ id: l.id, name: l.name, rl: floorRL(plan, l.id) })), [plan])

  return useMemo(() => {
    const levels = summary.map(s => ({
      id: s.level.id,
      name: s.level.name,
      area: s.gross.area,
      roomsTotal: s.rooms.reduce((t, r) => t + (r.area ?? 0), 0),
      rooms: s.rooms.length,
    }))
    const total = levels.reduce((t, l) => t + l.area, 0)
    const r = earth?.result
    const hasEarth = !!r && !!earth && earth.platforms.length > 0
    return {
      levels,
      floorArea: total > 0 ? total : null,
      ffl,
      floors,
      earth: hasEarth
        ? {
            cut: r.cut,
            fill: r.fill,
            net: r.cut - r.fill,
            pad: housePadRL(plan),
            deepestCut: r.maxCut,
            deepestFill: r.maxFill,
            balancedRL,
            outOfBalance: movesFloor(balancedRL, ffl),
          }
        : null,
      retaining: walls.length
        ? {
            count: walls.length,
            length: walls.reduce((t, w) => t + w.length, 0),
            maxHeight: Math.max(...walls.map(w => w.maxHeight)),
            face: walls.reduce((t, w) => t + w.faceArea, 0),
            engineer: walls.some(w => needsEngineer(w.maxHeight)),
          }
        : null,
      roof: roofs[0] ?? null,
      roofs,
      roofArea: roofs.reduce((t, r) => t + r.area, 0),
      batterSides: hasEarth ? boundarySides(r, survey) : [],
      batters: hasEarth ? crossedBoundaries(r, survey) : null,
      placement,
      sun,
    }
  }, [plan, summary, earth, ffl, floors, balancedRL, walls, roofs, survey, placement, sun])
}
