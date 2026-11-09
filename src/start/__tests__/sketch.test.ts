import { describe, expect, it } from 'vitest'
import { readSite } from '../../safety/files'
import { ROUGH_SIZE, readSketchSize, sketchGround, sketchName, sketchSurvey, SKETCH_DATUM, type SketchBlock } from '../sketch'

const block = (b: Partial<SketchBlock> = {}): SketchBlock => ({ width: 15, depth: 30, fall: 0, street: 'S', ...b })

describe('a sketch block', () => {
  it('reads as a flat block of the size asked for', () => {
    const s = sketchSurvey(block())
    expect(s.fileName).toBe('Sketch block 15 × 30 m')
    expect(s.sketch).toEqual(block())
    const { survey, terrain } = readSite(s)
    // 15 × 30 = 450 m², perimeter 2 × (15 + 30) = 90 m
    expect(terrain.stats.area).toBeCloseTo(450, 6)
    expect(terrain.stats.perimeter).toBeCloseTo(90, 6)
    expect(terrain.stats.minRL).toBeCloseTo(SKETCH_DATUM, 6)
    expect(terrain.stats.maxRL).toBeCloseTo(SKETCH_DATUM, 6)
    expect(terrain.stats.maxSlopePct).toBeCloseTo(0, 6)
    expect(survey.boundaryIsGuess).toBe(false)
    expect(survey.contours).toEqual([])
  })

  it('runs the width along the street, whichever side it is on', () => {
    for (const street of ['N', 'S'] as const) {
      const { survey } = readSite(sketchSurvey(block({ street })))
      const xs = survey.boundary.map(p => p[0])
      const ys = survey.boundary.map(p => p[1])
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(15, 6)
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(30, 6)
    }
    for (const street of ['E', 'W'] as const) {
      const { survey } = readSite(sketchSurvey(block({ street })))
      const xs = survey.boundary.map(p => p[0])
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(30, 6)
    }
  })

  it('rises by the fall from the street to the back, as a plane', () => {
    // Street to the north, 2 m fall over 30 m: the ground drops 2 m going north, 1 in 15 (6.67%).
    const b = block({ fall: 2, street: 'N' })
    const { terrain, survey } = readSite(sketchSurvey(b))
    // The Site panel's range reads grid points inside the boundary, so it stops a grid cell short of each edge.
    expect(terrain.stats.maxRL - terrain.stats.minRL).toBeCloseTo(2, 1)
    expect(terrain.stats.minRL).toBeCloseTo(SKETCH_DATUM, 1)
    expect(terrain.stats.meanSlopePct).toBeCloseTo((2 / 30) * 100, 1)
    expect(terrain.stats.fallBearing).toBeCloseTo(0, 0) // falls towards the street, north
    // halfway back, halfway up
    const x = 7.5
    const y = 15
    expect(terrain.grid.sample(x, y)).toBeCloseTo(SKETCH_DATUM + 1, 2)
    expect(sketchGround(b, x, y)).toBeCloseTo(SKETCH_DATUM + 1, 9)
    expect(survey.contours.length).toBeGreaterThan(0)
    for (const c of survey.contours) expect(c.z).toBeGreaterThan(SKETCH_DATUM)
  })

  it('reads the start screen’s fields, or no size at all', () => {
    expect(readSketchSize('', '', '', 'S')).toEqual({ ...ROUGH_SIZE, fall: 0, street: 'S', rough: true })
    expect(sketchName(readSketchSize('', '', '', 'S'))).toBe('Sketch block (size not set)')
    expect(readSketchSize('16.5', '40', '1,5', 'E')).toEqual({ width: 16.5, depth: 40, fall: 1.5, street: 'E' })
    expect(sketchName(readSketchSize('16.5', '40', '', 'E'))).toBe('Sketch block 16.5 × 40 m')
    expect(() => readSketchSize('15', '', '', 'S')).toThrow(/both the width and the depth/)
    expect(() => readSketchSize('2', '30', '', 'S')).toThrow(/between 5 and 500/)
    expect(() => readSketchSize('15', 'abc', '', 'S')).toThrow(/depth/)
    expect(() => readSketchSize('15', '30', '45', 'S')).toThrow(/fall/)
  })
})
