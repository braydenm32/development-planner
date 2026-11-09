// Sits inside the 3D canvas and tells src/export/snapshot.ts how to read it: draw one frame, then read
// the canvas straight away (the canvas doesn't keep its picture between frames).

import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { setGrab3d } from './snapshot'

export function SnapshotGrab() {
  const gl = useThree(s => s.gl)
  const scene = useThree(s => s.scene)
  const camera = useThree(s => s.camera)
  useEffect(() => {
    setGrab3d(() => {
      gl.render(scene, camera)
      return gl.domElement.toDataURL('image/png')
    })
    return () => setGrab3d(null)
  }, [gl, scene, camera])
  return null
}
