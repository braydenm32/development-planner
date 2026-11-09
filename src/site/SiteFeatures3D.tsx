import { useMemo } from 'react'
import * as THREE from 'three'
import { drapePolygon } from '../lib/drape'
import { pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import { triangulate } from '../lib/triangulate'
import { BUILDING_HEIGHT, FENCE_HEIGHT, serviceInfo, TREE_DEFAULT, type SiteFeature } from './model'
import { useSiteFeatures } from './store'
import { clipToBoundary, linePartsOnBlock, nearBlock, ringDistance } from './shape'

/**
 * Site features in the 3D view, on the ground the block shows: trees with trunk and canopy,
 * fence panels, buildings as boxes, easements hatched on the ground, and services as
 * coloured lines along it. Only what reaches the block is shown, as the ground stops at
 * its boundary. Scene: x = east, y = RL − refZ, z = −north (inside the exaggeration group).
 */
export function SiteFeatures3D({ boundary, ground, refZ }: { boundary: Vec2[]; ground: Heightfield; refZ: number }) {
  const features = useSiteFeatures()
  const shown = useMemo(() => features.filter(f => nearBlock(f, boundary)), [features, boundary])
  return (
    <group>
      {shown.map(f => (
        <Feature key={f.id} f={f} boundary={boundary} ground={ground} refZ={refZ} />
      ))}
    </group>
  )
}

function Feature({ f, boundary, ground, refZ }: { f: SiteFeature; boundary: Vec2[]; ground: Heightfield; refZ: number }) {
  const g = f.geom
  // The ground stops at the boundary, so only what stands on the block (or right on its edge) is drawn.
  const onBlock = (p: Vec2) => pointInPolygon(p[0], p[1], boundary) || ringDistance(p, boundary) <= 0.5
  if (g.kind === 'point' && !onBlock(g.at)) return null
  if (f.type === 'tree' && g.kind === 'point') return <Tree f={f} at={g.at} ground={ground} refZ={refZ} />
  if (g.kind === 'area') {
    if (f.type === 'building') return g.pts.some(onBlock) ? <Building f={f} pts={g.pts} ground={ground} refZ={refZ} /> : null
    return <Patch f={f} pts={g.pts} boundary={boundary} ground={ground} refZ={refZ} />
  }
  if (g.kind === 'line') return <LineParts f={f} pts={g.pts} boundary={boundary} ground={ground} refZ={refZ} />
  if (f.type === 'service' || f.type === 'other') {
    const color = f.type === 'service' ? serviceInfo(f.service).color : '#6b7078'
    const y = ground.sample(g.at[0], g.at[1]) - refZ
    return (
      <mesh position={[g.at[0], y + 0.2, -g.at[1]]}>
        <cylinderGeometry args={[0.18, 0.18, 0.4, 12]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    )
  }
  return null
}

function LineParts({ f, pts, boundary, ground, refZ }: { f: SiteFeature; pts: Vec2[]; boundary: Vec2[]; ground: Heightfield; refZ: number }) {
  const parts = useMemo(() => linePartsOnBlock(pts, boundary), [pts, boundary])
  return (
    <>
      {parts.map((part, i) =>
        f.type === 'fence' ? (
          <Fence key={i} pts={part} height={f.height ?? FENCE_HEIGHT} ground={ground} refZ={refZ} />
        ) : (
          <Line key={i} f={f} pts={part} ground={ground} refZ={refZ} />
        ),
      )}
    </>
  )
}

function Tree({ f, at, ground, refZ }: { f: SiteFeature; at: Vec2; ground: Heightfield; refZ: number }) {
  const h = f.height ?? TREE_DEFAULT.height
  const r = Math.max((f.canopy ?? TREE_DEFAULT.canopy) / 2, 0.3)
  const trunk = Math.max((f.trunk ?? TREE_DEFAULT.trunk) / 2, 0.04)
  // The canopy is a squashed ball over the top ~60% of the tree.
  const crown = Math.max(Math.min(h * 0.3, r * 1.1), 0.4)
  const y = ground.sample(at[0], at[1]) - refZ
  const ghost = !!f.remove
  return (
    <group position={[at[0], y, -at[1]]}>
      <mesh position={[0, (h - crown) / 2, 0]} castShadow>
        <cylinderGeometry args={[trunk * 0.8, trunk, h - crown, 10]} />
        <meshStandardMaterial color="#6b4f2f" roughness={0.9} transparent={ghost} opacity={ghost ? 0.3 : 1} />
      </mesh>
      <mesh position={[0, h - crown, 0]} scale={[r, crown, r]} castShadow={!ghost}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color={ghost ? '#a9a39a' : '#6f9a5e'} roughness={0.95} transparent opacity={ghost ? 0.22 : 0.88} depthWrite={!ghost} />
      </mesh>
    </group>
  )
}

/** Points along a polyline no further apart than the ground's grid, each at ground level + lift. */
function draped(pts: Vec2[], ground: Heightfield, refZ: number, lift: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  for (let k = 0; k + 1 < pts.length; k++) {
    const [x1, y1] = pts[k]
    const [x2, y2] = pts[k + 1]
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / ground.cell))
    for (let s = 0; s < steps; s++) {
      const x = x1 + ((x2 - x1) * s) / steps
      const y = y1 + ((y2 - y1) * s) / steps
      out.push(new THREE.Vector3(x, ground.sample(x, y) - refZ + lift, -y))
    }
  }
  const last = pts[pts.length - 1]
  out.push(new THREE.Vector3(last[0], ground.sample(last[0], last[1]) - refZ + lift, -last[1]))
  return out
}

function Line({ f, pts, ground, refZ }: { f: SiteFeature; pts: Vec2[]; ground: Heightfield; refZ: number }) {
  const line = useMemo(() => {
    const geom = new THREE.BufferGeometry().setFromPoints(draped(pts, ground, refZ, 0.05))
    const color = f.type === 'service' ? serviceInfo(f.service).color : f.type === 'kerb' ? '#4a4f57' : '#7a7f87'
    const mat =
      f.type === 'service' || f.type === 'other'
        ? new THREE.LineDashedMaterial({ color, dashSize: 0.8, gapSize: 0.35 })
        : new THREE.LineBasicMaterial({ color })
    const l = new THREE.Line(geom, mat)
    l.computeLineDistances()
    return l
  }, [f, pts, ground, refZ])
  return <primitive object={line} />
}

function Fence({ pts, height, ground, refZ }: { pts: Vec2[]; height: number; ground: Heightfield; refZ: number }) {
  const geom = useMemo(() => {
    const base = draped(pts, ground, refZ, 0)
    const v: number[] = []
    for (let i = 0; i + 1 < base.length; i++) {
      const a = base[i]
      const b = base[i + 1]
      v.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y + height, b.z, a.x, a.y, a.z, b.x, b.y + height, b.z, a.x, a.y + height, a.z)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.computeVertexNormals()
    return g
  }, [pts, height, ground, refZ])
  return (
    <mesh geometry={geom} castShadow>
      <meshStandardMaterial color="#7d8288" roughness={0.85} side={THREE.DoubleSide} transparent opacity={0.92} />
    </mesh>
  )
}

function Building({ f, pts, ground, refZ }: { f: SiteFeature; pts: Vec2[]; ground: Heightfield; refZ: number }) {
  const geom = useMemo(() => {
    const ring = signedArea(pts) < 0 ? [...pts].reverse() : pts
    const base = Math.min(...ring.map(p => ground.sample(p[0], p[1]))) - refZ
    const top = base + (f.height ?? BUILDING_HEIGHT)
    const v: number[] = []
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      v.push(a[0], base, -a[1], b[0], base, -b[1], b[0], top, -b[1], a[0], base, -a[1], b[0], top, -b[1], a[0], top, -a[1])
    }
    for (const [a, b, c] of triangulate(ring)) for (const k of [a, b, c]) v.push(ring[k][0], top, -ring[k][1])
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.computeVertexNormals()
    return g
  }, [f.height, pts, ground, refZ])
  const ghost = !!f.remove
  return (
    <mesh geometry={geom} castShadow={!ghost}>
      <meshStandardMaterial color={f.neighbour ? '#c9c4bc' : '#b9b2a6'} roughness={0.9} side={THREE.DoubleSide} transparent={ghost} opacity={ghost ? 0.3 : 1} />
    </mesh>
  )
}

let hatch: THREE.Texture | null = null
/** Diagonal hatching for easements, made once. */
function hatchTexture(): THREE.Texture {
  if (hatch) return hatch
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(184, 98, 47, 0.18)'
  g.fillRect(0, 0, 64, 64)
  g.strokeStyle = 'rgba(160, 80, 35, 0.85)'
  g.lineWidth = 7
  for (const o of [-64, 0, 64]) {
    g.beginPath()
    g.moveTo(o, 64)
    g.lineTo(o + 64, 0)
    g.stroke()
  }
  hatch = new THREE.CanvasTexture(c)
  hatch.wrapS = hatch.wrapT = THREE.RepeatWrapping
  hatch.colorSpace = THREE.SRGBColorSpace
  return hatch
}

/** An area laid on the ground: easements hatched, paving and the rest flat and pale. */
function Patch({ f, pts, boundary, ground, refZ }: { f: SiteFeature; pts: Vec2[]; boundary: Vec2[]; ground: Heightfield; refZ: number }) {
  const geom = useMemo(() => {
    const clipped = clipToBoundary(pts, boundary)
    const tri = clipped ? drapePolygon(ground, clipped, 0.04) : []
    const pos: number[] = []
    const uv: number[] = []
    for (let i = 0; i < tri.length; i += 9) {
      // A boundary that isn't convex is followed cell by cell instead.
      if (!clipped || clipped === pts) {
        const cx = (tri[i] + tri[i + 3] + tri[i + 6]) / 3
        const cy = (tri[i + 1] + tri[i + 4] + tri[i + 7]) / 3
        if (!pointInPolygon(cx, cy, boundary)) continue
      }
      for (let k = 0; k < 9; k += 3) {
        const x = tri[i + k]
        const y = tri[i + k + 1]
        pos.push(x, tri[i + k + 2] - refZ, -y)
        uv.push(x / 1.2, y / 1.2)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.computeVertexNormals()
    return g
  }, [pts, boundary, ground, refZ])
  if (f.type === 'easement') {
    return (
      <mesh geometry={geom} renderOrder={2}>
        <meshBasicMaterial map={hatchTexture()} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
    )
  }
  const color = f.type === 'paving' ? '#9a9fa6' : '#8d93a3'
  return (
    <mesh geometry={geom} renderOrder={1}>
      <meshBasicMaterial color={color} transparent opacity={f.type === 'paving' ? 0.45 : 0.25} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  )
}
