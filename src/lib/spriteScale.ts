// Sizing a camera-facing sprite in screen pixels, for labels in the 3D view (src/components/ContourLabels3D.tsx).

/**
 * A sprite's scale (with size attenuation off) that draws it `px` CSS pixels tall on a
 * perspective camera with this vertical field of view, in a canvas `viewH` pixels tall.
 * three.js multiplies such a sprite by its depth, so its height on screen is scale / tan(fov / 2)
 * of half the view.
 */
export function spriteScale(px: number, fovDeg: number, viewH: number): number {
  return (2 * px * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(1, viewH)
}
