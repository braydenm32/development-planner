import { describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { evaluateEarthworks, prepareEarthworks } from '../../lib/earthworks'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { buildingOutline, planarFaces } from '../../plan/geometry'
import { driveGround, drivewayPlatforms } from '../../plan/driveway'
import { earthworksOf, type DriveLevels, type Plan } from '../../plan/model'
import { earthworksPlatforms } from '../../plan/platforms'
import { setbackDims } from '../../plan/setbacks'
import { planSetPdf, type PlanSetInput } from '../plans'

// The synthetic tilted-plane block, with the garage floor set square on it and a 5 m by 10 m drive
// running north from the garage door to the street.
function setup(drive?: DriveLevels, garageDoor = true) {
  const survey = buildSurvey(parseDxf(planeSurvey()), guessRoles(analyzeLayers(parseDxf(planeSurvey()))))
  const terrain = buildTerrain(survey)
  const base = garageFloor()
  const plan: Plan = {
    ...base,
    placement: { e: 1006, n: 1004, rotation: 0, ffl: 84 },
    openings: base.openings.map(o => (o.id === 'garage_door' && garageDoor ? { ...o, kind: 'garage' as const } : o)),
    areas: [
      {
        id: 'drive',
        level: 'level_ground',
        name: 'Driveway',
        kind: 'driveway',
        pts: [
          [1, 10.113],
          [6, 10.113],
          [6, 20.113],
          [1, 20.113],
        ],
        ...(drive ? { drive } : {}),
      },
    ],
  }
  // The cut and fill, with the drive graded in once it has levels, as the app works it out.
  const platforms = [...earthworksPlatforms(plan, survey.origin), ...drivewayPlatforms(plan, survey.origin, survey.boundary)]
  const prep = prepareEarthworks(terrain.grid, survey.boundary, platforms, earthworksOf(plan))
  const result = evaluateEarthworks(prep)
  const input: PlanSetInput = {
    plan,
    survey,
    siteArea: terrain.stats.area,
    earthworks: { cut: result.cut, fill: result.fill },
    up: 0,
    paper: 'A3',
    title: 'Test',
    date: '8 November 2026',
    ground: result.grid,
    drive: driveGround({ prep, result }, terrain.grid),
  }
  return { input, survey, plan, result }
}

const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

describe('PDF site plan', () => {
  it('writes the same setbacks as the plan, in whole millimetres', () => {
    const { input, survey, plan } = setup()
    const pdf = text(planSetPdf(input))
    const rings = buildingOutline(planarFaces(plan.walls)).outlines
    const dims = setbackDims(rings, plan.placement, survey)
    expect(dims.length).toBeGreaterThan(0)
    for (const d of dims.filter(x => x.dist > 2)) expect(pdf, d.name).toContain(`(${d.text}) Tj`)
  })

  it('writes the driveway’s own levels and its grade between them', () => {
    // Street RL 85.50, garage slab RL 84.00 (FFL), 10 m apart: 1.50 / 10 = 0.15, 1 in 6.7, 15%.
    const pdf = text(planSetPdf(setup({ street: { rl: 85.5, from: 'typed' }, garage: 'slab' }).input))
    expect(pdf).toContain('(Driveway, street to garage) Tj')
    expect(pdf).toContain('(RL 85.50 to 84.00) Tj')
    expect(pdf).toContain('(1 in 6.7 \\(15%\\)) Tj')
  })

  it('says when the drive is steeper than 1 in 4', () => {
    // Street RL 81.00 to the slab at 84.00 over 10 m: 0.3, 1 in 3.3.
    const pdf = text(planSetPdf(setup({ street: { rl: 81, from: 'typed' }, garage: 'slab' }).input))
    expect(pdf).toContain('(1 in 3.3 \\(30%\\), too steep: over 1 in 4) Tj')
  })

  it('puts the graded drive into the cut and fill it reports', () => {
    // The same ground cut and filled with and without the drive's levels: the volumes differ.
    const flat = setup()
    const levelled = setup({ street: { rl: 85.5, from: 'typed' }, garage: 'slab' })
    expect(levelled.result.cut + levelled.result.fill).not.toBeCloseTo(flat.result.cut + flat.result.fill, 1)
    const pdf = text(planSetPdf(levelled.input))
    expect(pdf).toContain(`(${levelled.result.cut.toFixed(1)} / ${levelled.result.fill.toFixed(1)} m`)
  })

  it('keeps the ground’s grade for a drive with no levels of its own', () => {
    const pdf = text(planSetPdf(setup().input))
    expect(pdf).toContain('(Average grade along the drive) Tj')
    expect(pdf).not.toContain('(Driveway, street to garage) Tj')
  })
})

describe('PDF floor plan', () => {
  it('draws a garage door’s panel dashed across the opening', () => {
    // The dash is 1.6 mm on, 0.7 mm off: 4.54 and 1.98 points.
    const dash = '[4.54 1.98] 0 d'
    expect(text(planSetPdf(setup(undefined, true).input))).toContain(dash)
    expect(text(planSetPdf(setup(undefined, false).input))).not.toContain(dash)
  })
})
