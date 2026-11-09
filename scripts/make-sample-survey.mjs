// Writes samples/sample-block.dxf: a made-up contour survey of a sloping block, laid out the way
// a surveyor's DXF usually is (contours as 3D polylines, spot levels as points, a closed lot
// boundary, labels). It isn't a real place. The numbers audit (src/audit) runs against it.
//
//   node scripts/make-sample-survey.mjs
//
// It also writes sample-block.xml (LandXML: a TIN, the spot levels as points, the lot as a parcel) and
// sample-block.csv (the spot levels, with a header, and the lot corners coded BDY), from the same
// made-up points, so every format can be checked against the DXF.
//
// The output is deterministic, so running it again gives the same file.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const samples = join(dirname(fileURLToPath(import.meta.url)), '..', 'samples')
const out = join(samples, 'sample-block.dxf')

// Local survey coordinates, metres; the block's south-west corner is near (5000, 8000).
const E0 = 5000
const N0 = 8000

/** Ground level: falls about 16% to the east and 5% to the north, with a gentle gully. */
export const ground = (x, y) => 47.5 - 0.16 * x - 0.05 * y + 0.4 * Math.sin(y / 9)

/** A small, repeatable wobble (±amp) so measured points don't sit exactly on the surface. */
function wobble(i, amp) {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return (s - Math.floor(s) - 0.5) * 2 * amp
}

const BOUNDARY = [
  [0, 0],
  [23.4, 0.6],
  [24.1, 34.2],
  [-0.8, 33.5],
]

const r3 = v => Math.round(v * 1000) / 1000
const pairs = (...items) => items.map(String).join('\n')
const lwpolyline = (layer, pts, closed) =>
  pairs(0, 'LWPOLYLINE', 8, layer, 90, pts.length, 70, closed ? 1 : 0, 38, 0, ...pts.flatMap(([x, y]) => [10, r3(E0 + x), 20, r3(N0 + y)]))
const polyline3d = (layer, pts) =>
  [
    pairs(0, 'POLYLINE', 8, layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, 8),
    ...pts.map(([x, y, z]) => pairs(0, 'VERTEX', 8, layer, 10, r3(E0 + x), 20, r3(N0 + y), 30, r3(z), 70, 32)),
    pairs(0, 'SEQEND', 8, layer),
  ].join('\n')
const point = (layer, [x, y, z]) => pairs(0, 'POINT', 8, layer, 10, r3(E0 + x), 20, r3(N0 + y), 30, r3(z))
const text = (layer, [x, y], value) => pairs(0, 'TEXT', 8, layer, 10, r3(E0 + x), 20, r3(N0 + y), 30, 0, 40, 0.25, 1, value)

function inside([x, y]) {
  let c = false
  for (let i = 0, j = BOUNDARY.length - 1; i < BOUNDARY.length; j = i++) {
    const [xi, yi] = BOUNDARY[i]
    const [xj, yj] = BOUNDARY[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

const ents = []

// Contours every 0.25 m, every metre on its own layer, 5 m past the boundary each way.
// The ground is linear in x, so each contour is x = (47.5 − 0.05y + 0.4 sin(y/9) − z) / 0.16.
for (let q = 4 * 36; q <= 4 * 51; q++) {
  const z = q / 4
  let run = []
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
const spots = []
let n = 0
for (let row = 0; n < 60 && row < 20; row++) {
  for (let col = 0; col < 8 && n < 60; col++) {
    const p = [1.5 + col * 3 + (row % 2) * 1.5, 1.5 + row * 3.1]
    if (!inside(p)) continue
    spots.push([p[0], p[1], ground(p[0], p[1]) + wobble(n, 0.008)])
    ents.push(point('PRO_SPOTS', spots[spots.length - 1]))
    ents.push(text('LABELS', [p[0] + 0.3, p[1] + 0.3], (ground(p[0], p[1]) + wobble(n, 0.008)).toFixed(2)))
    n++
  }
}

// The owner's own check points, taken with a level and staff: rougher, ±40 mm.
const checks = [
  [4, 3],
  [12, 5],
  [20, 8],
  [6, 15],
  [15, 18],
  [21, 24],
  [5, 28],
  [14, 31],
]
checks.forEach((p, i) => ents.push(point('SKETCH_POINTS', [p[0], p[1], ground(p[0], p[1]) + wobble(100 + i, 0.04)])))

ents.push(lwpolyline('LOT_BOUNDARY', BOUNDARY, true))
ents.push(text('LABELS', [8, 16], 'SAMPLE BLOCK (MADE UP)'))

const dxf = [
  pairs(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC'),
  pairs(0, 'SECTION', 2, 'ENTITIES'),
  ...ents,
  pairs(0, 'ENDSEC', 0, 'EOF'),
].join('\n')

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, dxf + '\n')
console.log(`Wrote ${out}: ${ents.length} entities, ${n} spot levels.`)

// LandXML 1.2: coordinates are written northing, easting, elevation. The TIN is a grid of
// ground points a little past the lot, split into triangles.
const TIN_X = Array.from({ length: 8 }, (_, i) => -2 + i * 4)
const TIN_Y = Array.from({ length: 10 }, (_, j) => -2 + j * 4)
const tinPts = TIN_Y.flatMap(y => TIN_X.map(x => [x, y, ground(x, y)]))
const tinFaces = []
for (let j = 0; j < TIN_Y.length - 1; j++) {
  for (let i = 0; i < TIN_X.length - 1; i++) {
    const a = j * TIN_X.length + i + 1
    const b = a + 1
    const c = a + TIN_X.length
    const d = c + 1
    tinFaces.push([a, b, d], [a, d, c])
  }
}
const ne = ([x, y]) => `${r3(N0 + y)} ${r3(E0 + x)}`
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2" date="2026-01-01" time="09:00:00">',
  '  <Units><Metric areaUnit="squareMeter" linearUnit="meter" volumeUnit="cubicMeter" temperatureUnit="celsius" pressureUnit="milliBars" diameterUnit="millimeter" angularUnit="decimal degrees" directionUnit="decimal degrees" /></Units>',
  '  <Project name="Sample block (made up)" />',
  '  <Application name="make-sample-survey" />',
  '  <CgPoints>',
  ...spots.map(([x, y, z], i) => `    <CgPoint name="${i + 1}" code="SPOT">${ne([x, y])} ${r3(z)}</CgPoint>`),
  '  </CgPoints>',
  '  <Surfaces>',
  '    <Surface name="Existing ground">',
  '      <Definition surfType="TIN">',
  '        <Pnts>',
  ...tinPts.map(([x, y, z], i) => `          <P id="${i + 1}">${ne([x, y])} ${r3(z)}</P>`),
  '        </Pnts>',
  '        <Faces>',
  ...tinFaces.map(f => `          <F>${f.join(' ')}</F>`),
  '        </Faces>',
  '      </Definition>',
  '    </Surface>',
  '  </Surfaces>',
  '  <Parcels>',
  '    <Parcel name="Sample lot" area="0">',
  '      <CoordGeom>',
  ...BOUNDARY.map((p, i) => `        <Line><Start>${ne(p)}</Start><End>${ne(BOUNDARY[(i + 1) % BOUNDARY.length])}</End></Line>`),
  '      </CoordGeom>',
  '    </Parcel>',
  '  </Parcels>',
  '</LandXML>',
].join('\n')
writeFileSync(join(samples, 'sample-block.xml'), xml + '\n')

// CSV: a header, then point number, easting, northing, RL and a code; the lot corners are coded BDY.
const csv = [
  'Point,Easting,Northing,RL,Code',
  ...spots.map(([x, y, z], i) => `${i + 1},${r3(E0 + x)},${r3(N0 + y)},${r3(z)},SPOT`),
  ...BOUNDARY.map(([x, y], i) => `${100 + i},${r3(E0 + x)},${r3(N0 + y)},${r3(ground(x, y))},BDY`),
].join('\n')
writeFileSync(join(samples, 'sample-block.csv'), csv + '\n')
console.log(`Wrote sample-block.xml (${tinPts.length} TIN points) and sample-block.csv.`)
