// The Wollongong checks give the same findings now that the council's rules are a data table
// (src/checks/councils/wollongong.ts) as they did when the numbers lived in rules.ts. The
// expected findings in wollongong-findings.json were saved from the code before the move, on the
// made-up survey (samples/sample-block.dxf) with the made-up garage floor on it, across lot facts
// that reach every branch the old code had: no front, a front, battle-axe, title area, map values,
// two storeys, a tall house, cut and fill at 1 in 2 and 1 in 4, retaining walls and trees.
//
// A change that is meant to change what the checks say updates the saved copy on purpose:
//   npx vitest run -u src/checks/__tests__/findings.test.ts
// and the diff of wollongong-findings.json shows exactly what changed.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { evaluateEarthworks, prepareEarthworks } from '../../lib/earthworks'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { earthworksOf, normalizePlan, type Plan, type Wall } from '../../plan/model'
import { earthworksBarriers, earthworksPlatforms } from '../../plan/platforms'
import { measure } from '../measure'
import { runChecks } from '../rules'
import type { CheckResult, CheckSettings, CheckTree } from '../types'

const SAMPLE_DXF = new URL('../../../samples/sample-block.dxf', import.meta.url)
const PLACEMENT = { e: 5006, n: 8004, rotation: 0, ffl: 45.5 }

function site() {
  const doc = parseDxf(readFileSync(SAMPLE_DXF, 'utf8'))
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  return { survey, terrain: buildTerrain(survey) }
}

const L0 = 'level_ground'
const L1 = 'level_1'

/** The garage floor with a first floor over its eastern half, as a second storey. */
function twoStorey(p: Plan, height = 2.7): Plan {
  const up = (id: string, a: [number, number], b: [number, number]): Wall => ({ id, level: L1, a, b, thickness: 0.3, kind: 'external' })
  return {
    ...p,
    levels: [...p.levels.map(l => ({ ...l, height })), { id: L1, name: 'First floor', elevation: height + 0.3, height }],
    walls: [...p.walls, up('u_s', [5.45, 0.15], [9.95, 0.15]), up('u_e', [9.95, 0.15], [9.95, 13.85]), up('u_n', [9.95, 13.85], [5.45, 13.85]), up('u_w', [5.45, 13.85], [5.45, 0.15])],
  }
}

/** Retaining walls: one just inside the west boundary, one well clear of it, each holding back the house pad. */
function withRetaining(p: Plan): Plan {
  const rw = (id: string, a: [number, number], b: [number, number]): Wall => ({ id, level: L0, a, b, thickness: 0.2, kind: 'retaining', retain: { high: 'right', lowLevel: 'pad' } })
  return { ...p, walls: [...p.walls, rw('rw_west', [-5.2, -2], [-5.2, 12]), rw('rw_south', [-1, -1.5], [11, -1.5])] }
}

/** The garage floor with two more levels stacked over its study and laundry: three storeys. */
function threeStorey(p: Plan): Plan {
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
const bigBox = (p: Plan): Plan => ({
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

const TREES: CheckTree[] = [
  { id: 'kept-near', label: 'T1', at: [18, 12], trunk: 0.5, height: 12, remove: false },
  { id: 'kept-far', label: 'T2', at: [20, 30], trunk: 0.3, height: 6, remove: false },
  { id: 'gone-near', label: 'T3', at: [5, 3], trunk: 0.4, height: 6, remove: true },
  { id: 'gone-far', label: 'T4', at: [3, 28], trunk: 0.6, height: 14, remove: true },
  { id: 'next-door', label: 'T5', at: [26, 10], trunk: 0.5, height: 10, remove: false, neighbour: true },
]

interface Scenario {
  name: string
  checks: Partial<CheckSettings>
  plan?: (p: Plan) => Plan
  earth?: { cutBatter: number; fillBatter: number }
  trees?: boolean
}

const SCENARIOS: Scenario[] = [
  { name: 'no front picked', checks: {} },
  { name: 'front to the south', checks: { frontEdge: 0 } },
  { name: 'front to the north, rear set to the east', checks: { frontEdge: 2, rearEdge: 1 } },
  { name: 'cut and fill at 1 in 2', checks: { frontEdge: 0 }, earth: { cutBatter: 2, fillBatter: 2 } },
  { name: 'cut and fill at 1 in 4', checks: { frontEdge: 0 }, earth: { cutBatter: 4, fillBatter: 4 } },
  { name: 'battle-axe with title area and map values', checks: { frontEdge: 0, battleAxe: true, titleArea: 900, lepHeight: 8.5, lepFsr: 0.5 } },
  { name: 'battle-axe without a title area', checks: { frontEdge: 0, battleAxe: true, lepFsr: 0.3 } },
  { name: 'battle-axe, no front picked', checks: { battleAxe: true } },
  { name: 'lot width set', checks: { frontEdge: 0, lotWidth: 23 } },
  { name: 'two storeys', checks: { frontEdge: 0 }, plan: p => twoStorey(p) },
  { name: 'two storeys on a battle-axe lot', checks: { frontEdge: 0, battleAxe: true, titleArea: 860 }, plan: p => twoStorey(p) },
  { name: 'two storeys, no front picked', checks: {}, plan: p => twoStorey(p) },
  { name: 'a tall two-storey house', checks: { frontEdge: 0, lepHeight: 12 }, plan: p => twoStorey(p, 3.6) },
  { name: 'a tall house, no front picked', checks: {}, plan: p => twoStorey(p, 3.6) },
  { name: 'retaining walls', checks: { frontEdge: 0 }, plan: withRetaining, earth: { cutBatter: 2, fillBatter: 2 } },
  { name: 'trees', checks: { frontEdge: 0 }, trees: true },
  { name: 'trees with cut and fill', checks: { frontEdge: 0 }, trees: true, earth: { cutBatter: 4, fillBatter: 4 } },
  { name: 'no house', checks: { frontEdge: 0 }, plan: p => ({ ...p, walls: [], rooms: [], areas: [] }) },
  { name: 'over the map height', checks: { frontEdge: 0, lepHeight: 3 } },
  { name: 'close to the west side', checks: { frontEdge: 0 }, plan: p => ({ ...p, placement: { ...PLACEMENT, e: 5000.4 } }) },
  { name: 'close to the west side, no front picked', checks: {}, plan: p => ({ ...p, placement: { ...PLACEMENT, e: 5000.4 } }) },
  { name: 'three storeys', checks: { frontEdge: 0 }, plan: threeStorey },
  { name: 'three storeys on a battle-axe lot', checks: { frontEdge: 0, battleAxe: true }, plan: threeStorey },
  { name: 'a big house', checks: { frontEdge: 0 }, plan: bigBox },
  { name: 'a big house on a bigger title', checks: { frontEdge: 0, battleAxe: true, titleArea: 890 }, plan: bigBox },
  { name: 'a big house on a much bigger title', checks: { frontEdge: 0, battleAxe: true, titleArea: 1200, lepFsr: 0.5 }, plan: bigBox },
  {
    name: 'paved over',
    checks: { frontEdge: 0, titleArea: 860 },
    plan: p => ({ ...p, areas: [...p.areas, { id: 'pave', level: L0, name: 'Paving', pts: [[-6, -4], [18, -4], [18, 29], [-6, 29]] }] }),
  },
  {
    name: 'a retaining wall that follows the ground',
    checks: { frontEdge: 0 },
    plan: p => ({ ...p, walls: [...p.walls, { id: 'rw', level: L0, a: [12, -1], b: [12, 12], thickness: 0.2, kind: 'retaining' }] }),
  },
]

/** Both pathways' findings for each scenario, with Wollongong's rules on. */
function findings(): Record<string, { da: CheckResult[]; cdc: CheckResult[] }> {
  const { survey, terrain } = site()
  const out: Record<string, { da: CheckResult[]; cdc: CheckResult[] }> = {}
  for (const sc of SCENARIOS) {
    const base = normalizePlan({ ...garageFloor(), name: 'Sample house', placement: PLACEMENT })
    let plan: Plan = { ...(sc.plan ? sc.plan(base) : base), checks: { pathway: 'da', battleAxe: false, councils: { wollongong: true }, ...sc.checks } }
    if (sc.earth) plan = { ...plan, earthworks: { ...earthworksOf(plan), margin: 0.5, ...sc.earth } }
    let earth = null
    if (sc.earth) {
      const platforms = earthworksPlatforms(plan, survey.origin)
      const prep = prepareEarthworks(terrain.grid, survey.boundary, platforms, earthworksOf(plan), earthworksBarriers(plan, survey.origin))
      earth = { prep, result: evaluateEarthworks(prep), platforms }
    }
    const ms = measure({ plan, survey, terrain, earth, trees: sc.trees ? TREES : [] })
    // Through JSON, as the saved copy was, so a missing field and an undefined one compare the same.
    out[sc.name] = JSON.parse(JSON.stringify({ da: runChecks(ms, 'da', 'wollongong'), cdc: runChecks(ms, 'cdc') }))
  }
  return out
}

describe('Wollongong findings from the data table', () => {
  it('match the findings saved from the code before the rules became data', async () => {
    await expect(`${JSON.stringify(findings(), null, 1)}\n`).toMatchFileSnapshot('./wollongong-findings.json')
  })
})
