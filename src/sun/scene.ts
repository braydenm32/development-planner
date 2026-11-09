// The sun's direction in the 3D scene, whose axes are x east, y up and z south (the plan's north
// is -z), with heights stretched by the view's exaggeration.

import * as THREE from 'three'

/**
 * The scene's unit vector towards the sun, from its bearing in the survey's grid and its height
 * above the horizon (degrees). The rise is stretched as the heights are, so a wall's shadow
 * still ends where it would on the real ground.
 */
export function sceneSunDirection(azimuthGrid: number, elevation: number, exaggeration: number): THREE.Vector3 {
  const b = (azimuthGrid * Math.PI) / 180
  const e = (elevation * Math.PI) / 180
  return new THREE.Vector3(Math.sin(b) * Math.cos(e), Math.sin(e) * exaggeration, -Math.cos(b) * Math.cos(e)).normalize()
}
