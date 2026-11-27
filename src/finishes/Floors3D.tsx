// The floor finishes seen from inside (with the roof off, or walking through): a thin surface on
// each room's floor, inside its walls, in the finish picked for its kind of room. A room on a
// plain floor gets nothing, so the floor structure shows as it always has.

import { useEffect, useMemo } from 'react'
import type { Vec2 } from '../lib/geom'
import type { Plan } from '../plan/model'
import { useFloorMaterials } from './materials'
import { floorGeometries } from './surfaces'

interface Props {
  plan: Plan
  origin: Vec2
  refZ: number
  showLevels: Set<string> | null
}

export function Floors3D({ plan, origin, refZ, showLevels }: Props) {
  const geoms = useMemo(() => floorGeometries(plan, origin, refZ, showLevels), [plan, origin, refZ, showLevels])
  useEffect(() => () => geoms.forEach(g => g.dispose()), [geoms])
  const mats = useFloorMaterials([...geoms.keys()])
  return (
    <>
      {[...geoms].map(([finish, g]) => {
        const m = mats.get(finish)
        return m ? <mesh key={finish} name={`floor-${finish}`} geometry={g} material={m} receiveShadow /> : null
      })}
    </>
  )
}
