// Doors and windows in the 3D view, drawn by their kind (src/plan/openingDetail.ts): frames,
// leaves shown closed, glass, tracks, sills and a garage door's ribs. Built once per plan change
// and merged into one mesh per piece, with materials shared by every house, so it costs a handful
// of draw calls and nothing per frame. The wall's hole and a window's pane stay House3D's own.

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Vec2 } from '../lib/geom'
import type { Plan } from '../plan/model'
import type { DetailPart } from '../plan/openingDetail'
import { openingDetailGeometry } from './openingMeshes'

interface Props {
  plan: Plan
  origin: Vec2
  refZ: number
  showLevels: Set<string> | null
}

/** One material for each kind of piece, made once. */
const MATERIALS: Record<DetailPart, THREE.Material> = {
  frame: new THREE.MeshStandardMaterial({ color: '#4a4f55', roughness: 0.5, metalness: 0.3 }),
  sill: new THREE.MeshStandardMaterial({ color: '#4a4f55', roughness: 0.5, metalness: 0.3 }),
  track: new THREE.MeshStandardMaterial({ color: '#7d838a', roughness: 0.5, metalness: 0.4 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#8a6a4c', roughness: 0.7 }),
  rib: new THREE.MeshStandardMaterial({ color: '#959ba2', roughness: 0.6, metalness: 0.2 }),
  glass: new THREE.MeshStandardMaterial({ color: '#8fb7d6', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false }),
}

export function OpeningDetail3D({ plan, origin, refZ, showLevels }: Props) {
  const meshes = useMemo(() => openingDetailGeometry(plan, origin, refZ, showLevels), [plan, origin, refZ, showLevels])
  useEffect(() => () => meshes.forEach(m => m.geometry.dispose()), [meshes])
  return (
    <group name="openings">
      {[...meshes].map(([name, m]) => (
        <mesh key={name} name={name} geometry={m.geometry} material={MATERIALS[m.part]} castShadow={m.part !== 'glass'} receiveShadow={m.part !== 'glass'} />
      ))}
    </group>
  )
}
