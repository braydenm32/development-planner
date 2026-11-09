import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useState, type RefObject } from 'react'
import { CameraRig } from '../phone/CameraRig'
import { useCamera } from '../phone/cameraStore'
import { useTouchCanvas } from '../phone/device'
import { siteFrame } from '../phone/frame'
import { GroundPin } from '../phone/GroundPin'
import type { Pin } from '../phone/pin'
import * as THREE from 'three'
import { CUT_RGB, elevationColor, FILL_RGB } from '../lib/colors'
import { pointInPolygon } from '../lib/geom'
import type { ViewSettings } from '../lib/storage'
import type { Survey, SurveyPoint } from '../lib/survey'
import type { Heightfield, Terrain } from '../lib/terrain'
import type { SiteSolid } from '../lib/terrainMesh'
import type { Plan } from '../plan/model'
import { SiteFeatures3D } from '../site/SiteFeatures3D'
import { House3D } from './House3D'

export interface HoverInfo {
  e: number
  n: number
  rl: number
  label?: string
}

interface Props {
  survey: Survey
  terrain: Terrain
  solid: SiteSolid
  view: ViewSettings
  onHover: (h: HoverInfo | null) => void
  compassRef: RefObject<HTMLDivElement | null>
  plan: Plan | null
  /** The ground as shown: natural, or finished after cut and fill. */
  ground: Heightfield
  /** True when `ground` and `solid` show the finished ground. */
  cutFill: boolean
  /** Compass bearing to put at the top of the screen when the camera starts. */
  upBearing: number
}

/** Scene units are metres: x = east, y = up (RL - refZ), z = south. */
export function SiteView(props: Props) {
  const { terrain } = props
  const refZ = Math.floor(terrain.stats.minRL) - 1
  const { grid } = terrain
  const cx = grid.x0 + ((grid.nx - 1) * grid.cell) / 2
  const cy = grid.y0 + ((grid.ny - 1) * grid.cell) / 2
  const span = Math.max((grid.nx - 1) * grid.cell, (grid.ny - 1) * grid.cell)
  const midY = ((terrain.stats.minRL + terrain.stats.maxRL) / 2 - refZ) * props.view.exaggeration

  // Start on the far side from the bearing that should be at the top of the screen, looking towards it.
  const b = ((props.upBearing + 180) * Math.PI) / 180
  const dist = span * 1.35
  const camPos: [number, number, number] = [cx + Math.sin(b) * dist, midY + span * 0.8, -(cy + Math.cos(b) * dist)]

  // The new layout: presets, a remembered camera, and a tap on the ground to read its level.
  const touch = useTouchCanvas()
  const frame = useMemo(
    () => (touch ? siteFrame(props.plan, props.survey, terrain, refZ, props.view.exaggeration) : null),
    [touch, props.plan, props.survey, terrain, refZ, props.view.exaggeration],
  )
  const [pin, setPin] = useState<Pin | null>(null)
  // A camera view starts clean: the level read off the ground goes with the old view.
  useEffect(() => useCamera.subscribe((s, prev) => s.command !== prev.command && setPin(null)), [])

  return (
    <Canvas
      camera={{ position: camPos, fov: 40, near: 0.1, far: span * 50 }}
      shadows="percentage"
      flat
      dpr={[1, 2]}
      onPointerMissed={touch ? () => setPin(null) : undefined}
    >
      <color attach="background" args={['#eef1f4']} />
      <hemisphereLight args={['#ffffff', '#8d8270', 1.6]} />
      <directionalLight
        position={[cx - span, span * 1.5, -cy - span * 0.6]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
      />
      <OrbitControls
        makeDefault
        target={[cx, midY, -cy]}
        maxPolarAngle={Math.PI * 0.495}
        minDistance={span * 0.15}
        maxDistance={span * 6}
      />
      <Compass compassRef={props.compassRef} />
      {touch && frame && <CameraRig frame={frame} storageKey={touch.projectKey} phone={touch.phone} upBearing={props.upBearing} hasPlan={!!props.plan} />}
      <Site {...props} refZ={refZ} onPin={touch ? setPin : undefined} />
      {pin && <GroundPin pin={pin} />}
    </Canvas>
  )
}

function Compass({ compassRef }: { compassRef: RefObject<HTMLDivElement | null> }) {
  const controls = useThree(s => s.controls) as unknown as { getAzimuthalAngle(): number } | null
  useFrame(() => {
    if (!controls || !compassRef.current) return
    // Azimuth 0 means the camera looks towards -z (north); rotate the needle to match.
    const az = controls.getAzimuthalAngle()
    compassRef.current.style.transform = `rotate(${(-az * 180) / Math.PI}deg)`
  })
  return null
}

const CUT = new THREE.Color().setRGB(...CUT_RGB, THREE.SRGBColorSpace)
const FILL = new THREE.Color().setRGB(...FILL_RGB, THREE.SRGBColorSpace)

function Site({ survey, terrain, solid, view, onHover, refZ, plan, ground, cutFill, onPin }: Props & { refZ: number; onPin?: (p: Pin) => void }) {
  const { grid, stats } = terrain
  const exag = view.exaggeration

  const { surface, sides } = useMemo(() => {
    const p = solid.positions
    const n = p.length / 3
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    const c = new THREE.Color()
    for (let i = 0; i < n; i++) {
      pos[3 * i] = p[3 * i]
      pos[3 * i + 1] = p[3 * i + 2] - refZ
      pos[3 * i + 2] = -p[3 * i + 1]
      // The ramp is defined in sRGB; vertex colours are linear.
      const [r, g, b] = elevationColor(p[3 * i + 2], stats.minRL, stats.maxRL)
      c.setRGB(r, g, b, THREE.SRGBColorSpace)
      if (cutFill) {
        // Tint cut ground orange and filled ground blue, stronger the deeper it goes.
        const dz = p[3 * i + 2] - grid.sample(p[3 * i], p[3 * i + 1])
        if (Math.abs(dz) > 0.02) c.lerp(dz < 0 ? CUT : FILL, Math.min(0.85, 0.35 + Math.abs(dz) * 0.4))
      }
      col[3 * i] = c.r
      col[3 * i + 1] = c.g
      col[3 * i + 2] = c.b
    }
    const surface = new THREE.BufferGeometry()
    surface.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    surface.setAttribute('color', new THREE.BufferAttribute(col, 3))
    surface.setIndex(new THREE.BufferAttribute(solid.indices.slice(0, solid.surfaceIndexCount), 1))
    surface.computeVertexNormals()

    const sidesIndexed = new THREE.BufferGeometry()
    sidesIndexed.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    sidesIndexed.setIndex(new THREE.BufferAttribute(solid.indices.slice(solid.surfaceIndexCount), 1))
    const sides = sidesIndexed.toNonIndexed()
    sides.computeVertexNormals()
    sidesIndexed.dispose()
    return { surface, sides }
  }, [solid, refZ, stats.minRL, stats.maxRL, cutFill, grid])

  const contourLines = useMemo(() => {
    const build = (major: boolean) => {
      const verts: number[] = []
      for (const c of survey.contours) {
        if (c.major !== major) continue
        for (let k = 0; k + 1 < c.pts.length; k++) {
          const [x1, y1] = c.pts[k]
          const [x2, y2] = c.pts[k + 1]
          const mx = (x1 + x2) / 2
          const my = (y1 + y2) / 2
          if (!pointInPolygon(mx, my, survey.boundary)) continue
          // Natural contours mean nothing where the ground has been cut or filled.
          if (Math.abs(ground.sample(mx, my) - grid.sample(mx, my)) > 0.05) continue
          // Drape on the modelled surface so lines sit exactly on the ground.
          verts.push(x1, ground.sample(x1, y1) - refZ, -y1, x2, ground.sample(x2, y2) - refZ, -y2)
        }
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
      return g
    }
    return { major: build(true), minor: build(false) }
  }, [survey, grid, ground, refZ])

  const hoverSurface = (e: ThreeEvent<PointerEvent>) => {
    const x = e.point.x
    const y = -e.point.z
    const rl = ground.sample(x, y)
    const dz = rl - grid.sample(x, y)
    const label = Math.abs(dz) > 0.02 ? `${dz < 0 ? 'Cut' : 'Fill'} ${Math.abs(dz).toFixed(2)} m (natural ground RL ${grid.sample(x, y).toFixed(2)})` : undefined
    onHover({ e: x + survey.origin[0], n: y + survey.origin[1], rl, label })
  }

  // A tap (not the end of a drag) pins the ground's level where it landed.
  const pinSurface = (e: ThreeEvent<MouseEvent>) => {
    if (!onPin || e.delta > 8) return
    e.stopPropagation()
    const x = e.point.x
    const y = -e.point.z
    const rl = ground.sample(x, y)
    const dz = rl - grid.sample(x, y)
    onPin({ at: [e.point.x, e.point.y, e.point.z], rl, dz: cutFill ? dz : 0 })
  }

  return (
    <>
      <group scale={[1, exag, 1]}>
        <mesh
          geometry={surface}
          receiveShadow
          castShadow
          onPointerMove={hoverSurface}
          onPointerLeave={() => onHover(null)}
          onClick={onPin ? pinSurface : undefined}
        >
          <meshStandardMaterial vertexColors roughness={0.95} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
        </mesh>
        {view.showSolid && (
          <mesh geometry={sides} receiveShadow>
            <meshStandardMaterial color="#b49a7c" roughness={1} />
          </mesh>
        )}
        {view.showContours && (
          <>
            <lineSegments geometry={contourLines.minor}>
              <lineBasicMaterial color="#5a4a40" transparent opacity={0.35} />
            </lineSegments>
            <lineSegments geometry={contourLines.major}>
              <lineBasicMaterial color="#2b211c" transparent opacity={0.85} />
            </lineSegments>
          </>
        )}
        <BoundaryLine survey={survey} ground={ground} refZ={refZ} />
        <SiteFeatures3D boundary={survey.boundary} ground={ground} refZ={refZ} />
        {plan && view.showHouse && (
          <House3D plan={plan} origin={survey.origin} refZ={refZ} showLevels={null} showRoof={view.showRoof} showFurniture={view.showFurniture} ground={ground} />
        )}
      </group>
      {view.showLevels && (
        <Markers points={survey.levels} color="#1d2733" kind="Spot level" {...{ survey, terrain, refZ, exag, onHover }} />
      )}
      {view.showReference && (
        <Markers points={survey.reference} color="#d2463c" kind="Reference point" {...{ survey, terrain, refZ, exag, onHover }} />
      )}
    </>
  )
}

function BoundaryLine({ survey, ground, refZ }: { survey: Survey; ground: Heightfield; refZ: number }) {
  const line = useMemo(() => {
    const pts: THREE.Vector3[] = []
    const ring = [...survey.boundary, survey.boundary[0]]
    for (let k = 0; k + 1 < ring.length; k++) {
      const [x1, y1] = ring[k]
      const [x2, y2] = ring[k + 1]
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / ground.cell))
      for (let s = 0; s < steps; s++) {
        const x = x1 + ((x2 - x1) * s) / steps
        const y = y1 + ((y2 - y1) * s) / steps
        pts.push(new THREE.Vector3(x, ground.sample(x, y) - refZ + 0.03, -y))
      }
    }
    pts.push(pts[0].clone())
    const geom = new THREE.BufferGeometry().setFromPoints(pts)
    return new THREE.Line(geom, new THREE.LineBasicMaterial({ color: '#1a1a1a' }))
  }, [survey, ground, refZ])
  return <primitive object={line} />
}

interface MarkerProps {
  points: SurveyPoint[]
  color: string
  kind: string
  survey: Survey
  terrain: Terrain
  refZ: number
  exag: number
  onHover: (h: HoverInfo | null) => void
}

function Markers({ points, color, kind, survey, terrain, refZ, exag, onHover }: MarkerProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const sphere = useMemo(() => new THREE.SphereGeometry(0.14, 12, 8), [])
  const inside = useMemo(
    () => points.filter(p => pointInPolygon(p.x, p.y, survey.boundary)),
    [points, survey.boundary],
  )
  const stems = useMemo(() => {
    // Short vertical ticks from the surface to the surveyed level show any mismatch.
    const v: number[] = []
    for (const p of inside) {
      const s = terrain.grid.sample(p.x, p.y)
      v.push(p.x, (s - refZ) * exag, -p.y, p.x, (p.z - refZ) * exag, -p.y)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    return g
  }, [inside, terrain, refZ, exag])

  return (
    <group>
      <lineSegments geometry={stems}>
        <lineBasicMaterial color={color} />
      </lineSegments>
      {inside.map((p, i) => (
        <mesh
          key={i}
          geometry={sphere}
          position={[p.x, (p.z - refZ) * exag + 0.14, -p.y]}
          scale={hovered === i ? 1.6 : 1}
          onPointerOver={e => {
            e.stopPropagation()
            setHovered(i)
            const s = terrain.grid.sample(p.x, p.y)
            const diff = p.z - s
            onHover({
              e: p.x + survey.origin[0],
              n: p.y + survey.origin[1],
              rl: p.z,
              label: `${kind} (${p.layer}), ${Math.abs(diff * 1000).toFixed(0)} mm ${diff >= 0 ? 'above' : 'below'} the modelled surface`,
            })
          }}
          onPointerOut={() => {
            setHovered(null)
            onHover(null)
          }}
        >
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}
