// Hypsometric ramp: low ground blue-green through pale yellow and tan to light mauve.
const STOPS: [number, [number, number, number]][] = [
  [0.0, [0x6f, 0xa8, 0xdc]],
  [0.12, [0x6c, 0xd4, 0xb4]],
  [0.3, [0xa9, 0xe6, 0xae]],
  [0.48, [0xf3, 0xf2, 0xc0]],
  [0.66, [0xdc, 0xcf, 0xae]],
  [0.84, [0xbf, 0xa8, 0xa0]],
  [1.0, [0xee, 0xea, 0xe8]],
]

/** Colour (0–1 RGB) for a height between min and max. */
export function elevationColor(z: number, min: number, max: number): [number, number, number] {
  const t = max > min ? Math.min(Math.max((z - min) / (max - min), 0), 1) : 0.5
  for (let k = 1; k < STOPS.length; k++) {
    const [t1, c1] = STOPS[k]
    if (t <= t1) {
      const [t0, c0] = STOPS[k - 1]
      const f = (t - t0) / (t1 - t0)
      return [0, 1, 2].map(i => (c0[i] + (c1[i] - c0[i]) * f) / 255) as [number, number, number]
    }
  }
  const c = STOPS[STOPS.length - 1][1]
  return [c[0] / 255, c[1] / 255, c[2] / 255]
}

export const RAMP_CSS = `linear-gradient(to top, ${STOPS.map(([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`).join(', ')})`

/** Cut (orange) and fill (blue) as 0–1 sRGB, the same in 3D and on the plan. */
export const CUT_RGB: [number, number, number] = [0.85, 0.45, 0.28]
export const FILL_RGB: [number, number, number] = [0.3, 0.55, 0.85]

export const rgbCss = ([r, g, b]: [number, number, number]) => `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`

/** The surveyed points in 3D: spot levels in ink, reference points (benchmarks) in red. */
export const SPOT_LEVEL = '#1d2733'
export const REFERENCE_POINT = '#d2463c'
