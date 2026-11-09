import { describe, expect, it } from 'vitest'
import { parseDxf } from '../dxf'
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
