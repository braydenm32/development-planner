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

import { describe, expect, it } from 'vitest'
import { runChecks } from '../rules'
import type { Plan } from '../../plan/model'
import type { CheckResult, CheckSettings, CheckTree } from '../types'
import { bigBox, L0, measureSample, PLACEMENT, site, threeStorey, twoStorey, withRetaining } from './sample'

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
  const s = site()
  const out: Record<string, { da: CheckResult[]; cdc: CheckResult[] }> = {}
  for (const sc of SCENARIOS) {
    const ms = measureSample({ ...sc, trees: sc.trees ? TREES : [] }, s)
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
