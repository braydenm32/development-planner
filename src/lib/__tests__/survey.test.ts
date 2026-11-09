import { describe, expect, it } from 'vitest'
import { parseDxf } from '../dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../survey'
import { buildTerrain } from '../terrain'
import { buildSiteSolid, isWatertight } from '../terrainMesh'
import { dxf, lwpolyline, plane, planeSurvey, point } from './fixtures'

describe('parseDxf', () => {
  it('reads 3D polylines, LWPOLYLINE elevation, points and text', () => {
    const doc = parseDxf(planeSurvey())
    const kinds = doc.entities.reduce<Record<string, number>>((acc, e) => {
      acc[e.kind] = (acc[e.kind] ?? 0) + 1
      return acc
    }, {})
    expect(kinds.point).toBe(2)
    expect(kinds.text).toBe(1)
    const contour = doc.entities.find(e => e.kind === 'polyline' && e.layer === 'CONTOUR_MAJOR')
    expect(contour?.kind === 'polyline' && contour.points.every(p => p[2] === contour.points[0][2])).toBe(true)

    const lw = parseDxf(dxf([lwpolyline('C', [[0, 0], [1, 1]], 82.5)])).entities[0]
    expect(lw.kind === 'polyline' && lw.points[1]).toEqual([1, 1, 82.5])
  })

  it('converts millimetre drawings to metres', () => {
    const doc = parseDxf(dxf([point('P', [1000, 2000, 80000])], 4))
    expect(doc.unitScale).toBe(0.001)
    expect(doc.entities[0].kind === 'point' && doc.entities[0].p).toEqual([1, 2, 80])
  })

  it('rejects files that are not DXF', () => {
    expect(() => parseDxf('hello\nworld\n')).toThrow(/not a valid/i)
  })
})

describe('layer roles', () => {
  it('guesses contours, boundary, spot levels, reference points and labels', () => {
    const roles = guessRoles(analyzeLayers(parseDxf(planeSurvey())))
    expect(roles).toEqual({
      CONTOUR_MAJOR: 'contour',
      CONTOUR_MINOR: 'contour',
      LABELS: 'ignore',
      LOT_BOUNDARY: 'boundary',
      SKETCH_POINTS: 'reference',
      SPOTS: 'levels',
    })
  })
})

describe('terrain', () => {
  const doc = parseDxf(planeSurvey())
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))

  it('moves data to a local origin and closes the boundary ring', () => {
    expect(survey.origin).toEqual([1000, 997])
    expect(survey.boundary).toHaveLength(4)
    expect(survey.boundaryIsGuess).toBe(false)
    expect(survey.reference).toHaveLength(1)
  })

  it('reproduces a planar site exactly when unsmoothed', () => {
    const { grid, stats } = buildTerrain(survey, { cellSize: 0.5, smoothPasses: 0 })
    for (const [x, y] of [[5, 10], [12.3, 20.7], [20, 5]]) {
      // local -> world offset is (1000, 997)
      expect(grid.sample(x, y)).toBeCloseTo(plane(x, y - 3), 3)
    }
    expect(stats.area).toBeGreaterThan(600)
    // Downhill on z = 0.1x + 0.2y points south-south-west.
    expect(stats.fallBearing).toBeGreaterThan(180)
    expect(stats.fallBearing).toBeLessThan(225)
    expect(stats.meanSlopePct).toBeCloseTo(Math.hypot(0.1, 0.2) * 100, 1)
  })

  it('builds a closed, consistently wound site solid', () => {
    const { grid, stats } = buildTerrain(survey, { cellSize: 0.5 })
    const solid = buildSiteSolid(grid, survey.boundary, stats.minRL - 1)
    expect(solid.surfaceIndexCount).toBeGreaterThan(0)
    expect(isWatertight(solid.indices)).toBe(true)
    for (const v of solid.positions) expect(Number.isFinite(v)).toBe(true)
  })
})
