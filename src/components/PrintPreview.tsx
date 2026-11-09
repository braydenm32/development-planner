import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useContext, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { PrintModel, PrintPart } from '../print/build'
import { usePrintHover } from '../print/hover'
import { fitDistance, freeFrame, partOffsets, sceneBox } from '../print/previewFit'
import { CanvasFrame, type Insets } from './canvasFrame'

const COLORS: Record<PrintPart['kind'], string> = { terrain: '#9dba86', floor: '#eee8dc', roof: '#6d7581' }

interface Props {
  model: PrintModel
  /** Lift each part off the one below so the keys show. */
  apart: boolean
}

/** The print parts in millimetres, assembled or pulled apart. Scene: x east, y up, z south. */
export function PrintPreview({ model, apart }: Props) {
  const bounds = useMemo(() => {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (const p of model.parts) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], p.min[i])
        max[i] = Math.max(max[i], p.max[i])
      }
    }
    return { min, max }
  }, [model])
  const cx = (bounds.min[0] + bounds.max[0]) / 2
  const cy = (bounds.min[1] + bounds.max[1]) / 2
  const span = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], 50)
  const midZ = (bounds.min[2] + bounds.max[2]) / 2

  return (
    // A new camera when the size changes a lot (a new scale), so the model stays in view.
    <Canvas key={Math.round(Math.log(span) * 4)} camera={{ position: [cx + span * 0.7, midZ + span * 0.9, -cy + span * 1.1], fov: 40, near: 1, far: span * 40 }} flat dpr={[1, 2]}>
      <color attach="background" args={['#eef1f4']} />
      <hemisphereLight args={['#ffffff', '#8d8270', 1.1]} />
      <directionalLight position={[cx - span * 0.6, midZ + span * 1.6, -cy + span * 1.2]} intensity={2.4} />
      <OrbitControls makeDefault target={[cx, midZ, -cy]} />
      <FitView model={model} apart={apart} />
      <Parts model={model} apart={apart} />
    </Canvas>
  )
}

const NO_INSETS: Insets = { l: 0, r: 0, t: 0, b: 0 }

/**
 * Frames every part, from the way the camera looks now: when the preview opens, and again each
 * time it switches between Assembled and Apart, whose lifted stack is taller. In the new layout
 * the panels float over the canvas, so the parts sit in the part of it they leave free.
 */
function FitView({ model, apart }: Props) {
  // The scene's state is read when the view fits, not on every render.
  const get = useThree(s => s.get)
  const hasControls = useThree(s => !!s.controls)
  const size = useThree(s => s.size)
  const { l, r, t, b } = useContext(CanvasFrame)?.insets ?? NO_INSETS
  const latest = useRef({ model, insets: { l, r, t, b } })
  useEffect(() => {
    latest.current = { model, insets: { l, r, t, b } }
  })

  // The middle of the view moves to the middle of the free part.
  useEffect(() => {
    const camera = get().camera as THREE.PerspectiveCamera
    const { dx, dy } = freeFrame(size.width, size.height, { l, r, t, b }, camera.fov)
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) camera.clearViewOffset()
    else camera.setViewOffset(size.width, size.height, dx, dy, size.width, size.height)
    camera.updateProjectionMatrix()
  }, [get, size.width, size.height, l, r, t, b])

  useEffect(() => {
    const state = get()
    const camera = state.camera as THREE.PerspectiveCamera
    const controls = state.controls as unknown as { target: THREE.Vector3; update: () => void } | null
    if (!controls) return
    const { model: m, insets } = latest.current
    // The free part sees only its share of the camera's field of view.
    const free = freeFrame(state.size.width, state.size.height, insets, camera.fov)
    const box = sceneBox(m, apart)
    const centre = new THREE.Vector3((box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2)
    const dir = camera.position.clone().sub(controls.target)
    if (dir.lengthSq() < 1e-9) dir.set(0.7, 0.9, 1.1)
    dir.normalize()
    const d = fitDistance(box, free.fov, free.aspect)
    camera.position.copy(centre).addScaledVector(dir, d)
    camera.far = Math.max(camera.far, d * 20)
    camera.updateProjectionMatrix()
    controls.target.copy(centre)
    controls.update()
  }, [apart, hasControls, get])
  return null
}

function Parts({ model, apart }: Props) {
  const meshes = useMemo(() => {
    const offsets = partOffsets(model, apart)
    return model.parts.map(p => {
      const g = new THREE.BufferGeometry()
      const pos = new Float32Array(p.positions.length)
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] = p.positions[i]
        pos[i + 1] = p.positions[i + 2]
        pos[i + 2] = -p.positions[i + 1]
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setIndex(new THREE.BufferAttribute(p.indices, 1))
      const flat = g.toNonIndexed()
      g.dispose()
      flat.computeVertexNormals()
      return { id: p.id, geometry: flat, color: COLORS[p.kind], offset: offsets.get(p.id) ?? ([0, 0, 0] as [number, number, number]) }
    })
  }, [model, apart])

  useEffect(() => () => meshes.forEach(m => m.geometry.dispose()), [meshes])
  // The part pointed at in the parts list glows, and the rest fade back a little.
  const hot = usePrintHover(s => s.ids)

  return (
    <group>
      {meshes.map(m => (
        <mesh key={m.id} geometry={m.geometry} position={m.offset}>
          <meshStandardMaterial
            color={m.color}
            roughness={0.85}
            emissive={hot.includes(m.id) ? '#2f6fde' : '#000000'}
            emissiveIntensity={hot.includes(m.id) ? 0.35 : 0}
            transparent={hot.length > 0 && !hot.includes(m.id)}
            opacity={hot.length > 0 && !hot.includes(m.id) ? 0.45 : 1}
          />
        </mesh>
      ))}
    </group>
  )
}
