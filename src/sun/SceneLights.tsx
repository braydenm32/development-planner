// The 3D view's lights. Usually a fixed light from the north-west, as the view has always had.
// With the sun study on, the light comes from where the sun really is for the block, the day
// and the time, so the shadows of the house, the roof and the ground are true for that moment.
// Its shadow camera then hugs the block, at a smaller size on a phone.

import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { usePlan } from '../plan/store'
import { gridBearing, locationOf } from './location'
import { sceneSunDirection } from './scene'
import { sunAt } from './solar'
import { studyDate, useSun } from './store'

interface Props {
  /** Middle of the block in the scene (x east, z south), the height to aim at, and the block's width. */
  cx: number
  cy: number
  midY: number
  span: number
  /** Heights are stretched by this in the scene, so the sun's slope is too, keeping shadows where they fall. */
  exaggeration: number
  phone: boolean
}

export function SceneLights(props: Props) {
  const on = useSun(s => s.on)
  const { cx, cy, span } = props
  if (on) return <SunLights {...props} />
  return (
    <>
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
    </>
  )
}

const LOW = new THREE.Color('#ffc58a')
const HIGH = new THREE.Color('#fff8ee')

function SunLights({ cx, cy, midY, span, exaggeration, phone }: Props) {
  const light = useRef<THREE.DirectionalLight>(null)
  const minutes = useSun(s => s.minutes)
  const month = useSun(s => s.month)
  const day = useSun(s => s.day)
  const location = locationOf(usePlan(s => s.plan))
  const sun = sunAt(location.lat, location.lon, studyDate({ month, day }), minutes)
  const up = sun.elevation > 0
  const dir = sceneSunDirection(gridBearing(sun.azimuth, location), Math.max(sun.elevation, 0.5), exaggeration)
  const reach = span * 2
  const target: [number, number, number] = [cx, midY, -cy]
  const position: [number, number, number] = [cx + dir.x * reach, midY + dir.y * reach, -cy + dir.z * reach]
  // Fade in over the first few degrees, and warm the light while the sun is low.
  const strength = up ? Math.min(1, sun.elevation / 6) : 0
  const colour = LOW.clone().lerp(HIGH, Math.min(1, Math.max(0, sun.elevation / 25)))
  const box = span * 0.8
  const size = phone ? 1024 : 2048

  useLayoutEffect(() => {
    const l = light.current
    if (!l) return
    l.target.position.set(target[0], target[1], target[2])
    l.target.updateMatrixWorld()
    l.shadow.camera.updateProjectionMatrix()
  })

  return (
    <>
      {/* Less sky than the fixed light, so the shade reads as shade. */}
      <hemisphereLight args={[up ? '#ffffff' : '#c9d4e6', '#8d8270', up ? 0.55 + 0.45 * (1 - strength) : 0.7]} />
      <directionalLight
        // A new map size needs a new shadow map.
        key={size}
        ref={light}
        position={position}
        color={colour}
        intensity={3.4 * strength}
        castShadow={up}
        shadow-mapSize={[size, size]}
        shadow-camera-left={-box}
        shadow-camera-right={box}
        shadow-camera-top={box}
        shadow-camera-bottom={-box}
        shadow-camera-near={0.5}
        shadow-camera-far={reach * 2.5}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
    </>
  )
}
