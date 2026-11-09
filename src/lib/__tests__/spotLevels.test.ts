import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDxf } from '../dxf'
import { readLandXml } from '../landxml'
import { readPointsCsv } from '../pointsCsv'
import { analyzeLayers, buildSurvey, guessRoles } from '../survey'
import { buildTerrain, SPOT_REACH, SPOT_TOLERANCE } from '../terrain'
import { plane, planeSurvey, point } from './fixtures'

/** The plane block with one spot level sitting `bump` metres above the contours around it. */
function bumpedSurvey(bump: number) {
  const text = planeSurvey().replace('0\nENDSEC\n0\nEOF', `${point('SPOTS', [1012, 1020, plane(12, 20) + bump])}\n0\nENDSEC\n0\nEOF`)
  const doc = parseDxf(text)
  return buildSurvey(doc, guessRoles(analyzeLayers(doc)))
}

describe('spot levels the smoothing pulls away from', () => {
  it('a spot missed by more than 50 mm is set to the average of the survey and the smoothed ground', () => {
    const survey = bumpedSurvey(0.4)
    const s = survey.levels.find(p => Math.abs(p.z - (plane(12, 20) + 0.4)) < 1e-9)!
    const smoothed = buildTerrain(survey, { honourSpots: false }).grid.sample(s.x, s.y)
    const honoured = buildTerrain(survey).grid.sample(s.x, s.y)
    expect(Math.abs(smoothed - s.z)).toBeGreaterThan(SPOT_TOLERANCE)
    expect(honoured).toBeCloseTo((smoothed + s.z) / 2, 3)
  })

  it('blends the change out smoothly and leaves the ground further away alone', () => {
    const survey = bumpedSurvey(0.4)
    const s = survey.levels.find(p => Math.abs(p.z - (plane(12, 20) + 0.4)) < 1e-9)!
    const a = buildTerrain(survey, { honourSpots: false }).grid
    const b = buildTerrain(survey).grid
    // Nothing moves past the blend distance.
    for (const [dx, dy] of [[SPOT_REACH + 0.3, 0], [0, -(SPOT_REACH + 0.3)], [-(SPOT_REACH + 0.5), SPOT_REACH]]) {
      expect(b.sample(s.x + dx, s.y + dy)).toBeCloseTo(a.sample(s.x + dx, s.y + dy), 6)
    }
    // And the change falls away steadily from the spot: no step.
    let last = Infinity
    for (let d = 0; d <= SPOT_REACH; d += 0.25) {
      const lift = b.sample(s.x + d, s.y) - a.sample(s.x + d, s.y)
      expect(lift).toBeLessThanOrEqual(last + 1e-6)
      expect(lift).toBeGreaterThanOrEqual(-1e-6)
      last = lift
    }
  })

  it('a spot already within 50 mm is left as it is', () => {
    const survey = bumpedSurvey(0)
    const a = buildTerrain(survey, { honourSpots: false }).grid
    const b = buildTerrain(survey).grid
    expect(Array.from(b.z)).toEqual(Array.from(a.z))
  })
})

describe('Steepest', () => {
  const sample = (n: string) => readFileSync(new URL(`../../../samples/${n}`, import.meta.url), 'utf8')
  const fromRecord = (r: { dxfText: string; roles: Parameters<typeof buildSurvey>[1] }) => buildSurvey(parseDxf(r.dxfText), r.roles)
  const steepest = (s: ReturnType<typeof buildSurvey>, honourSpots = true) => buildTerrain(s, { honourSpots }).stats.maxSlopePct

  it('reads about the same for the same ground from a DXF, a points CSV and LandXML', () => {
    const doc = parseDxf(sample('sample-block.dxf'))
    const dxf = steepest(buildSurvey(doc, guessRoles(analyzeLayers(doc))))
    const csv = steepest(fromRecord(readPointsCsv('sample-block.csv', sample('sample-block.csv'))))
    const xml = steepest(fromRecord(readLandXml('sample-block.xml', sample('sample-block.xml'))))
    // The sample block is a steady fall of about 18%; a single-cell spike along the edge of the
    // CSV's scattered points used to read 56%.
    expect(Math.abs(csv - dxf)).toBeLessThan(5)
    expect(Math.abs(xml - dxf)).toBeLessThan(5)
  })

  it('one spot level pinned back into the ground barely moves it', () => {
    const survey = bumpedSurvey(0.4)
    expect(Math.abs(steepest(survey) - steepest(survey, false))).toBeLessThan(2)
  })
})
