// The made-up sample survey (samples/sample-block.dxf), written here with the same maths as
// scripts/make-sample-survey.mjs, so the example project carries a few lines of code instead
// of a 140 KB file. A test checks the two give the same text, character for character.
// It isn't a real place.

/** The block's south-west corner, in the survey's made-up coordinates. */
export const SAMPLE_E0 = 5000
export const SAMPLE_N0 = 8000

/** Ground level: falls about 16% to the east and 5% to the north, with a gentle gully. */
export const sampleGround = (x: number, y: number) => 47.5 - 0.16 * x - 0.05 * y + 0.4 * Math.sin(y / 9)

/** The lot boundary, in metres from the south-west corner. */
export const SAMPLE_BOUNDARY: [number, number][] = [
  [0, 0],
  [23.4, 0.6],
  [24.1, 34.2],
  [-0.8, 33.5],
]

/** What the survey file is called in the example project. */
export const SAMPLE_FILE_NAME = 'sample-block.dxf'

/** A small, repeatable wobble (±amp) so measured points don't sit exactly on the surface. */
function wobble(i: number, amp: number) {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return (s - Math.floor(s) - 0.5) * 2 * amp
}

const r3 = (v: number) => Math.round(v * 1000) / 1000
const pairs = (...items: (string | number)[]) => items.map(String).join('\n')
const lwpolyline = (layer: string, pts: [number, number][], closed: boolean) =>
  pairs(0, 'LWPOLYLINE', 8, layer, 90, pts.length, 70, closed ? 1 : 0, 38, 0, ...pts.flatMap(([x, y]) => [10, r3(SAMPLE_E0 + x), 20, r3(SAMPLE_N0 + y)]))
const polyline3d = (layer: string, pts: [number, number, number][]) =>
  [
    pairs(0, 'POLYLINE', 8, layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, 8),
    ...pts.map(([x, y, z]) => pairs(0, 'VERTEX', 8, layer, 10, r3(SAMPLE_E0 + x), 20, r3(SAMPLE_N0 + y), 30, r3(z), 70, 32)),
    pairs(0, 'SEQEND', 8, layer),
  ].join('\n')
const point = (layer: string, [x, y, z]: [number, number, number]) => pairs(0, 'POINT', 8, layer, 10, r3(SAMPLE_E0 + x), 20, r3(SAMPLE_N0 + y), 30, r3(z))
const text = (layer: string, [x, y]: [number, number], value: string) => pairs(0, 'TEXT', 8, layer, 10, r3(SAMPLE_E0 + x), 20, r3(SAMPLE_N0 + y), 30, 0, 40, 0.25, 1, value)

function inside([x, y]: [number, number]) {
  let c = false
  for (let i = 0, j = SAMPLE_BOUNDARY.length - 1; i < SAMPLE_BOUNDARY.length; j = i++) {
    const [xi, yi] = SAMPLE_BOUNDARY[i]
    const [xj, yj] = SAMPLE_BOUNDARY[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** The sample survey as DXF text, the same as samples/sample-block.dxf (without its last newline). */
export function sampleSurveyDxf(): string {
  const ents: string[] = []

  // Contours every 0.25 m, every metre on its own layer, 5 m past the boundary each way.
  for (let q = 4 * 36; q <= 4 * 51; q++) {
    const z = q / 4
    let run: [number, number, number][] = []
    const flush = () => {
      if (run.length >= 2) ents.push(polyline3d(q % 4 === 0 ? 'CONTOUR_MAJOR_1m' : 'CONTOUR_MINOR_0.25m', run))
      run = []
    }
    for (let y = -5; y <= 39.0001; y += 0.5) {
      const x = (47.5 - 0.05 * y + 0.4 * Math.sin(y / 9) - z) / 0.16
      if (x >= -6 && x <= 29) run.push([x, y, z])
      else flush()
    }
    flush()
  }

  // 60 surveyed spot levels inside the block on a staggered grid, within ±8 mm of the ground.
  let n = 0
  for (let row = 0; n < 60 && row < 20; row++) {
    for (let col = 0; col < 8 && n < 60; col++) {
      const p: [number, number] = [1.5 + col * 3 + (row % 2) * 1.5, 1.5 + row * 3.1]
      if (!inside(p)) continue
      ents.push(point('PRO_SPOTS', [p[0], p[1], sampleGround(p[0], p[1]) + wobble(n, 0.008)]))
      ents.push(text('LABELS', [p[0] + 0.3, p[1] + 0.3], (sampleGround(p[0], p[1]) + wobble(n, 0.008)).toFixed(2)))
      n++
    }
  }

  // The owner's own check points, taken with a level and staff: rougher, ±40 mm.
  const checks: [number, number][] = [
    [4, 3],
    [12, 5],
    [20, 8],
    [6, 15],
    [15, 18],
    [21, 24],
    [5, 28],
    [14, 31],
  ]
  checks.forEach((p, i) => ents.push(point('SKETCH_POINTS', [p[0], p[1], sampleGround(p[0], p[1]) + wobble(100 + i, 0.04)])))

  ents.push(lwpolyline('LOT_BOUNDARY', SAMPLE_BOUNDARY, true))
  ents.push(text('LABELS', [8, 16], 'SAMPLE BLOCK (MADE UP)'))

  return [pairs(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC'), pairs(0, 'SECTION', 2, 'ENTITIES'), ...ents, pairs(0, 'ENDSEC', 0, 'EOF')].join('\n')
}
