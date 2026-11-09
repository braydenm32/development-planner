// The made-up survey (samples/sample-block.dxf) with the made-up garage floor on it, and the plan
// changes the council tests try on it: a second or third storey, retaining walls, a big box.

import { readFileSync } from 'node:fs'
import { parseDxf } from '../../lib/dxf'
import { evaluateEarthworks, prepareEarthworks } from '../../lib/earthworks'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { earthworksOf, normalizePlan, type Plan, type Wall } from '../../plan/model'
import { earthworksBarriers, earthworksPlatforms } from '../../plan/platforms'
import { measure, type Measures } from '../measure'
import type { CheckSettings, CheckTree } from '../types'

const SAMPLE_DXF = new URL('../../../samples/sample-block.dxf', import.meta.url)
export const PLACEMENT = { e: 5006, n: 8004, rotation: 0, ffl: 45.5 }

export function site() {
  const doc = parseDxf(readFileSync(SAMPLE_DXF, 'utf8'))
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  return { survey, terrain: buildTerrain(survey) }
}

export const L0 = 'level_ground'
const L1 = 'level_1'

/** The garage floor with a first floor over its eastern half, as a second storey. */
export function twoStorey(p: Plan, height = 2.7): Plan {
  const up = (id: string, a: [number, number], b: [number, number]): Wall => ({ id, level: L1, a, b, thickness: 0.3, kind: 'external' })
  return {
    ...p,
    levels: [...p.levels.map(l => ({ ...l, height })), { id: L1, name: 'First floor', elevation: height + 0.3, height }],
    walls: [...p.walls, up('u_s', [5.45, 0.15], [9.95, 0.15]), up('u_e', [9.95, 0.15], [9.95, 13.85]), up('u_n', [9.95, 13.85], [5.45, 13.85]), up('u_w', [5.45, 13.85], [5.45, 0.15])],
  }
}

/** Retaining walls: one just inside the west boundary, one well clear of it, each holding back the house pad. */
export function withRetaining(p: Plan): Plan {
  const rw = (id: string, a: [number, number], b: [number, number]): Wall => ({ id, level: L0, a, b, thickness: 0.2, kind: 'retaining', retain: { high: 'right', lowLevel: 'pad' } })
  return { ...p, walls: [...p.walls, rw('rw_west', [-5.2, -2], [-5.2, 12]), rw('rw_south', [-1, -1.5], [11, -1.5])] }
}

/** The garage floor with two more levels stacked over its study and laundry: three storeys. */
export function threeStorey(p: Plan): Plan {
  const box = (level: string, x0: number, y0: number, x1: number, y1: number): Wall[] =>
    [
      [[x0, y0], [x1, y0]],
      [[x1, y0], [x1, y1]],
      [[x1, y1], [x0, y1]],
      [[x0, y1], [x0, y0]],
    ].map(([a, b], i) => ({ id: `${level}_${i}`, level, a: a as [number, number], b: b as [number, number], thickness: 0.3, kind: 'external' }))
  return {
    ...p,
    levels: [...p.levels, { id: L1, name: 'First floor', elevation: 3, height: 2.7 }, { id: 'level_2', name: 'Second floor', elevation: 6, height: 2.7 }],
    walls: [...p.walls, ...box(L1, 5.45, 0.15, 9.95, 4.345), ...box('level_2', 5.45, 0.15, 9.95, 4.345)],
  }
}

/** A 20 m × 22 m single-storey box, bigger than half the lot. */
export const bigBox = (p: Plan): Plan => ({
  ...p,
  walls: [
    { id: 'b_s', level: L0, a: [0, 0], b: [20, 0], thickness: 0.3, kind: 'external' },
    { id: 'b_e', level: L0, a: [20, 0], b: [20, 22], thickness: 0.3, kind: 'external' },
    { id: 'b_n', level: L0, a: [20, 22], b: [0, 22], thickness: 0.3, kind: 'external' },
    { id: 'b_w', level: L0, a: [0, 22], b: [0, 0], thickness: 0.3, kind: 'external' },
  ],
  rooms: [{ id: 'r', level: L0, name: 'Big', at: [10, 10] }],
  areas: [],
  placement: { ...PLACEMENT, e: 5002, n: 8003 },
})

export interface Scenario {
  checks: Partial<CheckSettings>
  plan?: (p: Plan) => Plan
  earth?: { cutBatter: number; fillBatter: number }
  trees?: CheckTree[]
}

/** The measures of the sample house on the sample block, changed as the scenario says, on the DA route. */
export function measureSample(sc: Scenario, s = site()): Measures {
  const base = normalizePlan({ ...garageFloor(), name: 'Sample house', placement: PLACEMENT })
  let plan: Plan = { ...(sc.plan ? sc.plan(base) : base), checks: { pathway: 'da', battleAxe: false, councils: { wollongong: true }, ...sc.checks } }
  if (sc.earth) plan = { ...plan, earthworks: { ...earthworksOf(plan), margin: 0.5, ...sc.earth } }
  let earth = null
  if (sc.earth) {
    const platforms = earthworksPlatforms(plan, s.survey.origin)
    const prep = prepareEarthworks(s.terrain.grid, s.survey.boundary, platforms, earthworksOf(plan), earthworksBarriers(plan, s.survey.origin))
    earth = { prep, result: evaluateEarthworks(prep), platforms }
  }
  return measure({ plan, survey: s.survey, terrain: s.terrain, earth, trees: sc.trees ?? [] })
}
