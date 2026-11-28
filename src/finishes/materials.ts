// The house's materials in 3D, from its finishes: plain three.js MeshStandardMaterials with the
// pattern as their `map` and the picked colour as their `color`, named for what they are
// ("finish-walls-brick"), so an export of the scene carries them. One of each is shared by every
// mesh that needs it; they're remade only when a finish changes, and the old ones disposed then.
// The patterns themselves are kept (src/finishes/textures.ts).

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { resolveFinishes, type FloorFinish, type Finishes, type RoofFinish, type WallFinish, FLOOR_FINISHES } from './model'
import { patternTexture, type Pattern } from './textures'

const WALL_LOOK: Record<WallFinish, { pattern?: Pattern; roughness: number }> = {
  plain: { roughness: 0.85 },
  brick: { pattern: 'brick', roughness: 0.92 },
  render: { pattern: 'render', roughness: 0.9 },
  weatherboard: { pattern: 'weatherboard', roughness: 0.8 },
}

const ROOF_LOOK: Record<RoofFinish, { pattern?: Pattern; roughness: number; metalness: number }> = {
  plain: { roughness: 0.7, metalness: 0.15 },
  metal: { pattern: 'metal', roughness: 0.55, metalness: 0.3 },
  tiles: { pattern: 'tiles', roughness: 0.85, metalness: 0 },
}

const FLOOR_LOOK: Record<FloorFinish, { pattern?: Pattern; roughness: number }> = {
  plain: { roughness: 0.9 },
  timber: { pattern: 'timber', roughness: 0.6 },
  tile: { pattern: 'floorTile', roughness: 0.45 },
  carpet: { pattern: 'carpet', roughness: 1 },
  concrete: { pattern: 'concrete', roughness: 0.5 },
}

function material(name: string, colour: string, look: { pattern?: Pattern; roughness: number; metalness?: number }) {
  const m = new THREE.MeshStandardMaterial({ name, color: colour, roughness: look.roughness, metalness: look.metalness ?? 0 })
  if (look.pattern) m.map = patternTexture(look.pattern)
  return m
}

export interface HouseMaterials {
  /** The outside walls: [outside face, inside face], for a geometry split by splitInsideFaces. */
  outsideWalls: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]
  insideWalls: THREE.MeshStandardMaterial
  roof: THREE.MeshStandardMaterial
}

export function houseMaterials(f: Finishes | undefined): HouseMaterials {
  const r = resolveFinishes(f)
  return {
    outsideWalls: [
      material(`finish-walls-${r.walls}`, r.wallColour, WALL_LOOK[r.walls]),
      material('finish-walls-inside', r.insideOfOutside, WALL_LOOK.plain),
    ],
    insideWalls: material('finish-inside-walls', r.inside, { roughness: 0.9 }),
    roof: material(`finish-roof-${r.roof}`, r.roofColour, ROOF_LOOK[r.roof]),
  }
}

export function floorMaterial(f: FloorFinish): THREE.MeshStandardMaterial {
  const m = material(`finish-floor-${f}`, FLOOR_FINISHES.find(x => x.id === f)!.colour, FLOOR_LOOK[f])
  // Laid on the floor structure: drawn over it, not fighting it.
  m.polygonOffset = true
  m.polygonOffsetFactor = -1
  m.polygonOffsetUnits = -1
  return m
}

const dispose = (ms: THREE.Material[]) => ms.forEach(m => m.dispose())

/** The house's materials, remade when its finishes change (and the old ones let go). */
export function useHouseMaterials(f: Finishes | undefined): HouseMaterials {
  // Keyed by the finishes' content, so an edit elsewhere in the plan keeps the same materials.
  const key = JSON.stringify(f ?? {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mats = useMemo(() => houseMaterials(f), [key])
  useEffect(() => () => dispose([...mats.outsideWalls, mats.insideWalls, mats.roof]), [mats])
  return mats
}

/** One material for each floor finish in use. */
export function useFloorMaterials(used: FloorFinish[]): Map<FloorFinish, THREE.MeshStandardMaterial> {
  const key = [...new Set(used)].sort().join(',')
  const mats = useMemo(() => new Map(key ? key.split(',').map(f => [f as FloorFinish, floorMaterial(f as FloorFinish)]) : []), [key])
  useEffect(() => () => dispose([...mats.values()]), [mats])
  return mats
}

/**
 * The outside walls' materials by finish (WallMesh.key): the house's own finish keeps the
 * house's pair, and each other finish in use gets its own outside material, sharing the house's
 * room-side one. Remade only when the set of finishes in use (or the house's) changes.
 */
export function useWallMaterials(keys: string[], house: HouseMaterials, houseKey: string): Map<string, THREE.Material[]> {
  const key = [...new Set(keys)].filter(k => k !== houseKey).sort().join(',')
  const own = useMemo(
    () =>
      new Map(
        (key ? key.split(',') : []).map(k => {
          const [walls, colour] = k.split('|') as [WallFinish, string]
          return [k, material(`finish-walls-${walls}`, colour, WALL_LOOK[walls] ?? WALL_LOOK.plain)] as const
        }),
      ),
    [key],
  )
  useEffect(() => () => dispose([...own.values()]), [own])
  return useMemo(() => {
    const out = new Map<string, THREE.Material[]>([[houseKey, house.outsideWalls]])
    for (const [k, m] of own) out.set(k, [m, house.outsideWalls[1]])
    return out
  }, [own, house, houseKey])
}
