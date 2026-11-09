// Builds small DXF files for tests.

type P = [number, number, number]

function pairs(...items: (string | number)[]): string {
  return items.map(String).join('\n')
}

export function dxf(entities: string[], insunits = 6): string {
  return [
    pairs(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, insunits, 0, 'ENDSEC'),
    pairs(0, 'SECTION', 2, 'ENTITIES'),
    ...entities,
    pairs(0, 'ENDSEC', 0, 'EOF'),
  ].join('\n')
}

export function lwpolyline(layer: string, pts: [number, number][], elevation = 0, closed = false): string {
  return pairs(0, 'LWPOLYLINE', 8, layer, 90, pts.length, 70, closed ? 1 : 0, 38, elevation, ...pts.flatMap(([x, y]) => [10, x, 20, y]))
}

export function polyline3d(layer: string, pts: P[]): string {
  return [
    pairs(0, 'POLYLINE', 8, layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, 8),
    ...pts.map(([x, y, z]) => pairs(0, 'VERTEX', 8, layer, 10, x, 20, y, 30, z, 70, 32)),
    pairs(0, 'SEQEND', 8, layer),
  ].join('\n')
}

export function point(layer: string, [x, y, z]: P): string {
  return pairs(0, 'POINT', 8, layer, 10, x, 20, y, 30, z)
}

export function text(layer: string, [x, y, z]: P, value: string): string {
  return pairs(0, 'TEXT', 8, layer, 10, x, 20, y, 30, z, 40, 0.25, 1, value)
}

/** A tilted-plane site, z = 80 + 0.1x + 0.2y, with a skewed four-sided boundary. */
export const plane = (x: number, y: number) => 80 + 0.1 * x + 0.2 * y

export function planeSurvey(): string {
  const ents: string[] = []
  // Contours every 0.5 m: 0.1x + 0.2y = c, sampled across x in [-5, 35].
  for (let c = 78; c <= 92; c += 0.5) {
    const pts: P[] = []
    for (let x = -5; x <= 35; x += 2.5) {
      const y = (c - 80 - 0.1 * x) / 0.2
      if (y >= -5 && y <= 45) pts.push([1000 + x, 1000 + y, c])
    }
    if (pts.length >= 2) ents.push(polyline3d(c % 1 === 0 ? 'CONTOUR_MAJOR' : 'CONTOUR_MINOR', pts))
  }
  ents.push(point('SPOTS', [1010, 1010, plane(10, 10)]))
  ents.push(point('SKETCH_POINTS', [1012, 1012, 50])) // display only, must not shape terrain
  ents.push(text('LABELS', [1010, 1010, 0], '82.00'))
  ents.push(
    lwpolyline('LOT_BOUNDARY', [
      [1000, 1000],
      [1006, 1031],
      [1025, 1028],
      [1019, 997],
      [1000, 1000],
    ]),
  )
  return dxf(ents)
}
