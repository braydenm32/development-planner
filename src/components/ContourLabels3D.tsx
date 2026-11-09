// The contours' RL numbers in 3D. Each is a small picture of its text on a sprite that faces the
// camera at a steady size on screen, like the old DOM labels, but drawn in the scene: the house,
// trees and walls hide the numbers behind them, and there is no React root per label to mount
// and unmount (drei's <Html> made one each, which logged errors every time 3D opened).

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { contourText } from '../plan/finishedContours'
import { spriteScale } from '../lib/spriteScale'

export interface ContourLabel {
  z: number
  x: number
  y: number
  /** The ground's RL under the label. */
  rl: number
}

/** The label's look, as the old DOM labels had it: 12 px semibold, dark brown, in a soft white halo. */
const FONT_PX = 12
const FONT = `600 ${FONT_PX}px 'IBM Plex Sans', system-ui, sans-serif`
const INK = '#2b211c'
/** Room round the text for the halo, in CSS pixels. */
const PAD = 4

/** A picture of the label's text, drawn at the screen's pixel density, and its size in CSS pixels. */
function labelTexture(text: string, ratio: number): { tex: THREE.CanvasTexture; w: number; h: number } {
  const c = document.createElement('canvas')
  const g = c.getContext('2d')!
  g.font = FONT
  const w = Math.ceil(g.measureText(text).width) + 2 * PAD
  const h = FONT_PX + 2 * PAD
  c.width = w * ratio
  c.height = h * ratio
  g.scale(ratio, ratio)
  g.font = FONT
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // The halo, as the old labels' text-shadow had it: white text blurred under the ink, three times over.
  g.fillStyle = '#ffffff'
  g.shadowColor = '#ffffff'
  for (const blur of [3, 3, 2]) {
    g.shadowBlur = blur * ratio
    g.fillText(text, w / 2, h / 2 + 0.5)
  }
  g.shadowBlur = 0
  g.fillStyle = INK
  g.fillText(text, w / 2, h / 2 + 0.5)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  // One texel to a screen pixel: mipmaps would grey the thin strokes into the halo.
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  return { tex, w, h }
}

/** The labels, at scene positions (metres; y up and stretched by the exaggeration, as the ground is). */
export function ContourLabels3D({ labels, refZ, exag }: { labels: ContourLabel[]; refZ: number; exag: number }) {
  // The app's font may still be loading the first time 3D opens: draw again once it's in.
  const [fontKey, setFontKey] = useState(0)
  useEffect(() => {
    let live = true
    document.fonts?.load(FONT).then(
      () => live && setFontKey(k => k + 1),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])

  const dpr = useThree(s => s.viewport.dpr)
  const sprites = useMemo(() => {
    void fontKey
    const ratio = Math.max(1, Math.round(dpr))
    return labels.map(l => {
      const { tex, w, h } = labelTexture(contourText(l.z), ratio)
      // Depth-tested, so the house hides the numbers behind it; no depth written, so they never cut into each other.
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false })
      const s = new THREE.Sprite(mat)
      // Sitting on the contour rather than centred on it, so the ground in front doesn't cut its lower half.
      s.center.set(0.5, 0.15)
      s.position.set(l.x, (l.rl - refZ + 0.05) * exag, -l.y)
      s.renderOrder = 2
      s.raycast = () => {}
      s.userData.size = [w, h]
      return s
    })
  }, [labels, refZ, exag, fontKey, dpr])

  useEffect(
    () => () => {
      for (const s of sprites) {
        s.material.map?.dispose()
        s.material.dispose()
      }
    },
    [sprites],
  )

  // Keep them the same size on screen as the window and the camera's lens change.
  const size = useThree(s => s.size)
  const last = useRef<{ key: string; sprites: THREE.Sprite[] | null }>({ key: '', sprites: null })
  useFrame(({ camera }) => {
    const fov = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? (camera as THREE.PerspectiveCamera).fov : 40
    const key = `${fov}:${size.height}`
    if (key === last.current.key && sprites === last.current.sprites) return
    last.current = { key, sprites }
    const k = spriteScale(1, fov, size.height)
    for (const s of sprites) {
      const [w, h] = s.userData.size as [number, number]
      s.scale.set(w * k, h * k, 1)
    }
  })

  return (
    <group>
      {sprites.map((s, i) => (
        <primitive key={i} object={s} />
      ))}
    </group>
  )
}
