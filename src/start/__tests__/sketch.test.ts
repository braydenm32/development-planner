import { describe, expect, it } from 'vitest'
import { readSite } from '../../safety/files'
import { analyzeLayers } from '../../lib/survey'
import { parseDxf } from '../../lib/dxf'
import { isLevel, slopeText } from '../../components/siteWords'
import { streetSideLabel } from '../../phone/streetSideWords'
import { guessCount, madeBlock } from '../../site/layersSeen'
import { aboveStreet, describeSketch, ROUGH_SIZE, readSketchSize, sketchGround, sketchName, sketchProblems, sketchSurvey, SKETCH_DATUM, type SketchBlock } from '../sketch'

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

  it('says what is wrong with every box at once, not just the first (AX-17)', () => {
    expect(sketchProblems('abc', '-5', '999')).toEqual({
      width: 'The block’s width needs to be between 5 and 500 m.',
      depth: 'The block’s depth needs to be between 5 and 500 m.',
      fall: 'The fall needs to be within 30 m.',
    })
    // Only the empty one of the pair is marked, and a good set has nothing to say.
    expect(sketchProblems('15', '', '')).toEqual({ depth: 'Type both the width and the depth, or leave both empty to set them later.' })
    expect(sketchProblems('15', '30', '1,5')).toEqual({})
    expect(sketchProblems('', '', '')).toEqual({})
    // A sheet with no size still can't take an absurd fall.
    expect(sketchProblems('', '', '999')).toEqual({ fall: 'The fall needs to be within 30 m.' })
  })
})

describe('a sketch block has no survey leftovers (HO-17, CB-31, LD-16, DB-33, HO-39, HO-21)', () => {
  it('reports the fall as it was typed, right to the block’s corners', () => {
    // The cells inside the boundary stop short of its corners: 2 m read 1.98 m, 3 m read 2.97 m.
    for (const fall of [2, 3, -3, 6]) {
      const { terrain } = readSite(sketchSurvey(block({ fall, street: 'W' })))
      // As Site › Block prints them, to 10 mm.
      expect((terrain.stats.maxRL - terrain.stats.minRL).toFixed(2)).toBe(Math.abs(fall).toFixed(2))
      expect(terrain.stats.minRL.toFixed(2)).toBe(Math.min(SKETCH_DATUM, SKETCH_DATUM + fall).toFixed(2))
    }
  })

  it('has no layer guesses to check, though its own layers have uses', () => {
    const s = sketchSurvey(block({ fall: 2 }))
    const layers = analyzeLayers(parseDxf(s.dxfText))
    expect(layers.length).toBe(3)
    expect(madeBlock(s)).toBe(true)
    expect(guessCount(layers, s)).toBe(0)
    // A real survey with the same layers still asks.
    expect(guessCount(layers, { roles: s.roles })).toBe(3)
    expect(madeBlock({})).toBe(false)
  })

  it('says the size it was drawn at when none was given', () => {
    expect(describeSketch(readSketchSize('', '', '', 'S'))).toBe('20 × 40 m (default size, not set yet), flat, street to the south')
    expect(describeSketch(block({ fall: -3, street: 'W' }))).toBe('15 × 30 m, 3 m down to the back, street to the west')
  })

  it('reads a level block as Level, with no ratio and no low side', () => {
    const { terrain } = readSite(sketchSurvey(block()))
    expect(slopeText(terrain.stats.meanSlopePct)).toBe('Level')
    expect(slopeText(0.4)).toBe('Level')
    expect(slopeText(4)).toBe('1 in 25.0 (4%)')
    expect(isLevel(terrain.stats)).toBe(true)
    expect(streetSideLabel('auto', 'south', true)).toBe('Auto (taken as south)')
    expect(streetSideLabel('auto', 'south')).toBe('Auto (low side: south)')
    expect(streetSideLabel('S', 'south', true)).toBe('South side')
  })

  it('gives heights above the street, not off the made-up RL 100', () => {
    expect(aboveStreet(102)).toBe('2.00 m above the street')
    expect(aboveStreet(99.25)).toBe('0.75 m below the street')
    expect(aboveStreet(100.004)).toBe('level with the street')
  })
})
