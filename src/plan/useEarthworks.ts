import { useMemo } from 'react'
import {
  evaluateEarthworks,
  prepareEarthworks,
  type Barrier,
  type EarthworksResult,
  type Platform,
  type PreparedEarthworks,
} from '../lib/earthworks'
import type { Survey } from '../lib/survey'
import type { Heightfield, Terrain } from '../lib/terrain'
import type { WallStrip } from '../lib/terrainMesh'
import { gradingPlatforms } from '../grading/model'
import { drivewayPlatforms } from './driveway'
import { earthworksOf, type Earthworks, type Plan } from './model'
import { earthworksPlatforms, retainingStrips } from './platforms'
import { piecePlatforms, pieceSpecs, type PieceSpec } from './groundPieces'

export interface Earth {
  prep: PreparedEarthworks
  result: EarthworksResult
  platforms: Platform[]
  /** The retaining walls' footprints, which the finished ground's step stays inside in 3D. */
  strips: WallStrip[]
}

/**
 * What the finished ground is worked out from: the levelled areas (the house's, the painted grading
 * and driveways), the settings, the retaining walls, and the pools and tanks set in or on the ground
 * (whose levels follow the natural ground, so they're read in earthFrom).
 */
export type EarthInputs = [Platform[], Earthworks, WallStrip[], PieceSpec[]?]

export function earthInputs(plan: Plan, survey: Pick<Survey, 'origin' | 'boundary'>): EarthInputs {
  // Driveways with levels of their own are graded in with the rest: one finished ground for all.
  return [
    [...earthworksPlatforms(plan, survey.origin), ...gradingPlatforms(plan, survey.origin), ...drivewayPlatforms(plan, survey.origin, survey.boundary)],
    earthworksOf(plan),
    retainingStrips(plan, survey.origin),
    pieceSpecs(plan, survey.origin),
  ]
}

/** Cut and fill on the natural ground for those inputs. */
export function earthFrom(natural: Heightfield, boundary: Survey['boundary'], [house, opts, walls, specs = []]: EarthInputs): Earth {
  const pieces = piecePlatforms(specs, natural)
  const platforms = pieces.platforms.length ? [...house, ...pieces.platforms] : house
  const strips = pieces.strips.length ? [...walls, ...pieces.strips] : walls
  // Retaining walls are the lines cut and fill stops at; a pool's shell only holds its own hole.
  const barriers = walls.map((s): Barrier => [s.a, s.b])
  const prep = prepareEarthworks(natural, boundary, platforms, opts, barriers)
  return { prep, result: evaluateEarthworks(prep), platforms, strips }
}

/** Cut and fill for the plan, worked out again only when the levelled areas or settings change. */
export function useEarthworks(plan: Plan | null, survey: Survey | null, terrain: Terrain | null): Earth | null {
  const key = plan && survey ? JSON.stringify(earthInputs(plan, survey)) : ''
  return useMemo(() => {
    if (!key || !terrain || !survey) return null
    return earthFrom(terrain.grid, survey.boundary, JSON.parse(key) as EarthInputs)
  }, [key, terrain, survey])
}
